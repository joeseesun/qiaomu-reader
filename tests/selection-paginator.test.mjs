import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { patchFoliatePaginator } from "../scripts/foliate-elements.mjs";

const original = fs.readFileSync(new URL("../node_modules/foliate-js/paginator.js", import.meta.url), "utf8");
// Exercise the dependency's actual touchend method before and after the build
// adaptation. Only its private-field syntax is replaced to supply unit fixtures;
// real layout and native handles remain part of platform acceptance.
function touchEnd(source) {
    const start = source.indexOf("    #onTouchEnd() {");
    const end = source.indexOf("    // allows one to process", start);
    const method = source.slice(start, end).replaceAll("#", "");
    return vm.runInNewContext(`({${method}}).onTouchEnd`, {
        requestAnimationFrame: run => run(), visualViewport: { scale: 1 },
    });
}

test("Foliate no longer snaps to another page after a native selection-handle drag", () => {
    let snaps = 0;
    const selection = { rangeCount: 1, isCollapsed: false };
    const pager = { scrolled: false, view: { document: { getSelection: () => selection } },
        touchState: { vx: 4, vy: 2 }, snap() { snaps++; } };
    touchEnd(original).call(pager);
    assert.equal(snaps, 1, "reproduce the upstream snap while text is selected");
    snaps = 0;
    const end = touchEnd(patchFoliatePaginator(original));
    end.call(pager); assert.equal(snaps, 0);
    selection.isCollapsed = true; pager.touchState.selecting = true;
    end.call(pager); assert.equal(snaps, 0, "native collapse at release must not convert the drag into a swipe");
    pager.touchState = { vx: 4, vy: 2 };
    end.call(pager); assert.equal(snaps, 1, "ordinary page swipes still snap");
    pager.scrolled = true; end.call(pager); assert.equal(snaps, 1);
});
