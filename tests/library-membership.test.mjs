import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { setBookMembership } from "../src/library-membership.js";
import { isListedBook, isTextBook } from "../src/text-book.js";
import { openReaderLeaf } from "../src/open-reader.js";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
function fixture(name) {
  const file = { path: `Books/${name}`, name };
  let disk, commands = 0;
  const plugin = { settings: { textBookPaths: [file.path], bookNoteLinks: { [file.path]: "Notes/Book.md" } },
    progress: { [file.path]: { percent: 42 } }, highlights: { [file.path]: [{ text: "Keep me" }] },
    async _saveLocalData() { disk = JSON.parse(JSON.stringify(this.settings)); return true; },
    registerBookCommands() { commands++; } };
  return { file, plugin, disk: () => disk, commands: () => commands };
}

for (const name of ["a.md", "a.markdown", "a.txt", "a.html", "a.htm", "a.epub", "a.pdf"]) {
  test(`removing ${name} persists visibility without changing source or reading records; re-add restores it`, async () => {
    const { file, plugin, disk } = fixture(name);
    const reading = JSON.stringify([plugin.progress, plugin.highlights, plugin.settings.bookNoteLinks]);
    await setBookMembership(plugin, file, false, isTextBook(file.name));
    assert.equal(isListedBook(file, "Books", disk().textBookPaths, disk().removedBookPaths), false);
    assert.equal(JSON.stringify([plugin.progress, plugin.highlights, plugin.settings.bookNoteLinks]), reading);
    await setBookMembership(plugin, file, true, isTextBook(file.name));
    assert.equal(isListedBook(file, "Books", disk().textBookPaths, disk().removedBookPaths), true);
    assert.equal(JSON.stringify([plugin.progress, plugin.highlights, plugin.settings.bookNoteLinks]), reading);
  });
}

test("a failed settings write rolls back membership and does not refresh commands", async () => {
  for (const failure of [false, new Error("disk full")]) {
    const x = fixture("book.md");
    x.plugin._saveLocalData = async () => { if (failure instanceof Error) throw failure; return failure; };
    await assert.rejects(setBookMembership(x.plugin, x.file, false, true));
    assert.deepEqual(x.plugin.settings.removedBookPaths, []);
    assert.equal(x.commands(), 0);
  }
});

test("opening a new text book selects only that document; repeated opening does not write", async () => {
  const x = fixture("new.md"); x.plugin.settings.textBookPaths = [];
  await setBookMembership(x.plugin, x.file, true, true);
  assert.deepEqual(x.disk().textBookPaths, [x.file.path]);
  assert.equal(await setBookMembership(x.plugin, x.file, true, true), false);
  assert.equal(x.commands(), 1);
  assert.equal(isListedBook({ name: "ordinary.md", path: "Notes/ordinary.md" }, "", x.disk().textBookPaths), false);
});

test("continue reading ignores removed books without deleting their progress", () => {
  const code = source.slice(source.indexOf("  lastReadBookFile() {"), source.indexOf("  registerBookCommands() {"));
  const method = vm.runInNewContext(`({${code}}).lastReadBookFile`);
  const files = { "hidden.md": { path: "hidden.md", extension: "md" }, "visible.pdf": { path: "visible.pdf", extension: "pdf" } };
  const plugin = { settings: { removedBookPaths: ["hidden.md"], lastBookPath: "hidden.md" },
    progress: { "hidden.md": { lastRead: 99 }, "visible.pdf": { lastRead: 10 } },
    app: { vault: { getAbstractFileByPath: path => files[path] } } };
  assert.equal(method.call(plugin), files["visible.pdf"]);
  delete plugin.progress["visible.pdf"];
  assert.equal(method.call(plugin), null);
});

test("first opening a Markdown card uses FileView state, materializes deferred reader and then reveals it", async () => {
  for (const deferred of [false, true]) {
    const file = { path: "Books/new.md" }, order = [];
    const leaf = { view: { file: null }, async setViewState(state) {
      assert.equal(state.type, "qiaomu-reader");
      assert.equal(state.state.file, file.path);
      assert.equal(state.state.path, file.path);
      order.push("state");
      if (!deferred) this.view = { file };
    }, async loadIfDeferred() { this.view = { file }; order.push("load"); } };
    const workspace = { getLeavesOfType: () => deferred ? [leaf] : [], getLeaf: () => leaf,
      async revealLeaf(target) { assert.equal(target.view.file, file); order.push("reveal"); },
      setActiveLeaf(target, options) { assert.equal(target, leaf); assert.equal(options.focus, true); order.push("activate"); } };
    assert.equal(await openReaderLeaf(workspace, file, "qiaomu-reader"), leaf);
    assert.deepEqual(order, ["state", "activate", "load", "reveal", "activate"]);
  }
});

test("a hidden reused reader becomes visible before waiting for layout-dependent loading", async () => {
  const file = { path: "Books/first.md" }; let finish, active;
  const leaf = { view: { file: { path: "Books/previous.md" } },
    setViewState() { return new Promise(resolve => { finish = () => { this.view = { file }; resolve(); }; }); } };
  const workspace = { getLeavesOfType: () => [leaf], getLeaf() { throw new Error("must reuse existing tab"); },
    setActiveLeaf(target) { active = target; finish?.(); },
    async revealLeaf(target) { assert.equal(active, target); assert.equal(target.view.file, file); } };
  await openReaderLeaf(workspace, file, "qiaomu-reader");
  assert.equal(active, leaf);
});

