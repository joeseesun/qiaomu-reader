import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { foliateElements } from "../scripts/foliate-elements.mjs";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.slice(start - 6, start) === "async " ? start - 6 : start;
  const end = source.indexOf("\n}", start) + 2;
  return source.slice(asyncStart, end);
}
const translate = (key) => key;

test("switching a reused PDF flow between paged and scroll modes clears stale geometry", () => {
  const method = source.slice(source.indexOf("  _styleFlow(cfg, geo, cjk) {"), source.indexOf("  _mountBookHtml("));
  const style = vm.runInNewContext(`({${method}})._styleFlow`, { resolveReaderFont: () => "serif", FONTS: {} });
  const flow = new JSDOM("<div></div>").window.document.querySelector("div");
  const pager = { flow, scrollMode: false };
  const cfg = { fontSize: 18, lineHeight: 1.8 };
  const geo = { flowWidth: 1200, innerHeight: 600, colWidth: 550, gap: 48, padTop: 20, padBottom: 20 };
  style.call(pager, cfg, geo, false);
  flow.style.transform = "translate3d(-1200px,0,0)";
  pager.scrollMode = true;
  style.call(pager, cfg, geo, false);
  assert.equal(flow.style.transform, "");
  assert.equal(flow.style.columnWidth, "");
  assert.equal(flow.style.columnGap, "");
  assert.equal(flow.style.willChange, "auto");
  assert.equal(flow.style.minHeight, "100%");
  pager.scrollMode = false;
  style.call(pager, cfg, geo, false);
  assert.equal(flow.style.minHeight, "");
  assert.equal(flow.style.columnWidth, "550px");
});

test("engine resize leaves layout to Foliate and never raises the legacy loading mask", () => {
  const method = source.slice(source.indexOf("  _onAreaResized() {"), source.indexOf("  _repaginateAfterResize() {"));
  const resize = vm.runInNewContext(`({${method}})._onAreaResized`);
  const flags = [];
  resize.call({ bookHtml: "engine", engine: {}, containerEl: { offsetParent: {} },
    _setRelayout: value => flags.push(value) });
  assert.deepEqual(flags, [false]);
});

test("reading panel repagination forwards changed settings to an active engine", async () => {
  const method = source.slice(source.indexOf("  async repaginate() {"), source.indexOf("  async _repaginateAnchored(anchor) {"));
  const repaginate = vm.runInNewContext(`({${method}}).repaginate`);
  const actions = [];
  await repaginate.call({ bookHtml: "engine", engine: {},
    applyVars: () => actions.push("settings"), _setRelayout: value => actions.push(value) });
  assert.deepEqual(actions, ["settings", false]);
});

test("closing an EPUB saves its CFI instead of the unused pager; unfinished loads preserve previous progress", async () => {
  const persist = vm.runInNewContext(`${functionSource("persistCurrentReaderPosition")}\npersistCurrentReaderPosition`);
  let saved = { fraction: 0.75, cfi: "epubcfi(/6/8!/4/2)" };
  let legacyWrites = 0;
  const view = {
    file: { path: "book.epub" }, bookHtml: "engine", pager: { total: 1, spread: 0 },
    engine: { currentLocation: () => ({ fraction: 0.75, cfi: saved.cfi }) },
    plugin: { saveEngineProgress: async (path, fraction, cfi) => { saved = { path, fraction, cfi }; },
      saveProgress: () => legacyWrites++ },
  };
  await persist(view);
  assert.equal(saved.fraction, 0.75); assert.equal(saved.cfi, "epubcfi(/6/8!/4/2)");
  assert.equal(saved.path, "book.epub"); assert.equal(legacyWrites, 0);
  view._openingBook = {};
  view.engine.currentLocation = () => ({ fraction: 0, cfi: "wrong-start" });
  await persist(view);
  assert.equal(saved.fraction, 0.75);
  view._openingBook = null; view.engine = null; view._engineLocation = null;
  await persist(view);
  assert.equal(legacyWrites, 0);
});

