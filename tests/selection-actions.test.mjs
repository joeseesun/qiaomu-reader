import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { parse } from "acorn";
import { JSDOM } from "jsdom";
import { selectionActionPreferences } from "../src/selection-preferences.js";
import { highlightBacklink } from "../src/highlight-navigation.js";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
const functions = ast.body.filter(n => n.type === "FunctionDeclaration");
const names = ["selectionActions","matchingSelectionHighlight", "selectionColor", "clearReaderSelection", "beginReaderSelection", "engineSelectionRect", "openReaderSelectionContext", "selectionFeedback", "repaintSelectionHighlights", "applySelectionColor", "closeSelectionColorDropdown", "toggleSelectionColorDropdown", "syncSelectionToolbar", "addBarButtons", "openSelectionMoreMenu", "copySelectionText", "openAiSelectionChat", "closeInlineHighlightComment", "openInlineHighlightComment", "handleAreaNavClick"];
const code = functions.filter(n => names.includes(n.id.name)).map(n => source.slice(n.start, n.end)).join("\n");
const tick = () => new Promise(r => setTimeout(r, 5));
function setup() {
  const { window } = new JSDOM('<main><article></article><div class="popup"></div></main>', { pretendToBeVisual: true });
  const proto = window.HTMLElement.prototype;
  proto.createEl = function(tag, opts = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (typeof opts === "string") el.className = opts;
    else {
      el.className = opts.cls || ""; el.textContent = opts.text || "";
      for (const [key, value] of Object.entries(opts.attr || {})) el.setAttribute(key, value);
    }
    this.append(el); return el;
  };
  proto.createDiv = function(opts) { return this.createEl("div", opts); };
  proto.createSpan = function(opts) { return this.createEl("span", opts); };
  proto.addClass = function(c) { this.classList.add(c); };
  proto.removeClass = function(c) { this.classList.remove(c); };
  const menus = [], copied = [], records = [], savedComments = [];
  class Menu {
    constructor() { this.items = []; menus.push(this); }
    addItem(make) {
      const item = { setTitle(v) { this.title = v; return this; }, setIcon() { return this; }, setChecked(v) { this.checked = v; return this; }, onClick(fn) { this.run = fn; return this; } };
      make(item); this.items.push(item); return this;
    }
    addSeparator() {}
    onHide(fn) { this.onhide = fn; }
    hide() { this.onhide?.(); }
    showAtPosition(pos) { this.pos = pos; }
  }
  const root = window.document.querySelector("main");
  const view = {
    file: { path: "Book.mobi", extension: "mobi" }, app: { vault: { getName: () => "Vault" } },
    contentEl: root, areaEl: root.querySelector("article"), hlPopup: root.querySelector(".popup"),
    plugin: { settings: { defaultHlColor: "yellow", navMode: "click" }, getHighlights: () => records,
      setHighlightColor: (_, id, color) => { records.find(h => h.id === id).color = color; },
      addHighlight: (_, h) => records.push(h), removeHighlight: (_, id) => records.splice(records.findIndex(h => h.id === id), 1),
      saveAll: async () => true,
      setHighlightComment: async (_, id, hl, text) => { records.find(h => h.id === id).comment = text; savedComments.push(text); return true; },
    },
    _pendingSel: { cfi: "epubcfi(/6/2!/4/2,/1:0,/1:4)", text: "选中文本" },
    _currentHl() { return records.find(h => h.id === this._editHlId) || this._pendingSel; },
    _showHlPopup(rect) { this._hlPopupRect = rect; this.hlPopup.classList.add("qiaomu-reader-hl-popup-on"); },
    _hideHlPopup() { api.closeInlineHighlightComment(this); this.hlPopup.classList.remove("qiaomu-reader-hl-popup-on"); this._pendingSel = null; this._editHlId = null; },
    _renderFlowHighlights() {}, _unwrapHighlight() {},
    _createHighlight(sel, color) { const existing = api.matchingSelectionHighlight(this, sel); if (existing) { existing.color = color; return existing.id; } const id = "h" + records.length; records.push({ ...sel, color, id }); return id; },
    _applyPopupColor(color) { api.applySelectionColor(this, color); },
  };
  class Scope { constructor() { this.bindings = []; } register(mods, key, run) { this.bindings.push({ mods, key, run }); } }
  const translations = [];
  const context = { selectionActionPreferences, openLookupCard: v => translations.push({ text: v._currentHl().text, file: v.file }), window, Menu, Scope, aiSetupState: () => ({ ready: true, enabled: true }), paintAiSource() {}, qiaomuReaderTranslate: k => k, setIcon() {}, highlightBacklink,
    docOf: el => el.ownerDocument, selOf: el => el.ownerDocument.getSelection(), readerIsPdf: () => false,
    qiaomuReaderRefreshHlPanel() {}, qiaomuReaderAutoFocus() {}, positionHlPopup() {},
    hlCommentQuoteBlock() {}, Notice: class {},
    ttsText: (_plugin, key) => key,
    openTts: (_view, text) => { view._spokenSelection = text; },
    copyToClipboard: async text => { copied.push(text); return true; },
    hlColorCss: color => color, QUICK_HL_COLOR_IDS: ["yellow", "green", "pink"],
    HL_COLORS: ["yellow", "green", "pink", "blue"].map(id => ({ id, label: () => id })),
  };
  const api = vm.runInNewContext(`${code}\n({${names.join(",")}})`, context);
  view._showHlPopup({ left: 10, right: 210, top: 100, bottom: 120, width: 200, height: 20 });
  return { window, view, api, menus, records, copied, savedComments, translations, close: () => window.close() };
}

