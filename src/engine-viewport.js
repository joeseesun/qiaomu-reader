// Mobile sheets and background workspace leaves can mount before they have
// geometry. Foliate's first navigation is a no-op at that point. Wait for the
// actual reading surface, and release the observer when the book closes.
export function waitForEngineViewport(host, signal) {
    return new Promise((resolve, reject) => {
        const win = host.ownerDocument.defaultView;
        let observer;
        const cleanup = () => {
            observer?.disconnect();
            win?.removeEventListener("resize", check);
            signal?.removeEventListener("abort", abort);
        };
        const abort = () => {
            cleanup();
            reject(Object.assign(new Error("Reader closed"), { name: "AbortError" }));
        };
        const check = () => {
            if (signal?.aborted) { abort(); return; }
            if (host.clientWidth > 0 && host.clientHeight > 0) {
                cleanup();
                resolve();
            }
        };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener("abort", abort, { once: true });
        if (win?.ResizeObserver) {
            observer = new win.ResizeObserver(check);
            observer.observe(host);
        }
        win?.addEventListener("resize", check);
        check();
    });
}