test("EPUB relocation updates chapter, percent and AI context; initial loads and closed views cannot write", () => {
  let writes = 0, contextUpdates = 0, capabilityUpdates = 0;
  const update = vm.runInNewContext(`${functionSource("updateEngineLocation")}\nupdateEngineLocation`, {
    qiaomuReaderTranslate: translate, syncReaderAiCapability: () => capabilityUpdates++,
    syncOpenAiReaderContext: () => contextUpdates++,
  });
  const text = () => ({ setText(value) { this.text = value; } });
  const view = { file: { path: "book.epub" }, pbarFill: { style: {} }, locEl: text(), pctEl: text(),
    plugin: { saveEngineProgress: () => writes++ }, _openingBook: {} };
  const loc = { fraction: 0.61, cfi: "cfi", tocItem: { label: "第二章" } };
  update(view, loc);
  assert.equal(view.locEl.text, "第二章"); assert.equal(view.pctEl.text, "61%");
  assert.equal(writes, 0);
  view._openingBook = null; update(view, loc);
  assert.equal(writes, 1); assert.equal(contextUpdates, 1); assert.equal(capabilityUpdates, 2);
  view._closed = true; update(view, { fraction: 0, cfi: "stale" });
  assert.equal(writes, 1); assert.equal(view.pctEl.text, "61%");
});

test("AI context reads the engine's visible text and current chapter without legacy pager geometry", () => {
  const context = vm.runInNewContext(`${functionSource("readerPageContext")}\nreaderPageContext`, {
    qiaomuReaderTranslate: translate,
  });
  const view = { file: { path: "book.epub" }, pager: {}, engine: {
    visibleText: () => "  现在看到的正文  ", currentLocation: () => ({ tocItem: { label: "第二章" } }),
  } };
  const result = context(view);
  assert.equal(result.text, "现在看到的正文"); assert.equal(result.page, "第二章");
  assert.equal(result.bookFile, view.file); assert.equal(result.kind, "page");
  view.engine.visibleText = () => "字".repeat(7000);
  assert.equal(context(view).text.length, 6001);
  view.engine.visibleText = () => "";
  assert.equal(context(view), null);
});

async function bundle(elements) {
  const result = await build({ absWorkingDir: root, stdin: {
    contents: 'export * from "./src/reader-engine.js"; import "foliate-js/paginator.js"; import "foliate-js/fixed-layout.js";',
    resolveDir: root,
  }, bundle: true, format: "cjs", write: false, plugins: [elements.plugin], define: elements.define });
  return result.outputFiles[0].text;
}
function evaluate(dom, code) {
  dom.window.module = { exports: {} };
  vm.runInContext(code, dom.getInternalVMContext());
  return dom.window.module.exports;
}

test("built Foliate elements load twice in one host and coexist with older dependency builds", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });
  const elements = foliateElements(root);
  const code = await bundle(elements);
  const tag = JSON.parse(elements.define.__QBR_ENGINE_VIEW_TAG__);
  dom.window.customElements.define("foliate-view", class extends dom.window.HTMLElement {});
  evaluate(dom, code);
  const registered = dom.window.customElements.get(tag);
  assert.ok(registered);
  evaluate(dom, code);
  assert.equal(dom.window.customElements.get(tag), registered);
  assert.ok(dom.window.customElements.get(tag.replace(/view$/, "paginator")));
  assert.ok(dom.window.customElements.get(tag.replace(/view$/, "fxl")));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qbr-engine-lock-"));
  try {
    fs.writeFileSync(path.join(temp, "package-lock.json"), fs.readFileSync(path.join(root, "package-lock.json"), "utf8") + "\n");
    const upgraded = foliateElements(temp);
    evaluate(dom, await bundle(upgraded));
    assert.notEqual(upgraded.define.__QBR_ENGINE_VIEW_TAG__, elements.define.__QBR_ENGINE_VIEW_TAG__);
    assert.ok(dom.window.customElements.get(JSON.parse(upgraded.define.__QBR_ENGINE_VIEW_TAG__)));
    assert.equal(dom.window.customElements.get(tag), registered);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); dom.window.close(); }
});