test("toolbar exposes stable labeled actions and a separate three-color menu", () => {
  const f = setup(); const { api, view, menus } = f;
  api.addBarButtons(view, view.hlPopup);
  const labels = [...view.hlPopup.querySelectorAll("button")].map(b => b.getAttribute("aria-label"));
  assert.deepEqual(labels, ["highlight-action", "highlight-colors", "annotate-action", "ask-ai-action", "copy", "more"]);
  view.hlPopup.querySelector(".qiaomu-reader-hl-colors").click();
  assert.equal(menus.length, 0, "colors use an attached dropdown, not an OS context menu");
  assert.equal(view.hlPopup.querySelectorAll('[role="radio"]').length, 3);
  assert.equal(view.hlPopup.querySelector('[role="radio"]').getAttribute("aria-checked"), "true");
  view.hlPopup.querySelector(".qiaomu-reader-hl-colors").click();
  assert.equal(view.hlPopup.querySelector(".qiaomu-reader-color-dropdown"), null);
  f.close();
});

test("right-click in a book iframe captures selection before the native menu and preserves CFI when copying its link", async () => {
  const f = setup(); const { view, api, menus, copied, window } = f;
  const frame = window.document.createElement("iframe"); view.areaEl.append(frame);
  frame.getBoundingClientRect = () => ({ left: 100, top: 50 });
  const doc = frame.contentDocument; doc.body.textContent = "选中文本";
  const range = doc.createRange(); range.selectNodeContents(doc.body); doc.getSelection().addRange(range);
  view.engine = {};
  view._engineSelectionCheck = ({ doc: actual, index }) => { assert.equal(actual, doc); assert.equal(index, 12); view._selectionDoc = doc; };
  const event = new doc.defaultView.MouseEvent("contextmenu", { clientX: 30, clientY: 40, cancelable: true });
  api.openReaderSelectionContext(view, event, doc, 12);
  assert.equal(event.defaultPrevented, true);
  const menu = menus[0]; assert.equal(menu.pos.x, 130); assert.equal(menu.pos.y, 90);
  assert.deepEqual(menu.items.slice(0, 4).map(i => i.title), ["highlight-action", "annotate-action", "ask-ai-action", "copy"]);
  doc.getSelection().removeAllRanges(); view._hideHlPopup();
  await menu.items.find(i => i.title === "copy-position-link").run(); await tick();
  assert.match(copied[0], /cfi=epubcfi%28/);
  f.close();
});

test("an open menu cannot apply an old selection to another book", () => {
  const f = setup(); f.api.openSelectionMoreMenu(f.view, {}, true);
  f.view.file = { path: "Another.mobi" };
  f.menus[0].items[0].run();
  assert.equal(f.records.length, 0); f.close();
});

test("recoloring an existing CFI keeps its ID and comment; undo restores the previous color", () => {
  const f = setup(); const { records, view, api } = f;
  records.push({ ...view._pendingSel, id: "existing", color: "yellow", comment: "保留批注" });
  view._editHlId = "existing";
  api.applySelectionColor(view, "green");
  assert.equal(records.length, 1); assert.equal(records[0].id, "existing"); assert.equal(records[0].comment, "保留批注");
  assert.equal(records[0].color, "green"); assert.equal(view.plugin.settings.defaultHlColor, "green");
  view.contentEl.querySelector(".qiaomu-reader-selection-feedback button").click();
  assert.equal(records[0].color, "yellow"); f.close();
});

test("comment drafts survive dismissal; ordinary Enter and IME confirmation do not submit", async () => {
  const f = setup(); const { api, view, window, savedComments, records } = f;
  const pending = { ...view._pendingSel };
  api.openInlineHighlightComment(view);
  let ta = view.hlPopup.querySelector("textarea"); ta.value = "第一行\n第二行"; ta.dispatchEvent(new window.Event("input"));
  ta.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ta.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, isComposing: true, bubbles: true }));
  assert.equal(records.length, 0);
  view._hideHlPopup(); view._pendingSel = pending; api.openInlineHighlightComment(view);
  ta = view.hlPopup.querySelector("textarea"); assert.equal(ta.value, "第一行\n第二行");
  ta.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  await tick();
  assert.equal(records.length, 1); assert.deepEqual(savedComments, ["第一行\n第二行"]);
  assert.equal(view.plugin._highlightCommentDrafts.size, 0); f.close();
});

