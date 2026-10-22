// One lifecycle for the host PDF flow and disposable EPUB/Markdown iframes.
// Selection handles can emit pointercancel before touchend, so pointer events
// alone are not a reliable indication that a mobile selection has finished.
export function createReaderSelectionLifecycle(view, onContext) {
    const area = view.areaEl, host = area.ownerDocument, win = host.defaultView;
    const documents = new Map(), dismissed = new WeakMap();
    let timer, lastDoc = host, pointer = false, touches = 0, touch = false, disposed = false;
    const snapshot = doc => {
        const sel = doc.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        if (doc === host && !area.contains(range.commonAncestorContainer)) return null;
        return [range.startContainer, range.startOffset, range.endContainer, range.endOffset];
    };
    const equal = (a, b) => a && b && a.every((value, index) => value === b[index]);
    const clearTimer = () => { win.clearTimeout(timer); timer = null; };
    const interacting = () => pointer || touches > 0;
    const protectedTarget = target => view.hlPopup?.contains(target);
    const inside = (doc, target) => doc !== host || area.contains(target);
    const syncDragging = () => { view._selectionDragging = interacting(); };
    const hideDuringGesture = () => view._hideHlPopup({ preserveSelection: true });
    const api = {
        get touch() { return touch; },
        canShow(doc) {
            return !disposed && documents.has(doc) && !interacting() && !view._closed
                && !equal(dismissed.get(doc), snapshot(doc));
        },
        allow(doc) { dismissed.delete(doc); },
        dismiss() {
            clearTimer();
            for (const doc of documents.keys()) dismissed.set(doc, snapshot(doc));
        },
        reset() {
            api.dismiss(); pointer = false; touches = 0; touch = false; syncDragging();
        },
        schedule(doc = host) {
            if (disposed || !documents.has(doc) || (doc === host && view.engine)) return;
            clearTimer();
            lastDoc = doc;
            if (interacting() || view._selectionMenuOpen || view._editHlId || view._commentEditing || view._lookupOpen) return;
            // Native handles can update the range without another pointerdown.
            // Hide the old tools while that range settles, without clearing it.
            if (touch) hideDuringGesture();
            timer = win.setTimeout(() => {
                timer = null;
                if (!api.canShow(doc) || !area.isConnected) return;
                if (doc !== host && !doc.defaultView?.frameElement?.isConnected) return;
                if (view._selectionMenuOpen || view._editHlId || view._commentEditing || view._lookupOpen) return;
                if (!snapshot(doc)) { view._hideHlPopup(); return; }
                if (doc === host) view._onSelectionCheck();
                else view._engineSelectionCheck({ doc, index: documents.get(doc).index });
            }, touch ? 250 : 60);
        },
        bind(doc, index) {
            if (disposed || documents.has(doc)) return;
            for (const [old, entry] of documents) {
                if (old !== host && !old.defaultView?.frameElement?.isConnected) {
                    entry.remove(); documents.delete(old);
                }
            }
            const listeners = [];
            const listen = (name, handler, options = true) => {
                doc.addEventListener(name, handler, options);
                listeners.push(() => doc.removeEventListener(name, handler, options));
            };
            const start = event => {
                if (protectedTarget(event.target)) return;
                if (!inside(doc, event.target)) {
                    // Obsidian owns clicks in its host-document Menu. Iframe
                    // clicks never reach it, and are handled below instead.
                    if (!view._selectionMenuOpen) view._hideHlPopup();
                    return;
                }
                if (event.type === "pointerdown" && event.button !== 0) {
                    if (event.pointerType === "mouse") touch = false;
                    return;
                }
                const continuing = interacting() && lastDoc === doc;
                lastDoc = doc;
                touch = event.type === "touchstart" || event.pointerType === "touch" || event.pointerType === "pen";
                if (event.type === "touchstart") touches = event.touches.length;
                else pointer = true;
                const dismissing = view._selectionMenuOpen || view.hlPopup?.classList.contains("qiaomu-reader-hl-popup-on");
                if (dismissing) api.dismiss();
                else if (!continuing) dismissed.delete(doc);
                clearTimer();
                view._dismissSelectionClick = !!dismissing || (continuing && view._dismissSelectionClick);
                hideDuringGesture();
                syncDragging();
            };
            const end = event => {
                if (!interacting()) return;
                if (event.type === "touchend") { touches = event.touches.length; if (!touches) pointer = false; }
                else pointer = false;
                syncDragging();
                if (!interacting()) api.schedule(lastDoc);
            };
            const cancel = event => {
                pointer = false;
                if (event.type === "touchcancel") touches = 0;
                syncDragging();
                if (!touches) view._hideHlPopup();
            };
            listen("pointerdown", start);
            listen("pointerup", end);
            listen("pointercancel", cancel);
            listen("touchstart", start, { capture: true, passive: true });
            listen("touchend", end, { capture: true, passive: true });
            listen("touchcancel", cancel, { capture: true, passive: true });
            listen("selectionchange", () => api.schedule(doc));
            listen("contextmenu", event => {
                if (inside(doc, event.target) && !protectedTarget(event.target)) onContext(event, doc, index);
            });
            listen("scroll", event => {
                if (!inside(doc, event.target) || protectedTarget(event.target)) return;
                if (interacting()) { clearTimer(); hideDuringGesture(); }
                else view._hideHlPopup();
            });
            listen("keydown", event => {
                if (event.key === "Escape") view._hideHlPopup();
            });
            documents.set(doc, { index, remove: () => listeners.forEach(remove => remove()) });
        },
        dispose() {
            clearTimer(); disposed = true; pointer = false; touches = 0; syncDragging();
            for (const entry of documents.values()) entry.remove();
            documents.clear();
        },
    };
    api.bind(host);
    return api;
}