test("engine searches createDocument sections, returns readable excerpts and cancels a stale query", async () => {
  const dom = new JSDOM("<body><main></main></body>", { runScripts: "outside-only" });
  const elements = foliateElements(root);
  const { EpubEngine } = evaluate(dom, await bundle(elements));
  const View = dom.window.customElements.get(JSON.parse(elements.define.__QBR_ENGINE_VIEW_TAG__));
  const parse = text => new dom.window.DOMParser().parseFromString(`<p>${text}</p>`, "text/html");
  let release;
  const sections = [
    { createDocument: async () => parse("理解一个概念，理解原文。") },
    { createDocument: async () => parse("再用例子检查理解。") },
  ];
  const annotations = new Set();
  // Stub layout only: exercise the bundled engine and real Foliate matcher
  // against the dependency's createDocument section contract.
  View.prototype.open = async function () { this.book = { sections, metadata: { language: "zh" } }; };
  View.prototype.init = async function () { this.lastLocation = { cfi: "test" }; this.renderer = { getContents: () => [{ doc: dom.window.document }] }; };
  View.prototype.close = function () {};
  View.prototype.getCFI = (index, range) => `epubcfi(${index}/${range.startOffset})`;
  View.prototype.addAnnotation = async ({ value }) => annotations.add(value);
  View.prototype.deleteAnnotation = async ({ value }) => annotations.delete(value);
  const engine = new EpubEngine(dom.window.document.querySelector("main"));
  try {
    await engine.open(new Uint8Array(), "test.epub");
    const hits = [];
    for await (const hit of engine.search("理解")) hits.push(hit);
    assert.equal(hits.length, 3);
    assert.equal(hits[2].index, 1);
    assert.match(hits[0].excerpt, /理解一个概念/);
    assert.ok(!hits[0].excerpt.includes("[object Object]"));
    assert.equal(annotations.size, 3);
    sections[0].createDocument = () => new Promise(resolve => { release = resolve; });
    const stale = engine.search("理解").next();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    await engine.clearSearchHits();
    release(parse("理解仍在这里。"));
    assert.equal((await stale).done, true);
    assert.equal(annotations.size, 0);
  } finally { engine.destroy(); dom.window.close(); }
});

test("layout supports explicit one/two columns, narrow panes and scroll mode; iframe keys respect editing", async () => {
  const dom = new JSDOM('<body><input><p tabindex="0">text</p></body>', { runScripts: "outside-only" });
  const { engineLayout, bindEngineKeys } = evaluate(dom, await bundle(foliateElements(root)));
  assert.equal(engineLayout({ columns: "1" }, 1200)["max-column-count"], "1");
  assert.equal(engineLayout({ columns: "2" }, 1200)["max-column-count"], "2");
  assert.equal(engineLayout({ columns: "2" }, 700)["max-column-count"], "1");
  assert.equal(engineLayout({ readMode: "scroll" }, 900).flow, "scrolled");
  const calls = []; let scroll = false;
  const cleanup = bindEngineKeys(dom.window.document, dir => calls.push(dir), () => scroll);
  const key = (target, value, extras = {}) => {
    const event = new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...extras });
    target.dispatchEvent(event); return event.defaultPrevented;
  };
  const paragraph = dom.window.document.querySelector("p");
  assert.equal(key(paragraph, "ArrowRight"), true);
  assert.equal(key(paragraph, "PageUp"), true);
  assert.equal(key(paragraph, "ArrowLeft", { shiftKey: true }), false);
  assert.equal(key(dom.window.document.querySelector("input"), "ArrowRight"), false);
  scroll = true;
  assert.equal(key(paragraph, "ArrowDown"), false);
  cleanup(); key(paragraph, "ArrowRight");
  assert.deepEqual(calls, ["next", "prev"]);
  dom.window.close();
});

test("closing the engine releases the book once, including cancellation during asynchronous open", async () => {
  const dom = new JSDOM("<body><main></main></body>", { runScripts: "outside-only" });
  const elements = foliateElements(root);
  const { EpubEngine } = evaluate(dom, await bundle(elements));
  const View = dom.window.customElements.get(JSON.parse(elements.define.__QBR_ENGINE_VIEW_TAG__));
  let disposed = 0, release;
  View.prototype.open = async function () { this.book = { destroy: () => disposed++ }; };
  View.prototype.init = async function () { this.lastLocation = { cfi: "test" }; this.renderer = { getContents: () => [{ doc: dom.window.document }] }; };
  View.prototype.close = function () {};
  const engine = new EpubEngine(dom.window.document.querySelector("main"));
  await engine.open(new Uint8Array(), "test.mobi");
  engine.destroy(); engine.destroy();
  assert.equal(disposed, 1);
  View.prototype.open = async function () {
    await new Promise(resolve => { release = resolve; });
    this.book = { destroy: () => disposed++ };
  };
  const pending = engine.open(new Uint8Array(), "test.mobi");
  engine.destroy(); release();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(disposed, 2);
  assert.equal(dom.window.document.querySelector("main").children.length, 0);
  dom.window.close();
});

