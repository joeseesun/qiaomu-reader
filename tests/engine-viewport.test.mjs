import test from "node:test";
import assert from "node:assert/strict";
import { waitForEngineViewport } from "../src/engine-viewport.js";

function surface(width = 0, height = 0) {
    let callback;
    let disconnected = 0;
    const win = new EventTarget();
    win.ResizeObserver = class {
        constructor(fn) { callback = fn; }
        observe() {}
        disconnect() { disconnected++; }
    };
    const host = { clientWidth: width, clientHeight: height, ownerDocument: { defaultView: win } };
    return { host, resize(w, h) { host.clientWidth = w; host.clientHeight = h; callback(); },
        get disconnected() { return disconnected; } };
}

test("hidden mobile reading surface waits for both dimensions before first navigation", async () => {
    const fixture = surface();
    let navigated = false;
    const pending = waitForEngineViewport(fixture.host, new AbortController().signal).then(() => { navigated = true; });
    await Promise.resolve();
    assert.equal(navigated, false);
    fixture.resize(390, 0);
    await Promise.resolve();
    assert.equal(navigated, false);
    fixture.resize(390, 700);
    await pending;
    assert.equal(navigated, true);
    assert.equal(fixture.disconnected, 1);
});

test("visible reading surface opens immediately and releases its observer", async () => {
    const fixture = surface(390, 700);
    await waitForEngineViewport(fixture.host, new AbortController().signal);
    assert.equal(fixture.disconnected, 1);
});

test("closing a hidden book rejects its pending open and cannot resume after resize", async () => {
    const fixture = surface();
    const controller = new AbortController();
    const pending = waitForEngineViewport(fixture.host, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(fixture.disconnected, 1);
});

test("a previously cancelled open does not retain a resize observer", async () => {
    const fixture = surface();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(waitForEngineViewport(fixture.host, controller.signal), { name: "AbortError" });
    assert.equal(fixture.disconnected, 0);
});