test("removed entries follow folder renames with reading data; deleting a source prunes the visibility marker", () => {
  const code = source.slice(source.indexOf("  _watchBookFiles() {"), source.indexOf("  _scheduleFirstRunFlow() {"));
  const method = vm.runInNewContext(`({${code}})._watchBookFiles`, { window: { clearTimeout() {}, setTimeout() {} }, BOOK_EXTENSIONS: new Set(["md", "pdf"]) });
  const events = {}, plugin = { settings: { textBookPaths: ["Books/a.md"], removedBookPaths: ["Books/a.md", "Books/b.pdf"], bookNoteLinks: { "Books/a.md": "Notes/a.md" } },
    progress: { "Books/a.md": { percent: 42 }, "Books/b.pdf": { percent: 70 } }, highlights: { "Books/a.md": [{ text: "keep" }] },
    app: { vault: { on(name, callback) { (events[name] ||= []).push(callback); } } },
    registerEvent() {}, registerBookCommands() {}, saveAll() {}, _saveLocalData() {},
    _persistHighlights(next, update) { update(this.highlights); return Promise.resolve(true); } };
  method.call(plugin);
  events.rename[0]({ path: "Archive" }, "Books");
  assert.deepEqual(Array.from(plugin.settings.removedBookPaths), ["Archive/a.md", "Archive/b.pdf"]);
  assert.equal(plugin.progress["Archive/a.md"].percent, 42);
  assert.equal(plugin.progress["Archive/b.pdf"].percent, 70);
  assert.equal(plugin.highlights["Archive/a.md"][0].text, "keep");
  assert.equal(plugin.settings.bookNoteLinks["Archive/a.md"], "Notes/a.md");
  events.delete[0]({ path: "Archive/a.md" });
  assert.deepEqual(Array.from(plugin.settings.removedBookPaths), ["Archive/b.pdf"]);
});

function deletionFixture(failing = false) {
  const start = source.indexOf("function deleteBookFromVault("), end = source.indexOf("\nconst QUOTE_TEMPLATE_DEFAULT", start);
  let confirmation, trashed = 0, dropped = 0, refreshed = 0;
  const remove = vm.runInNewContext(`${source.slice(start, end)}; deleteBookFromVault`, {
    ConfirmModal: class { constructor(app, options) { confirmation = options; } open() {} },
    qiaomuReaderTranslate: (key, path) => `${key}:${path || ""}`, Notice: class {}, console: { error() {} },
    async dropBookState() { dropped++; },
  });
  const app = { fileManager: { async trashFile() { trashed++; if (failing) throw new Error("trash unavailable"); } } };
  remove(app, {}, { path: "Books/owned.md", basename: "owned" }, () => refreshed++);
  return { confirmation: () => confirmation, stats: () => ({ trashed, dropped, refreshed }) };
}

test("source deletion requires explicit confirmation, names its path and focuses cancel", async () => {
  const x = deletionFixture();
  assert.deepEqual(x.stats(), { trashed: 0, dropped: 0, refreshed: 0 });
  assert.equal(x.confirmation().focusCancel, true);
  assert.match(x.confirmation().body, /Books\/owned.md/);
  await x.confirmation().onYes();
  assert.deepEqual(x.stats(), { trashed: 1, dropped: 1, refreshed: 1 });
});

test("a failed trash operation keeps reading records", async () => {
  const x = deletionFixture(true);
  await x.confirmation().onYes();
  assert.deepEqual(x.stats(), { trashed: 1, dropped: 0, refreshed: 0 });
});

test("confirmed deletion persists removal of highlights without rewriting reading notes", async () => {
  const start = source.indexOf("async function dropBookState("), end = source.indexOf("\nfunction deleteBookFromVault", start);
  const purge = vm.runInNewContext(`${source.slice(start, end)}; dropBookState`, { forgetCalibreImportByPath() {} });
  let disk = { "Books/a.md": [{ text: "delete" }], "Books/b.md": [{ text: "keep" }] };
  const plugin = { progress: { "Books/a.md": { percent: 42 } }, highlightsBackups: { "Books/a.md": [{}] },
    settings: { bookNoteLinks: { "Books/a.md": "Notes/a.md" }, tts: { progress: { "Books/a.md": {} } } },
    _highlightsFilePath: () => "reading-highlights.json", async _readHighlightStore() { return structuredClone(disk); },
    async _saveHighlightsToVault() { disk = structuredClone(this.highlights); }, async saveAll() {} };
  await purge(plugin, "Books/a.md");
  assert.equal(disk["Books/a.md"], undefined);
  assert.equal(disk["Books/b.md"][0].text, "keep");
  assert.equal(plugin.settings.bookNoteLinks["Books/a.md"], "Notes/a.md");
  assert.equal(plugin.settings.tts.progress["Books/a.md"], undefined);
  assert.equal(plugin.highlightsBackups["Books/a.md"], undefined);
});