test("bundled paginator ignores hidden navigation, unlocks after errors and disconnects its actual observer", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });
  const observers = [];
  const frames = new Map(); let frameId = 0;
  dom.window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  dom.window.cancelAnimationFrame = id => frames.delete(id);
  dom.window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  };
  dom.window.matchMedia = () => ({ addEventListener() {}, removeEventListener() {} });
  const elements = foliateElements(root);
  evaluate(dom, await bundle(elements));
  const pager = dom.window.document.createElement(JSON.parse(elements.define.__QBR_ENGINE_VIEW_TAG__).replace(/view$/, "paginator"));
  dom.window.document.body.append(pager);
  let reads = 0, fail = true;
  Object.defineProperty(pager, "sections", { get() { reads++; if (fail) throw new Error("bad section"); return []; } });
  await pager.next(); assert.equal(reads, 0);
  const target = [...observers[0].targets][0];
  Object.defineProperties(target, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
  await assert.rejects(pager.next(), /bad section/);
  fail = false; await assert.rejects(pager.next(), /load/);
  assert.ok(reads >= 2, "a failed turn must allow another turn");
  let renders = 0; pager.render = () => renders++;
  observers[0].callback(); observers[0].callback();
  assert.equal(frames.size, 1, "resize events must coalesce outside the observer callback");
  assert.equal(renders, 0);
  const [id, callback] = [...frames][0]; frames.delete(id); callback();
  assert.equal(renders, 1);
  observers[0].callback();
  pager.destroy();
  assert.equal(frames.size, 0, "close cancels pending geometry work");
  assert.equal(observers[0].targets.size, 0);
  dom.window.close();
});

test("iframe page turns stay immersive while center taps and pointer edges reveal chrome", () => {
  const dom = new JSDOM('<body><main><iframe></iframe></main></body>');
  const frame = dom.window.document.querySelector("iframe"), doc = frame.contentDocument;
  doc.body.innerHTML = '<p>正文</p><a href="#note">注释</a>';
  frame.getBoundingClientRect = () => ({ left: -400, top: 80 });
  const main = dom.window.document.querySelector("main");
  main.getBoundingClientRect = () => ({ left: 100, top: 80, bottom: 880, width: 1000 });
  const calls = [];
  const view = { areaEl: main, plugin: { settings: { navMode: "click" } },
    _armImmersive: () => calls.push("chrome"), nav: dir => calls.push(dir) };
  const attach = vm.runInNewContext(`${functionSource("beginReaderSelection")}\n${functionSource("handleAreaNavClick")}\n${functionSource("revealReaderChromeFromPage")}\n${functionSource("attachEngineChrome")}\nattachEngineChrome`, {
    readerIsPdf: () => false, selOf: () => null,
  });
  attach(view, doc);
  const send = (target, type, x = 1400, y = 20) => target.dispatchEvent(new doc.defaultView.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
  }));
  send(doc.body, "pointerdown");
  assert.deepEqual(calls, [], "starting a page turn must not reveal the controls");
  send(doc.body, "pointermove");
  send(doc.querySelector("p"), "click");
  send(doc.querySelector("p"), "click", 900);
  send(doc.querySelector("a"), "click");
  view.plugin.settings.readMode = "scroll"; send(doc.querySelector("p"), "click");
  assert.deepEqual(calls, ["chrome", "next", "chrome", "chrome"]);
  dom.window.close();
});