test("the click dismissing a popup is consumed once before edge navigation", () => {
  const f = setup(); let pages = 0;
  f.view.areaEl.getBoundingClientRect = () => ({ left: 0, width: 500 }); f.view.nav = () => pages++;
  f.api.beginReaderSelection(f.view, { button: 0, pointerType: "mouse" });
  const event = { target: f.view.areaEl, clientX: 490 };
  assert.equal(f.api.handleAreaNavClick(f.view, event), true); assert.equal(pages, 0);
  f.api.handleAreaNavClick(f.view, event); assert.equal(pages, 1); f.close();
});


test("temporary Obsidian key scope saves the comment and is released on dismissal", async () => {
  const f = setup(); const scopes = [];
  f.view.app.keymap = { pushScope: s => scopes.push(s), popScope: s => scopes.splice(scopes.indexOf(s), 1) };
  f.api.openInlineHighlightComment(f.view);
  const ta = f.view.hlPopup.querySelector("textarea"); ta.value = "组合键批注";
  assert.equal(scopes.length, 1);
  scopes[0].bindings.find(b => b.key === "Enter").run({ isComposing: false });
  await tick();
  assert.equal(f.records[0].comment, "组合键批注"); assert.equal(scopes.length, 0);
  f.view._editHlId = f.records[0].id; f.api.openInlineHighlightComment(f.view);
  assert.equal(scopes.length, 1); f.view._hideHlPopup(); assert.equal(scopes.length, 0);
  f.close();
});

test("Ask AI attaches selected text and book context without submitting a prompt", async () => {
  const f = setup(); const contexts = [];
  f.view.plugin.openAiChat = async context => contexts.push(context);
  f.api.openAiSelectionChat(f.view); await tick();
  assert.equal(contexts.length, 1); assert.equal(contexts[0].text, "选中文本");
  assert.equal(contexts[0].bookFile.path, "Book.mobi"); assert.equal(contexts[0].kind, "selection");
  assert.equal(f.view._pendingSel, null); f.close();
});


test("icon-only defaults keep accessible names, translated text is opt-in", () => {
  const f = setup(); f.api.addBarButtons(f.view, f.view.hlPopup);
  assert.equal(f.view.hlPopup.querySelectorAll(".qiaomu-reader-selection-label").length, 0);
  assert.ok([...f.view.hlPopup.querySelectorAll("button")].every(b => b.getAttribute("aria-label")));
  f.view.plugin.settings.selectionShowLabels = true;
  f.api.syncSelectionToolbar(f.view);
  assert.equal(f.view.hlPopup.querySelectorAll(".qiaomu-reader-hl-actions").length, 1);
  assert.equal(f.view.hlPopup.querySelectorAll(".qiaomu-reader-selection-label").length, 4);
  f.close();
});

test("translation becomes a primary action only when enabled and retains selected text", () => {
  const f = setup(); f.api.syncSelectionToolbar(f.view);
  assert.equal(f.view.hlPopup.querySelector(".qiaomu-reader-hl-translate"), null);
  f.view.plugin.settings.translateEnabled = true; f.api.syncSelectionToolbar(f.view);
  f.view.hlPopup.querySelector(".qiaomu-reader-hl-translate").click();
  assert.deepEqual(f.translations.map(t => t.text), ["选中文本"]);
  assert.equal(f.translations[0].file.path, "Book.mobi");
  f.close();
});

test("configured order is shared with right click and hidden actions remain in More", () => {
  const f = setup();
  f.view.plugin.settings.selectionActions = [{ id: "copy" }, { id: "highlight", visible: false }];
  f.api.syncSelectionToolbar(f.view);
  assert.equal(f.view.hlPopup.querySelector("button").getAttribute("aria-label"), "copy");
  assert.equal(f.view.hlPopup.querySelector(".qiaomu-reader-highlight-split"), null);
  f.api.openSelectionMoreMenu(f.view, {}, false);
  assert.equal(f.menus[0].items[0].title, "highlight-action");
  f.api.openSelectionMoreMenu(f.view, {}, true);
  assert.deepEqual(f.menus[1].items.slice(0, 4).map(i => i.title), ["copy", "highlight-action", "annotate-action", "ask-ai-action"]);
  f.close();
});

test("preferences recover malformed values and preserve deliberate all-hidden state", () => {
  const defaults = selectionActionPreferences(null);
  assert.equal(defaults.length, 5);
  const normalized = selectionActionPreferences([null, {id:"bogus"}, {id:"copy",visible:false}, {id:"copy"}]);
  assert.equal(normalized.length, 5); assert.equal(normalized[0].visible, false);
  const f = setup(); f.view.plugin.settings.selectionActions = defaults.map(x => ({...x, visible:false}));
  f.api.addBarButtons(f.view, f.view.hlPopup);
  assert.equal(f.view.hlPopup.querySelectorAll("button").length, 1);
  assert.ok(f.view.hlPopup.querySelector(".qiaomu-reader-hl-menu")); f.close();
});
