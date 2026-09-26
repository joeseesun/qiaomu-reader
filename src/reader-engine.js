import { HIGHLIGHT_PAINTS } from "./highlight-colors.js";
import { createBookCover, isGeneratedBookCover } from "./book-cover.js";
import { waitForEngineViewport } from "./engine-viewport.js";
export { HIGHLIGHT_PAINTS } from "./highlight-colors.js";
// Qiaomu Reader — e-book rendering engine.
//
// A thin adapter over foliate-js (MIT, https://github.com/johnfactotum/foliate-js)
// exposing the small interface the reader view needs: open a book from bytes,
// page through it, paint coloured highlights by CFI, search the book, and
// report progress. Pagination, layout and format handling belong to the
// library; nothing here knows how a book is laid out.
//
// The library sniffs the container format from the bytes themselves, so one
// engine serves every format it supports: EPUB, MOBI/AZW/AZW3, FB2 (plain or
// zipped) and CBZ. PDF is rendered by the plugin's dedicated pdf.js path and
// never reaches this engine.
//
// The view attaches per-section behaviour (selection popups, footnotes) via
// the onDocLoaded hook: every iframe document the engine renders passes
// through there exactly once.

import { makeBook } from "foliate-js/view.js";
import { Overlayer } from "foliate-js/overlayer.js";
import { searchMatcher } from "foliate-js/search.js";
import { textWalker } from "foliate-js/text-walker.js";

// Every extension this engine can open; the plugin registers all of them.
export const ENGINE_EXTENSIONS = ["epub", "fb2", "fbz", "mobi", "azw", "azw3", "cbz"];

// Wire format the library paints with a neutral outline; anything carrying
// this prefix in its CFI value is treated as a search hit, not a highlight.
export const SEARCH_PREFIX = "foliate-search:";

// The production build scopes the library's registrations and this tag
// together. Direct module tests retain the upstream tag.
const VIEW_TAG = typeof __QBR_ENGINE_VIEW_TAG__ === "string" ? __QBR_ENGINE_VIEW_TAG__ : "foliate-view";

export function engineLayout(settings = {}, width = 0) {
    const columns = settings.columns === "1" || width <= 700 ? 1 : 2;
    return {
        flow: settings.readMode === "scroll" ? "scrolled" : "paginated",
        "max-column-count": String(columns),
        "max-inline-size": `${Math.max(1, Math.min(720, Math.floor(width / columns)))}px`,
    };
}

export function bindEngineKeys(doc, navigate, scrolled = () => false) {
    const keydown = (event) => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = event.target;
        if (target?.isContentEditable || target?.closest?.("input,textarea,select,[contenteditable=true]")) return;
        if (scrolled() && ["ArrowUp", "ArrowDown", " "].includes(event.key)) return;
        const direction = ["ArrowRight", "ArrowDown", " ", "PageDown"].includes(event.key) ? "next"
            : ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) ? "prev" : null;
        if (!direction) return;
        event.preventDefault();
        navigate(direction);
    };
    doc.addEventListener("keydown", keydown);
    return () => doc.removeEventListener("keydown", keydown);
}

function disposeEngineView(view) {
    if (!view) return;
    const book = view.book;
    try { view.close(); } catch { /* partial opens may not have a renderer yet */ }
    try { book?.destroy?.(); } finally { view.book = null; view.remove(); }
}

// Foliate may resolve an obsolete CFI to an out-of-range section and return
// successfully without loading a document. Treat rendered content plus a
// location as the completion contract, not just a resolved init() promise.
export async function restoreEngineLocation(view, opts = {}, isCurrent = () => true) {
    const assertCurrent = () => {
        if (!isCurrent()) throw Object.assign(new Error("Reader closed"), { name: "AbortError" });
    };
    const rendered = () => !!view.lastLocation && !!view.renderer?.getContents?.().some(({ doc }) => doc);
    const fraction = typeof opts.initialFraction === "number" && Number.isFinite(opts.initialFraction)
        ? Math.max(0, Math.min(1, opts.initialFraction)) : null;
    const attempt = async (navigate) => {
        assertCurrent();
        try { await navigate(); }
        catch (error) { if (error?.name === "AbortError") throw error; }
        assertCurrent();
        return rendered();
    };
    if (await attempt(() => view.init({ lastLocation: opts.initialCfi || (fraction === null ? undefined : { fraction }) }))) return;
    if (fraction !== null && await attempt(() => view.goToFraction(fraction))) return;
    // Use an explicit chapter target: next() can be a no-op while a newly
    // created Obsidian tab is still hidden and has zero layout dimensions.
    if (await attempt(() => view.goToTextStart())) return;
    throw new Error("Could not load a readable book location");
}