test("initial navigation recovers stale CFIs and hidden-tab no-ops without accepting a blank reader", async () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });
  const { restoreEngineLocation } = evaluate(dom, await bundle(foliateElements(root)));
  const scenarios = [
    { first: "ok", calls: ["cfi"] },
    { first: "noop", calls: ["cfi", "fraction"] },
    { first: "throw", calls: ["cfi", "fraction"] },
    { first: "noop", fraction: "noop", calls: ["cfi", "fraction", "start"] },
    { first: "noop", noFraction: true, calls: ["cfi", "start"] },
    { first: "noop", fraction: "noop", start: "noop", calls: ["cfi", "fraction", "start"], fails: true },
  ];
  for (const scenario of scenarios) {
    const calls = []; let doc = null;
    const view = { renderer: { getContents: () => doc ? [{ doc }] : [] } };
    const navigate = (name, result) => { calls.push(name); if (result === "throw") throw new Error("stale CFI"); if (result === "ok") { doc = dom.window.document; view.lastLocation = { cfi: "restored" }; } };
    view.init = async ({ lastLocation }) => { assert.equal(lastLocation, "stale"); navigate("cfi", scenario.first); };
    view.goToFraction = async f => { assert.equal(f, .4); navigate("fraction", scenario.fraction || "ok"); };
    view.goToTextStart = async () => navigate("start", scenario.start || "ok");
    const pending = restoreEngineLocation(view, { initialCfi: "stale", initialFraction: scenario.noFraction ? undefined : .4 });
    if (scenario.fails) await assert.rejects(pending, /Could not load/); else await pending;
    assert.deepEqual(calls, scenario.calls);
  }
  const legacy = {
    renderer: { getContents: () => [{ doc: dom.window.document }] },
    async init({ lastLocation }) { assert.equal(lastLocation.fraction, .015); this.lastLocation = { cfi: "legacy-restored" }; },
    async goToTextStart() { assert.fail("legacy progress should not reset to the beginning"); },
  };
  await restoreEngineLocation(legacy, { initialFraction: .015 });
  let current = true, fallback = false;
  const closed = { init: async () => { current = false; }, goToTextStart: async () => { fallback = true; } };
  await assert.rejects(restoreEngineLocation(closed, {}, () => current), { name: "AbortError" });
  assert.equal(fallback, false);
  dom.window.close();
});

test("closing an unfinished PDF never replaces the last saved position with page one", async () => {
  const persist = vm.runInNewContext(`${functionSource("persistCurrentReaderPosition")}\npersistCurrentReaderPosition`);
  let writes = 0;
  await persist({ file: { path: "book.pdf" }, bookHtml: "pdf", _openingBook: {}, pager: { total: 1, spread: 0 },
    plugin: { getProgress: () => ({ pct: .8 }), saveProgress: () => writes++ } });
  assert.equal(writes, 0);
});

test("pending highlight restoration cannot paint the next book in either reader", async () => {
  const methods = [...source.matchAll(/  _renderEngineHighlights\(\) \{[\s\S]*?\n  \}/g)];
  assert.equal(methods.length, 2);
  for (const [method] of methods) {
    const render = vm.runInNewContext(`({${method}})._renderEngineHighlights`, {
    });
    let release; const painted = [];
    const old = { addHighlight: () => new Promise(resolve => { release = resolve; }) };
    const view = { engine: old, file: { path: "old.epub" }, plugin: { getHighlights: () => [
      { id: "one", cfi: "one" }, { id: "two", cfi: "two" },
    ] } };
    render.call(view);
    view.engine = { addHighlight: id => painted.push(id) }; view.file = { path: "new.epub" };
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(painted, []);
  }
});

test("mobile TOC passes ebook hrefs to the engine instead of the empty PDF pager", () => {
  const start = source.indexOf("  _buildTocPanel() {", source.indexOf("const ReaderModal"));
  const end = source.indexOf("\n  }", start) + 4;
  let jump; const targets = [];
  const method = vm.runInNewContext(`({${source.slice(start, end)}})._buildTocPanel`, {
    buildTocPanelFor: (_view, _panel, options) => { jump = options.jump; },
    navigateEngineToc: (view, target) => view.engine.goToTocItem(target),
  });
  method.call({ engine: { goToTocItem: target => targets.push(target) }, _jumpToBlock: () => assert.fail("legacy pager used"),
    _closePanel() {}, _navigateEngineToc: target => targets.push(target) });
  jump({ href: "chapter2.xhtml", label: "Chapter 2" });
  assert.deepEqual(targets, ["chapter2.xhtml"]);
});

test("history restoration uses CFI with percentage fallback and never reports success after switching books", async () => {
  const notices = [], calls = [];
  const restore = vm.runInNewContext(`${functionSource("restoreEngineHistory")}\nrestoreEngineHistory`, {
    Notice: class { constructor(message) { notices.push(message); } }, qiaomuReaderTranslate: key => key, console,
  });
  const view = { file: { path: "book.epub" }, engine: {
    goTo: async cfi => { calls.push(cfi); if (cfi === "stale") throw new Error("stale"); },
    goToFraction: async fraction => calls.push(fraction),
  }, closePanel: () => calls.push("close") };
  await restore(view, { cfi: "valid", pct: .6, percent: 60 });
  assert.deepEqual(calls, ["valid", "close"]);
  calls.length = 0;
  await restore(view, { cfi: "stale", pct: .6, percent: 60 });
  assert.deepEqual(calls, ["stale", .6, "close"]);
  calls.length = 0; notices.length = 0;
  let release;
  view.engine.goTo = () => new Promise(resolve => { release = resolve; });
  const pending = restore(view, { cfi: "valid", pct: .6 });
  view.file = { path: "another.epub" }; release(); await pending;
  assert.deepEqual(calls, []); assert.deepEqual(notices, []);
});

