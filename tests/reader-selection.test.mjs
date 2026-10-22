import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createReaderSelectionLifecycle } from "../src/reader-selection.js";

function fixture(t, engine = false) {
    const dom = new JSDOM('<main><article><p>first second third</p></article><div class="popup"></div></main><aside>outside</aside>');
    const { window } = dom, host = window.document, area = host.querySelector("article");
    let time = 0, nextId = 0;
    const timers = new Map(), checks = [];
    window.setTimeout = (run, delay) => { timers.set(++nextId, { run, at: time + delay }); return nextId; };
    window.clearTimeout = id => timers.delete(id);
    const advance = ms => {
        time += ms;
        for (const [id, job] of [...timers]) if (job.at <= time) { timers.delete(id); job.run(); }
    };
    const view = {
        areaEl: area, hlPopup: host.querySelector(".popup"), engine: engine ? {} : null,
        _hideHlPopup({ preserveSelection = false } = {}) {
            if (!preserveSelection) this._selectionLifecycle?.dismiss();
            this.hlPopup.classList.remove("qiaomu-reader-hl-popup-on");
            this._pendingSel = null;
            this._selectionMenuOpen = false;
        },
        _onSelectionCheck() { this.show(host); },
        _engineSelectionCheck({ doc, index }) { assert.equal(index, 3); this.show(doc); },
        show(doc) {
            checks.push(doc.getSelection().toString());
            this._pendingSel = { text: checks.at(-1) };
            this.hlPopup.classList.add("qiaomu-reader-hl-popup-on");
        },
    };
    const context = [];
    const lifecycle = view._selectionLifecycle = createReaderSelectionLifecycle(view, (...args) => context.push(args));
    let doc = host;
    if (engine) {
        const frame = host.createElement("iframe"); area.append(frame);
        doc = frame.contentDocument; doc.body.innerHTML = "<p>first second third</p>";
        lifecycle.bind(doc, 3);
    }
    const p = doc.querySelector("p");
    const select = (start = 0, end = 5) => {
        const range = doc.createRange(); range.setStart(p.firstChild, start); range.setEnd(p.firstChild, end);
        doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
        doc.dispatchEvent(new doc.defaultView.Event("selectionchange"));
    };
    const pointer = (type, pointerType = "touch", target = p) => target.dispatchEvent(new doc.defaultView.PointerEvent(type, { bubbles: true, pointerType, button: 0 }));
    const touch = (type, count = 1) => {
        const event = new doc.defaultView.Event(type, { bubbles: true });
        Object.defineProperty(event, "touches", { value: Array.from({ length: count }, () => ({})) });
        p.dispatchEvent(event);
    };
    t.after(() => { lifecycle.dispose(); dom.window.close(); });
    return { window, host, doc, p, area, view, lifecycle, advance, select, pointer, touch, checks, context };
}