export class EpubEngine {
    #host;
    #hooks;
    #view = null;
    #book = null;
    #highlights = new Map();
    #idByCfi = new Map();
    #searchHits = [];
    #extraCss = "";
    #lastRange = null;
    #searchGeneration = 0;
    #layout = {};
    #resizeObserver = null;
    #resizeFrame = null;
    #keyCleanup = null;
    #openController = null;

    constructor(container, hooks = {}) {
        this.#host = container;
        this.#hooks = hooks;
        // Set before open(): every section document the library renders during
        // open()/init() must already carry the reader's appearance.
        if (typeof hooks.initialCss === "string") this.#extraCss = hooks.initialCss;
        this.#layout = hooks.layout || {};
    }

    async open(bytes, fileName, opts = {}) {
        // Reusing an adapter must release its previous parser and observers.
        this.destroy();
        const controller = this.#openController = new AbortController();
        // Format is sniffed from the bytes by the library, not from the name.
        const file = new File([bytes], fileName);
        const view = document.createElement(VIEW_TAG);
        this.#view = view;
        this.#host.replaceChildren(view);
        view.addEventListener("relocate", (e) => {
            if (this.#view !== view) return;
            const detail = e.detail || {};
            this.#lastRange = detail.range || null;
            this.#hooks.onRelocate?.(detail);
        });
        // The view re-emits every section document after the library has
        // prepared it; attaching here (not on the raw renderer) is safe because
        // the renderer object only comes into existence inside view.open().
        view.addEventListener("load", (e) => {
            if (this.#view !== view) return;
            const { doc, index } = e.detail || {};
            if (!doc) return;
            this.#keyCleanup?.();
            this.#keyCleanup = bindEngineKeys(doc, (direction) => {
                if (this.#hooks.onNavigate) this.#hooks.onNavigate(direction);
                else void this[direction]().catch(error => console.warn("Qiaomu Reader: page turn failed", error));
            }, () => this.#layout.readMode === "scroll");
            if (this.#extraCss) this.#injectCss(doc, this.#extraCss);
            this.#hooks.onDocLoaded?.({ doc, index });
        });
        view.addEventListener("draw-annotation", (e) => {
            const { draw, annotation } = e.detail;
            if (typeof annotation?.colorId === "string" && HIGHLIGHT_PAINTS[annotation.colorId])
                draw((rects, options) => {
                    const shape = Overlayer.highlight(rects, options);
                    // Palette alpha already defines opacity. Foliate's extra
                    // 0.3 would make book colors differ from note highlights.
                    shape.style.removeProperty("opacity");
                    return shape;
                }, { color: HIGHLIGHT_PAINTS[annotation.colorId] });
            else draw(Overlayer.outline);
        });
        view.addEventListener("show-annotation", (e) => {
            const { value, index, range } = e.detail || {};
            const hit = this.#highlights.get(this.#idByCfi.get(value));
            if (hit) this.#hooks.onHighlightClick?.({ ...hit, index, range });
        });
        try {
            await view.open(file);
            if (this.#view !== view) throw Object.assign(new Error("Reader closed"), { name: "AbortError" });
            await waitForEngineViewport(this.#host, controller.signal);
            if (this.#view !== view) throw Object.assign(new Error("Reader closed"), { name: "AbortError" });
        } catch (error) {
            disposeEngineView(view);
            if (this.#view === view) this.#view = null;
            throw error;
        }
        this.#book = view.book;
        this.setLayout(this.#layout);
        view.renderer?.setStyles?.(this.#extraCss);
        const Resize = this.#host.ownerDocument.defaultView?.ResizeObserver;
        if (Resize) {
            this.#resizeObserver = new Resize(() => {
                if (this.#resizeFrame !== null) return;
                this.#resizeFrame = this.#host.ownerDocument.defaultView.requestAnimationFrame(() => {
                    this.#resizeFrame = null;
                    if (this.#view) this.setLayout(this.#layout);
                });
            });
            this.#resizeObserver.observe(this.#host);
        }
        try {
            await restoreEngineLocation(view, opts, () => this.#view === view);
        } catch (error) {
            if (this.#view === view) this.destroy();
            throw error;
        }
        if (this.#view !== view) {
            disposeEngineView(view);
            throw Object.assign(new Error("Reader closed"), { name: "AbortError" });
        }
        return this;
    }

    destroy() {
        this.#openController?.abort(); this.#openController = null;
        this.#searchGeneration++;
        this.#resizeObserver?.disconnect(); this.#resizeObserver = null;
        this.#host.ownerDocument.defaultView?.cancelAnimationFrame?.(this.#resizeFrame);
        this.#resizeFrame = null;
        this.#keyCleanup?.(); this.#keyCleanup = null;
        const view = this.#view;
        this.#view = null;
        this.#book = null;
        this.#highlights.clear();
        this.#idByCfi.clear();
        this.#searchHits = [];
        this.#lastRange = null;
        disposeEngineView(view);
    }

    // ── presentation ────────────────────────────────────────────────────────
    // extraCss travels into every rendered iframe document; the plugin uses it
    // for @font-face (the bundled reading font lives in the plugin's own
    // document, which iframes cannot see) and reader-scoped overrides.
    setExtraCss(css) {
        this.#extraCss = String(css || "");
        for (const { doc } of this.contents()) {
            doc.querySelectorAll?.('style[data-qbr-engine]')?.forEach?.((el) => el.remove());
            if (this.#extraCss) this.#injectCss(doc, this.#extraCss);
        }
        // Foliate paints the page margins in a separate background layer.
        // Its style API refreshes that layer as well as the section document.
        this.#view?.renderer?.setStyles?.(this.#extraCss);
    }

    #injectCss(doc, css) {
        const head = doc.head || doc.documentElement;
        if (!head) return;
        const style = doc.createElement("style");
        style.setAttribute("data-qbr-engine", "");
        style.textContent = css;
        head.appendChild(style);
    }

    contents() {
        return this.#view?.renderer?.getContents() ?? [];
    }

    // ── navigation ──────────────────────────────────────────────────────────
    async next(distance) { await this.#view?.next(distance); }
    async prev(distance) { await this.#view?.prev(distance); }
    async goTo(target) {
        const view = this.#view;
        const fail = () => new Error("Could not navigate to book location");
        if (!view) throw fail();
        const destination = view.resolveNavigation(target);
        if (!Number.isInteger(destination?.index) || destination.index < 0 || destination.index >= this.#book.sections.length) throw fail();
        const resolved = await view.goTo(target);
        if (this.#view !== view) throw Object.assign(new Error("Reader closed"), { name: "AbortError" });
        // Foliate can silently ignore an invalid or locked destination.
        const contents = view.renderer?.getContents?.() || [];
        if (!resolved || !contents.some(({ doc, index }) => doc && (view.isFixedLayout || index === destination.index))) throw fail();
        return resolved;
    }
    async goToFraction(fraction) {
        if (!Number.isFinite(fraction)) throw new Error("Could not navigate to book location");
        return this.goTo({ fraction: Math.max(0, Math.min(1, fraction)) });
    }
    async goToTocItem(item) { return this.goTo(item?.href ?? item); }

    currentLocation() {
        return this.#view?.lastLocation ?? null;
    }

    // CFI for a DOM range inside a rendered section document — used by the
    // reader's selection handling when creating highlights.
    cfiFromRange(index, range) {
        return this.#view ? this.#view.getCFI(index, range) : null;
    }

    // Text of the visible page, for AI context and the copy helpers. The
    // relocate event carries the range the renderer considers visible.
    visibleText() {
        return this.#lastRange ? this.#lastRange.toString() : "";
    }

    setLayout(settings) {
        this.#layout = { columns: settings.columns, readMode: settings.readMode };
        const renderer = this.#view?.renderer;
        const width = this.#host.clientWidth;
        if (!renderer || this.#view.isFixedLayout || !width || !this.#host.clientHeight) return;
        for (const [name, value] of Object.entries(engineLayout(this.#layout, width))) {
            if (renderer.getAttribute(name) !== value) renderer.setAttribute(name, value);
        }
    }

    toc() {
        return this.#book?.toc ?? [];
    }

    metadata() {
        const m = this.#book?.metadata ?? {};
        return { title: m.title ?? "", author: m.author ?? "" };
    }

    // ── highlights ──────────────────────────────────────────────────────────
    // id is the caller's stable key (the reading-note anchor id); the engine
    // only maps it to the CFI range it is asked to paint.
    async addHighlight(id, cfiRange, colorId) {
        if (!this.#view || !cfiRange) return;
        const annotation = { id, value: cfiRange, colorId };
        this.#highlights.set(id, annotation);
        this.#idByCfi.set(cfiRange, id);
        await this.#view.addAnnotation(annotation);
    }

    async removeHighlight(id) {
        const annotation = this.#highlights.get(id);
        if (!annotation) return;
        this.#highlights.delete(id);
        this.#idByCfi.delete(annotation.value);
        await this.#view.deleteAnnotation(annotation);
    }

    async clearHighlights() {
        for (const annotation of this.#highlights.values()) {
            try { await this.#view.deleteAnnotation(annotation); } catch { /* section may be gone */ }
        }
        this.#highlights.clear();
        this.#idByCfi.clear();
    }

    highlightAt(cfiRange) {
        const id = this.#idByCfi.get(cfiRange);
        return id ? this.#highlights.get(id) : null;
    }

    // ── search ──────────────────────────────────────────────────────────────
    // Yields hits across the whole book, section by section, starting at
    // fromIndex. Each hit is painted with the library's outline style and can
    // be jumped to by CFI.
    async *search(query, opts = {}) {
        if (!this.#view || !query) return;
        const view = this.#view;
        const paint = opts.paint !== false;
        const clearing = paint ? this.clearSearchHits() : Promise.resolve();
        const generation = this.#searchGeneration;
        await clearing;
        const current = () => this.#view === view && !opts.signal?.aborted && (!paint || generation === this.#searchGeneration);
        let count = 0;
        const limit = Math.min(300, Math.max(1, opts.limit || 300));
        if (!current()) return;
        const match = searchMatcher(textWalker, {
            defaultLocale: this.#book?.metadata?.language,
            matchCase: !!opts.matchCase,
            matchDiacritics: !!opts.matchDiacritics,
            matchWholeWords: !!opts.matchWholeWords,
        });
        const sections = this.#book.sections ?? [];
        for (let index = opts.fromIndex ?? 0; index < sections.length; index++) {
            const createDocument = sections[index]?.createDocument;
            if (!createDocument) continue;
            const doc = await createDocument();
            if (!current()) return;
            for (const result of match(doc, String(query))) {
                if (!current()) return;
                const cfi = view.getCFI(index, result.range);
                if (paint) this.#searchHits.push(cfi);
                const { pre = "", match: found = "", post = "" } = result.excerpt;
                const hit = { cfi, index, excerpt: pre + found + post };
                if (paint) await view.addAnnotation({ value: SEARCH_PREFIX + cfi });
                if (!current()) return;
                yield hit;
                if (++count >= limit) return;
            }
        }
    }

    async clearSearchHits() {
        this.#searchGeneration++;
        const view = this.#view;
        const hits = this.#searchHits;
        this.#searchHits = [];
        for (const cfi of hits) {
            try { await view?.deleteAnnotation({ value: SEARCH_PREFIX + cfi }); } catch { /* gone */ }
        }
    }
}

// Prefer embedded artwork; otherwise create an offline metadata cover. Existing
// book bytes and reading locations stay untouched. Return a durable thumbnail Blob.
export async function coverFromBytes(bytes, fileName, resolveStarterCover) {
    const book = await makeBook(new File([bytes], fileName));
    try {
        let blob;
        try { blob = await book.getCover?.(); } catch { /* use the book's metadata */ }
        if (resolveStarterCover && (!blob || (blob.type === "image/svg+xml" && isGeneratedBookCover(await blob.text())))) {
            try { blob = await resolveStarterCover(book.metadata) || blob; }
            catch { /* keep the embedded cover or metadata fallback */ }
        }
        return blob || new Blob([createBookCover({
            title: book.metadata?.title || fileName.replace(/\.[^.]+$/, ""),
            author: book.metadata?.author,
        })], { type: "image/svg+xml" });
    } finally {
        book.destroy?.();
    }
}