test("engine reopening releases the previous parser; invalid navigation cannot claim success", async () => {
  const dom = new JSDOM("<body><main></main></body>", { runScripts: "outside-only" });
  const elements = foliateElements(root);
  const { EpubEngine } = evaluate(dom, await bundle(elements));
  const View = dom.window.customElements.get(JSON.parse(elements.define.__QBR_ENGINE_VIEW_TAG__));
  let disposed = 0, moves = 0;
  View.prototype.open = async function () { this.book = { sections: [{}, {}], destroy: () => disposed++ }; };
  View.prototype.init = async function () {
    this.lastLocation = { cfi: "valid" };
    this.renderer = { getContents: () => [{ index: 0, doc: dom.window.document }] };
  };
  View.prototype.close = function () {};
  View.prototype.resolveNavigation = target => ({ index: target === "bad" ? 999 : 1 });
  View.prototype.goTo = async function (target) { moves++; return this.resolveNavigation(target); };
  const engine = new EpubEngine(dom.window.document.querySelector("main"));
  try {
    await engine.open(new Uint8Array(), "one.epub");
    await engine.open(new Uint8Array(), "two.epub");
    assert.equal(disposed, 1);
    await assert.rejects(engine.goTo("bad"), /location/);
    assert.equal(moves, 0, "out-of-range section must never reach renderer");
    await assert.rejects(engine.goTo("valid-but-noop"), /location/);
    await assert.rejects(engine.goToFraction(NaN), /location/);
  } finally { engine.destroy(); dom.window.close(); }
  assert.equal(disposed, 2);
});

test("ebook bookmarks capture the engine CFI without requiring a PDF flow", async () => {
  const { normalizeLocationMarks } = await import('../src/reading-workflow.js');
  let save;
  const add = vm.runInNewContext(`${functionSource("addLocationMark")}\naddLocationMark`, {
    ReaderNameModal: class { constructor(_app, _title, _label, callback) { save = callback; } open() {} },
    qiaomuReaderTranslate: key => key, newAiSessionKey: () => 'bookmark-one', normalizeLocationMarks,
    readerIsPdf: () => false,
  });
  const view = { file: { path: "Book.epub" }, engine: {
    currentLocation: () => ({ cfi: "epubcfi(/6/4!/4/2)", fraction: .4, tocItem: { label: "Chapter" } }),
    visibleText: () => "The bookmarked passage",
  }, plugin: { settings: {}, saveAll: async () => {} } };
  add(view); assert.ok(save); await save('My bookmark');
  const [mark] = view.plugin.settings.locationMarks;
  assert.equal(mark.anchor.cfi, "epubcfi(/6/4!/4/2)");
  assert.equal(mark.anchor.block, undefined);
  assert.equal(mark.excerpt, 'The bookmarked passage');
  assert.deepEqual(normalizeLocationMarks([mark]), [mark]);
});

test("background frame waits finish and clear callbacks even when RAF is suspended", async () => {
  const { waitForReaderFrame } = await import('../src/reader-load.js');
  for (const visible of [true, false]) {
    let tick, paint; const cancelled = [], cleared = [];
    const pending = waitForReaderFrame({ setTimeout: fn => { tick = fn; return 1; },
      clearTimeout: id => cleared.push(id), requestAnimationFrame: fn => { paint = fn; return 2; },
      cancelAnimationFrame: id => cancelled.push(id) });
    (visible ? paint : tick)(); await pending;
    assert.deepEqual(cancelled, [2]); assert.deepEqual(cleared, [1]);
  }
});

