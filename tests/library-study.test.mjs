import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { JSDOM } from "jsdom";
import { coverPalette } from "../src/book-cover.js";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
function setup() {
  const { window } = new JSDOM("<main></main>");
  const { document, HTMLElement } = window;
  HTMLElement.prototype.setText = function (text) { this.textContent = text; };
  HTMLElement.prototype.addClass = function (...names) { this.classList.add(...names); };
  HTMLElement.prototype.hasClass = function (name) { return this.classList.contains(name); };
  HTMLElement.prototype.toggleClass = function (name, value) { this.classList.toggle(name, value); };
  HTMLElement.prototype.createEl = function (tag, options = {}) {
    const el = document.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  for (const tag of ["div", "span"]) HTMLElement.prototype[`create${tag[0].toUpperCase() + tag.slice(1)}`] = function (options) {
    return this.createEl(tag, typeof options === "string" ? { cls: options } : options);
  };
  let reads = 0, notes = 0, menus = 0, panels = 0;
  const reader = { file: { path: "Books/example.epub" }, hlPan: {}, togglePanel(name) { this.panelOpen = name; panels++; } };
  const plugin = { settings: {}, getProgress: () => ({ percent: 12 }), getHighlights: () => [{ text: "A useful idea" }], openFile: async () => { reads++; return reader; } };
  const code = source.slice(source.indexOf("const LibraryModal = class"), source.indexOf("// ── Mobile full-screen reader modal", source.indexOf("const LibraryModal = class")));
  const Library = vm.runInNewContext(`${code}; LibraryModal`, { Modal: class { close() {} }, window,
    qiaomuReaderTranslate: (key, n) => n === undefined ? key : `${key}:${n}`, svgIcon() {},
    bookNoteLinkFor: () => "linked", resolveBookNote: () => ({}), openOrCreateBookNoteBeside: async () => { notes++; },
    Notice: class {}, Date, qiaomuReaderPath: value => value, coverPalette,
  });
  const library = new Library({}, plugin);
  library.loadThumb = async () => {};
  library._libCardMenu = () => ev => { ev.preventDefault(); ev.stopPropagation(); menus++; };
  const file = { path: "Books/example.epub", basename: "Example", extension: "epub" };
  const host = document.querySelector("main");
  library.renderCard(host, file);
  return { window, Library, library, file, reader, host, stats: () => ({ reads, notes, menus, panels }) };
}

test("library note and highlight controls do not also open the book through card keyboard bubbling", async () => {
  const x = setup();
  const [highlight, note] = x.host.querySelectorAll(".qiaomu-reader-lib-study-button");
  note.dispatchEvent(new x.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  note.click();
  assert.deepEqual(x.stats(), { reads: 0, notes: 1, menus: 0, panels: 0 });
  highlight.dispatchEvent(new x.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
  highlight.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(x.stats(), { reads: 1, notes: 1, menus: 0, panels: 1 });
  assert.equal(x.reader.panelOpen, "highlights");
});

test("card keyboard activation opens once and menu activation stays local", () => {
  const x = setup();
  x.host.querySelector(".qiaomu-reader-lib-card").dispatchEvent(new x.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  x.host.querySelector(".qiaomu-reader-lib-morebtn").click();
  assert.deepEqual(x.stats(), { reads: 1, notes: 0, menus: 1, panels: 0 });
});

test("reopening highlights from library preserves an already open panel", async () => {
  const x = setup(); x.reader.panelOpen = "highlights";
  await x.library._openLibHighlights(x.file);
  assert.equal(x.stats().panels, 0);
});

test("a later book selection cancels pending library highlight opening", async () => {
  const x = setup();
  let finish;
  x.library.plugin.openFile = () => new Promise(resolve => { finish = resolve; });
  const pending = x.library._openLibHighlights(x.file);
  x.library._highlightOpenRequest = {};
  finish(x.reader);
  await pending;
  assert.equal(x.stats().panels, 0);
});


test("overlapping library refreshes render only the newest content", async () => {
  const x = setup(), library = x.library;
  library.containerEl = library.modalEl = library.contentEl = x.host;
  x.host.empty = () => x.host.replaceChildren();
  library._applyLibTheme = library._setupDropZone = () => {};
  library._buildLibBrand = () => x.host.createDiv("header");
  library._buildLibTools = () => ({});
  library._libVaultBooks = () => [];
  let emptyRenders = 0;
  library._buildLibEmpty = () => { emptyRenders++; };
  const ready = [];
  library.plugin.ensureStarterBooks = () => new Promise(resolve => ready.push(resolve));
  library.plugin.refreshProgress = async () => {};
  const first = library.onOpen();
  const second = library.onOpen();
  ready[1](); await second;
  ready[0](); await first;
  assert.equal(emptyRenders, 1);
  assert.equal(x.host.querySelectorAll(".header").length, 1);
});


test("library regenerates stale object-URL covers instead of hiding the title behind a blank image", async () => {
  const x = setup();
  x.library.plugin.thumbCache = { [x.file.path]: "blob:expired-window" };
  x.library.coverFromBookNote = () => null;
  x.library._scheduleThumbFlush = () => {};
  let generated = 0;
  x.library.makeEngineThumb = async () => { generated++; return "data:image/png;base64,new-cover"; };
  const shown = [];
  x.library.showImg = async (_cover, _placeholder, url) => { shown.push(url); return true; };
  x.library.plugin._thumbStore = { get: async () => null, put: async () => "app://vault/thumbs/new.jpg" };
  const cover = x.host.createDiv();
  await x.Library.prototype.loadThumb.call(x.library, x.file, cover, {});
  assert.equal(generated, 1);
  assert.deepEqual(shown, ["app://vault/thumbs/new.jpg"]);
  assert.equal(x.library.plugin.thumbCache[x.file.path], shown[0]);
});
