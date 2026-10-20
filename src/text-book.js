import { Lexer, Parser, getDefaults } from "marked";
import { createEngineObjectURL, revokeEngineObjectURL } from "./engine-frame.js";

export const TEXT_EXTENSIONS = ["md", "markdown", "txt", "html", "htm"];
export const isTextBook = name => TEXT_EXTENSIONS.includes(String(name).split(".").at(-1).toLowerCase());
export const isListedBook = (file, folder, selected = [], removed = []) => !removed.includes(file.path)
    && (isTextBook(file.name) ? selected.includes(file.path) : !folder || file.path.startsWith(`${folder}/`));

// BOMs are authoritative. UTF-8 is preferred; GB18030 covers common Chinese
// TXT exports. Never silently replace undecodable bytes with replacement glyphs.
export function decodeBookText(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (data.byteLength > 20 * 1024 * 1024) throw new Error("text-book-too-large");
    let encoding = data[0] === 0xff && data[1] === 0xfe ? "utf-16le"
        : data[0] === 0xfe && data[1] === 0xff ? "utf-16be" : "utf-8";
    let text;
    try { text = new TextDecoder(encoding, { fatal: true }).decode(data); }
    catch {
        if (encoding !== "utf-8") throw new Error("text-book-encoding");
        try { text = new TextDecoder("gb18030", { fatal: true }).decode(data); }
        catch { throw new Error("text-book-encoding"); }
    }
    text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    for (const char of text) {
        const n = char.charCodeAt(0);
        if (n <= 8 || (n >= 14 && n <= 31)) throw new Error("text-book-encoding");
    }
    if (!text.trim()) throw new Error("text-book-empty");
    return text;
}

const CHAPTER = /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回卷部节篇](?:\s.*|[^\s]{0,35})|(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+)\b.*|序章|序言|前言|楔子|尾声|后记)$/iu;
const SAFE_TAGS = new Set("p div span section article h1 h2 h3 h4 h5 h6 strong b em i u s del mark sub sup br hr pre code blockquote ul ol li dl dt dd table thead tbody tfoot tr th td caption a img input".split(" "));
const ATTRS = new Set(["id", "href", "src", "alt", "colspan", "rowspan", "start", "type", "checked", "align"]);
const imageURL = value => /^(?:https?:|app:|capacitor:|blob:|data:image\/(?:png|jpeg|gif|webp);)/i.test(value);
const decodeLink = value => { try { return decodeURIComponent(value); } catch { return value; } };

// Parsed content crosses into a same-origin book frame. Carry only a
// static reading snapshot, never scripts, handlers, styles, embeds or forms.
export function sanitizeTextDocument(doc, resolveResource) {
    for (const el of Array.from(doc.body.querySelectorAll("*"))) {
        const tag = el.localName;
        if (!SAFE_TAGS.has(tag)) {
            if (["script", "style", "iframe", "object", "embed", "form", "button", "textarea", "select", "svg", "math", "template", "noscript"].includes(tag)) el.remove();
            else el.replaceWith(...el.childNodes);
            continue;
        }
        const href = el.getAttribute("href");
        for (const attr of Array.from(el.attributes)) if (!ATTRS.has(attr.name)) el.removeAttribute(attr.name);
        if (el.hasAttribute("align") && !["left", "center", "right"].includes(el.getAttribute("align"))) el.removeAttribute("align");
        if (tag === "input") {
            if (el.getAttribute("type") !== "checkbox") { el.remove(); continue; }
            el.setAttribute("disabled", "");
        }
        if (tag === "img") {
            const source = el.getAttribute("src") || "";
            const resolved = imageURL(source) ? source : resolveResource?.(decodeLink(source));
            if (resolved && imageURL(resolved)) el.setAttribute("src", resolved);
            else { const fallback = doc.createElement("span"); fallback.textContent = el.getAttribute("alt") || source; el.replaceWith(fallback); }
        }
        if (tag === "a" && href) {
            if (/^https?:|^mailto:/i.test(href)) el.setAttribute("href", href);
            else if (href.startsWith("#")) el.setAttribute("href", href);
            else if (!/^[a-z][\w+.-]*:/i.test(href) && !href.startsWith("//")) el.setAttribute("href", `reader-note:${encodeURIComponent(decodeLink(href))}`);
            else el.removeAttribute("href");
        }
    }
}

// Parse with fresh options, independent of host plugins and executable blocks.
function gfmHtml(text) {
    const options = { ...getDefaults(), gfm: true, breaks: false };
    return Parser.parse(Lexer.lex(text, options), options);
}

const TEXT_STYLE = `.qbr-plain-line{white-space:pre-wrap}body{overflow-wrap:anywhere}p{margin:0 0 .8em}h1,h2,h3,h4,h5,h6{break-after:avoid;line-height:1.3}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85em;padding:.8em;background:rgba(128,128,128,.08)}code{font-family:monospace}img{max-width:100%;max-height:80vh;object-fit:contain}table{border-collapse:collapse;width:100%;font-size:.85em}td,th{border:1px solid rgba(128,128,128,.3);padding:.4em}a{color:inherit;text-decoration:underline}blockquote{margin:1em;padding:0}input[type=checkbox]{pointer-events:none;accent-color:currentColor;margin-inline-end:.5em}li:has(>input[type=checkbox]){list-style:none}`;