for (const engine of [false, true]) {
    const format = engine ? "EPUB/Markdown iframe" : "PDF host flow";
    test(`${format}: long-press and handle adjustment wait for touchend, including pointercancel`, t => {
        const f = fixture(t, engine);
        f.pointer("pointerdown"); f.touch("touchstart"); f.select();
        f.pointer("pointercancel"); f.advance(1000);
        assert.equal(f.view._selectionDragging, true);
        assert.deepEqual(f.checks, []);
        f.select(0, 12); f.advance(1000); assert.deepEqual(f.checks, []);
        f.touch("touchend", 0); f.advance(249); assert.deepEqual(f.checks, []);
        f.advance(1); assert.deepEqual(f.checks, ["first second"]);
        f.pointer("pointerdown"); f.touch("touchstart");
        assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), false);
        f.select(6, 18); f.pointer("pointerup"); f.advance(1000);
        assert.equal(f.checks.length, 1, "pointerup must not finish an active touch stream");
        f.touch("touchend", 0); f.advance(250);
        assert.deepEqual(f.checks, ["first second", "second third"]);
        assert.equal(f.doc.getSelection().toString(), "second third", "native handles retain the selection");
    });

    test(`${format}: cancel suppresses the unchanged selection, but a new gesture may reopen it`, t => {
        const f = fixture(t, engine);
        f.pointer("pointerdown"); f.touch("touchstart"); f.select(); f.touch("touchcancel", 0);
        f.doc.dispatchEvent(new f.doc.defaultView.Event("selectionchange")); f.advance(500);
        assert.deepEqual(f.checks, []);
        f.pointer("pointerdown"); f.touch("touchstart"); f.touch("touchend", 0); f.advance(250);
        assert.deepEqual(f.checks, ["first"]);
    });

    test(`${format}: dismissal, Escape and scrolling do not reopen tools on duplicate selectionchange`, t => {
        const f = fixture(t, engine);
        for (const action of [() => f.view._hideHlPopup(),
            () => f.p.dispatchEvent(new f.doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
            () => f.p.dispatchEvent(new f.doc.defaultView.Event("scroll", { bubbles: false }))]) {
            f.pointer("pointerdown", "mouse"); f.select(); f.pointer("pointerup", "mouse"); f.advance(60);
            assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), true);
            action(); const count = f.checks.length;
            f.doc.dispatchEvent(new f.doc.defaultView.Event("selectionchange")); f.advance(1000);
            assert.equal(f.checks.length, count);
            assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), false);
        }
        f.select(6, 12); f.advance(60);
        assert.equal(f.checks.at(-1), "second", "a genuinely changed range is eligible again");
    });

    test(`${format}: a click outside closes tools; stale timers and listeners stop at disposal`, t => {
        const f = fixture(t, engine);
        f.select(); f.advance(60);
        f.host.querySelector("aside").dispatchEvent(new f.window.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), false);
        f.select(6, 12); f.lifecycle.dispose(); f.advance(1000);
        assert.deepEqual(f.checks, ["first"]);
        f.pointer("pointerdown"); f.touch("touchstart"); f.pointer("pointerup");
        f.select(); f.advance(1000); assert.equal(f.checks.length, 1);
    });

    test(`${format}: menu and comment actions are not dismissed by their own selection changes`, t => {
        const f = fixture(t, engine);
        for (const flag of ["_selectionMenuOpen", "_commentEditing", "_lookupOpen", "_editHlId"]) {
            f.view[flag] = true; f.select(); f.advance(1000); assert.equal(f.checks.length, 0);
            f.view[flag] = false;
        }
        f.select(); f.advance(60); assert.equal(f.checks.length, 1);
        f.view.hlPopup.dispatchEvent(new f.window.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), true);
    });

    test(`${format}: switching books resets an unfinished gesture without leaving selection disabled`, t => {
        const f = fixture(t, engine);
        f.pointer("pointerdown"); f.touch("touchstart"); f.select();
        f.lifecycle.reset(); assert.equal(f.view._selectionDragging, false);
        f.select(6, 12); f.advance(60); assert.deepEqual(f.checks, ["second"]);
        f.pointer("pointerdown", "mouse"); f.select(); f.pointer("pointerup", "mouse"); f.advance(60);
        assert.deepEqual(f.checks, ["second", "first"]);
    });

    test(`${format}: a tap dismissing tools does not immediately reopen them for the unchanged range`, t => {
        const f = fixture(t, engine);
        f.select(); f.advance(60);
        for (const mode of ["mouse", "touch"]) for (const menu of [false, true]) {
            const tap = () => {
                f.pointer("pointerdown", mode);
                if (mode === "touch") f.touch("touchstart");
                f.pointer("pointerup", mode);
                if (mode === "touch") f.touch("touchend", 0);
                f.advance(mode === "touch" ? 250 : 60);
            };
            f.view._selectionMenuOpen = menu;
            f.view.hlPopup.classList.add("qiaomu-reader-hl-popup-on");
            const count = f.checks.length;
            tap();
            assert.equal(f.checks.length, count);
            assert.equal(f.view.hlPopup.classList.contains("qiaomu-reader-hl-popup-on"), false);
            tap();
            assert.equal(f.checks.length, count + 1, "a subsequent deliberate selection can reopen the tools");
        }
    });
}