test("a PDF render finishing after a book switch cannot paint stale pages or start remaining pages", async () => {
  const dom = new JSDOM('<main><img data-pdf-page="1"><img data-pdf-page="2"></main>');
  let release, rendered = 0;
  const flow = dom.window.document.querySelector('main');
  const lazy = { render: () => { rendered++; return new Promise(resolve => { release = resolve; }); } };
  const view = { pager: { flow, sw: 600, spread: 0 }, _pdfLazy: lazy };
  const sweep = vm.runInNewContext(`${functionSource('drawFigure')}\n${functionSource('sweepReaderFigures')}\nsweepReaderFigures`, {
    FIGURE_SURFACE_SELECTOR: '.surface', FIGURE_LAZY_SELECTOR: 'img', FIGURE_LOADED_ATTR: 'data-loaded',
    FIGURE_RENDERING_CLASS: 'rendering',
    FIGURE_LOAD_SPAN: 2, FIGURE_DROP_SPAN: 6,
    figureSpreadGap: () => 0, figurePageNumber: img => Number(img.dataset.pdfPage),
    markFigureUnavailable: () => assert.fail('stale error shown'),
  });
  const pending = sweep(view, lazy);
  view._pdfLazy = {}; release({ src: 'data:image/png;base64,stale', textLayer: null }); await pending;
  assert.equal(rendered, 1);
  assert.equal(flow.querySelector('img').hasAttribute('src'), false);
  dom.window.close();
});

test("visible PDF pages gain selectable text and offscreen pages collapse back to one text node", async () => {
  const dom = new JSDOM('<main><div class="surface"><img data-pdf-page="1" data-loaded="0"><div class="qiaomu-reader-pdf-text-layer qiaomu-reader-pdf-text-placeholder">fallback</div></div></main>');
  dom.window.Element.prototype.addClass = function (name) { this.classList.add(name); };
  dom.window.Element.prototype.removeClass = function (name) { this.classList.remove(name); };
  const flow = dom.window.document.querySelector('main');
  let gap = 0;
  const textLayer = dom.window.document.createElement('div');
  textLayer.className = 'qiaomu-reader-pdf-text-layer';
  textLayer.setAttribute('data-pdf-selectable', 'true');
  textLayer.innerHTML = '<span>selectable</span>';
  const lazy = {
    _destroyed: false,
    render: async () => ({ src: 'data:image/png;base64,page', textLayer }),
    textFor: () => 'fallback',
  };
  const pager = { flow, sw: 600, spread: 0, scrollMode: false };
  const view = { pager, _pdfLazy: lazy, _closed: false };
  const sweep = vm.runInNewContext(`${functionSource('drawFigure')}\n${functionSource('sweepReaderFigures')}\nsweepReaderFigures`, {
    FIGURE_SURFACE_SELECTOR: '.surface', FIGURE_LAZY_SELECTOR: 'img', FIGURE_LOADED_ATTR: 'data-loaded',
    FIGURE_RENDERING_CLASS: 'rendering',
    FIGURE_LOAD_SPAN: 2, FIGURE_DROP_SPAN: 6,
    figureSpreadGap: () => gap, figurePageNumber: img => Number(img.dataset.pdfPage),
    markFigureUnavailable: () => assert.fail('page should remain renderable'),
  });

  await sweep(view, lazy);
  assert.equal(flow.querySelector('img').getAttribute('data-loaded'), '1');
  assert.equal(flow.querySelector('.qiaomu-reader-pdf-text-layer').getAttribute('data-pdf-selectable'), 'true');
  assert.equal(flow.querySelectorAll('.qiaomu-reader-pdf-text-layer span').length, 1);

  gap = 10;
  await sweep(view, lazy);
  assert.equal(flow.querySelector('img').hasAttribute('src'), false);
  const collapsed = flow.querySelector('.qiaomu-reader-pdf-text-layer');
  assert.equal(collapsed.classList.contains('qiaomu-reader-pdf-text-placeholder'), true);
  assert.equal(collapsed.getAttribute('data-pdf-selectable'), 'false');
  assert.equal(collapsed.textContent, 'fallback');
  assert.equal(collapsed.querySelectorAll('span').length, 0);
  dom.window.close();
});

test("the PDF paginator rejects ebook HTML before layout or parsing", async () => {
  const start = source.indexOf('const PdfPaginator = class');
  const end = source.indexOf('function createPdfPaginator(', start);
  const PdfPaginator = vm.runInNewContext(`${source.slice(start, end)}\nPdfPaginator`, { PDF_ZOOM_DEFAULT: 1 });
  await assert.rejects(new PdfPaginator().build({}, '<p>ebook text</p>', {}, 0), /PDF page surfaces required/);
});