export async function makeTextBook(bytes, name, options = {}) {
    let text = decodeBookText(bytes);
    const titleFallback = name.replace(/\.[^.]+$/, "");
    let meta = {};
    const html = /\.html?$/i.test(name);
    const markdown = !html && !/\.txt$/i.test(name);
    if (markdown) {
        const frontmatter = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)/.exec(text);
        if (frontmatter) {
            try { meta = options.parseYaml?.(frontmatter[1]) || {}; } catch { /* metadata is optional */ }
            text = text.slice(frontmatter[0].length);
        }
    }
    const doc = document.implementation.createHTMLDocument("");
    if (html) {
        const source = new DOMParser().parseFromString(text, "text/html");
        meta = { title: source.title, author: source.querySelector('meta[name="author"]')?.content, language: source.documentElement.lang };
        doc.body.append(...Array.from(source.body.childNodes));
        sanitizeTextDocument(doc, options.resolveResource);
    } else if (markdown) {
        const source = new DOMParser().parseFromString(gfmHtml(text), "text/html");
        doc.body.append(...Array.from(source.body.childNodes));
        sanitizeTextDocument(doc, options.resolveResource);
    } else {
        let lines = [], length = 0;
        const paragraph = () => {
            if (!lines.length) return;
            const el = doc.createElement("p");
            el.className = "qbr-plain-line";
            el.textContent = lines.join("\n");
            doc.body.append(el);
            lines = []; length = 0;
        };
        for (const line of text.split("\n")) {
            if (!line.trim()) { paragraph(); continue; }
            if (line.trim().length <= 80 && CHAPTER.test(line.trim())) {
                paragraph();
                const heading = doc.createElement("h2");
                heading.textContent = line.trim();
                doc.body.append(heading);
            } else {
                // Bound unchaptered, line-wrapped documents without joining or
                // guessing sentences. The source newline remains visible.
                if (length > 12000) paragraph();
                lines.push(line); length += line.length;
            }
        }
        paragraph();
    }
    // Flatten structural HTML wrappers so headings can form chapter boundaries.
    // The resulting DOM is the shared source for rendering, search and CFIs.
    for (const wrapper of Array.from(doc.body.children)) {
        if (wrapper.localName === "div" && wrapper.querySelector("h1,h2,h3,h4,h5,h6,p,pre,ul,ol,table,blockquote")) wrapper.replaceWith(...wrapper.childNodes);
    }
    if (!doc.body.textContent.trim() && !doc.body.querySelector("img")) throw new Error("text-book-empty");
    const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : titleFallback;
    const headings = Array.from(doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    const aliases = new Map();
    headings.forEach((heading, i) => {
        const id = `heading-${i}`;
        const label = heading.textContent.trim();
        for (const alias of [heading.id, label, label.toLowerCase().replace(/\s+/g, "-")]) if (alias && !aliases.has(alias)) aliases.set(alias, id);
        heading.id = id;
    });
    for (const a of doc.body.querySelectorAll('a[href^="#"]')) {
        const key = decodeLink(a.getAttribute("href").slice(1));
        a.setAttribute("href", `#${aliases.get(key) || key}`);
    }
    const chunks = [];
    let current = [], size = 0;
    const flush = () => { if (current.length) { chunks.push(current); current = []; size = 0; } };
    for (const node of Array.from(doc.body.childNodes)) {
        if (node.nodeType === 3 && !node.textContent.trim()) continue;
        if (/^H[12]$/.test(node.nodeName) || size > 24000) flush();
        current.push(node); size += node.textContent.length;
    }
    flush();
    const idMap = new Map(), toc = [], stack = [];
    const urls = new Map();
    let destroyed = false;
    const sections = chunks.map((nodes, index) => {
        const chapter = document.implementation.createHTMLDocument(title);
        chapter.documentElement.lang = typeof meta.language === "string" ? meta.language : "";
        const csp = chapter.createElement("meta");
        csp.httpEquiv = "Content-Security-Policy";
        csp.content = "default-src 'none'; img-src https: http: app: capacitor: blob: data:; style-src 'unsafe-inline' blob:; font-src data: blob: app:; script-src 'none'; frame-src 'none'";
        const style = chapter.createElement("style"); style.textContent = TEXT_STYLE;
        chapter.head.append(csp, style);
        chapter.body.append(...nodes);
        for (const el of chapter.body.querySelectorAll("[id]")) idMap.set(el.id, index);
        for (const h of chapter.body.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
            const level = Number(h.tagName[1]);
            const item = { label: h.textContent.trim(), href: `${index}#${h.id}`, subitems: [] };
            while (stack.length && stack.at(-1).level >= level) stack.pop();
            (stack.at(-1)?.item.subitems || toc).push(item);
            stack.push({ level, item });
        }
        const html = "<!doctype html>" + chapter.documentElement.outerHTML;
        return {
            id: String(index), size: Math.max(1, chapter.body.textContent.length),
            load() {
                if (destroyed) throw new Error("Reader closed");
                if (!urls.has(index)) urls.set(index, createEngineObjectURL(new Blob([html], { type: "text/html" })));
                return urls.get(index);
            },
            unload() { if (urls.has(index)) { revokeEngineObjectURL(urls.get(index)); urls.delete(index); } },
            createDocument: () => new DOMParser().parseFromString(html, "text/html"),
        };
    });
    return {
        metadata: { title, author: typeof meta.author === "string" ? meta.author : "", language: typeof meta.language === "string" ? meta.language : "" },
        sections, toc: toc.length ? toc : [{ label: title, href: "0" }],
        isExternal: href => /^(?:https?:|mailto:|reader-note:)/i.test(href),
        resolveHref(href) {
            const [section, id] = String(href).split("#");
            const index = section ? Number(section) : idMap.get(id);
            if (!Number.isInteger(index) || !sections[index]) return null;
            return { index, anchor: target => id ? target.getElementById(id) : target.body };
        },
        splitTOCHref: href => String(href).split("#"),
        getTOCFragment: (target, id) => id ? target.getElementById(id) : target.body,
        destroy() { destroyed = true; for (const section of sections) section.unload(); },
    };
}
