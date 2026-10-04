import test from "node:test";
import assert from "node:assert/strict";
import { protectBooksFromNoteDeletion } from "../src/book-deletion-guard.js";

const extensions = new Set(["epub", "pdf", "mobi", "azw", "azw3", "fb2", "fbz", "cbz"]);
function setup(option = "ask") {
  const files = new Map();
  const deleted = [], prompts = [];
  const links = {};
  const app = { metadataCache: { resolvedLinks: links }, vault: { option } };
  const manager = {
    app,
    async trashFile(file) {
      assert.equal(this, manager);
      deleted.push(file.path);
      files.delete(file.path);
      delete links[file.path];
    },
    // Host contract: collect outgoing attachments before trashing the note,
    // then exclude remaining references and ask/delete according to settings.
    async promptForDeletion(file, accepted = true) {
      if (!accepted) return false;
      const cache = this.app.metadataCache.resolvedLinks;
      const candidates = Object.keys(cache[file.path] || {}).filter(p => !p.endsWith(".md"));
      await this.trashFile(file);
      const orphaned = candidates.filter(p => !Object.values(cache).some(row => row[p]));
      if (this.app.vault.option === "ask" && orphaned.length) prompts.push(orphaned);
      if (this.app.vault.option === "always") {
        for (const p of orphaned) await this.trashFile(files.get(p));
      }
      return true;
    },
  };
  app.fileManager = manager;
  function add(path, outgoing = {}) {
    const file = { path, extension: path.split(".").at(-1) };
    files.set(path, file);
    links[path] = outgoing;
    return file;
  }
  return { app, manager, links, files, deleted, prompts, add };
}

for (const option of ["ask", "always", "never"]) {
  test(`deleting a note preserves all supported source books with cleanup=${option}`, async () => {
    const h = setup(option);
    const books = [...extensions].map(ext => h.add(`Books/source.${ext.toUpperCase()}`));
    const outgoing = Object.fromEntries(books.map(book => [book.path, 1]));
    const note = h.add("Notes/reading.md", outgoing);
    const dispose = protectBooksFromNoteDeletion(h.app, extensions);
    await h.manager.promptForDeletion(note);
    assert.deepEqual(h.deleted, [note.path]);
    assert.deepEqual(h.prompts, []);
    for (const book of books) assert.ok(h.files.has(book.path));
    assert.equal(Object.keys(outgoing).length, extensions.size);
    dispose();
  });
}

test("ordinary orphaned attachments retain cleanup and shared images stay protected", async () => {
  const h = setup("always");
  h.add("book.epub"); h.add("orphan.png"); h.add("shared.png");
  h.add("other.md", { "shared.png": 1 });
  const note = h.add("reading.md", { "book.epub": 1, "orphan.png": 1, "shared.png": 1 });
  protectBooksFromNoteDeletion(h.app, extensions);
  await h.manager.promptForDeletion(note);
  assert.deepEqual(h.deleted, ["reading.md", "orphan.png"]);
  assert.ok(h.files.has("shared.png"));
});

test("cancellation and explicit book deletion keep native behavior", async () => {
  const h = setup("always");
  const book = h.add("book.pdf"), note = h.add("note.md", { "book.pdf": 1 });
  protectBooksFromNoteDeletion(h.app, extensions);
  assert.equal(await h.manager.promptForDeletion(note, false), false);
  assert.deepEqual(h.links[note.path], { "book.pdf": 1 });
  assert.deepEqual(h.deleted, []);
  await h.manager.promptForDeletion(book);
  assert.deepEqual(h.deleted, [book.path]);
});

test("concurrent deletions have separate metadata views without changing the global cache", async () => {
  const h = setup("ask");
  h.add("book.epub"); h.add("image.png");
  const a = h.add("a.md", { "book.epub": 1 });
  const b = h.add("b.md", { "image.png": 1 });
  protectBooksFromNoteDeletion(h.app, extensions);
  await Promise.all([h.manager.promptForDeletion(a), h.manager.promptForDeletion(b)]);
  assert.deepEqual(h.prompts, [["image.png"]]);
  assert.equal(h.app.metadataCache.resolvedLinks, h.links);
});

test("unload restores the hook and respects wrappers installed by other plugins", async () => {
  const h = setup();
  const original = h.manager.promptForDeletion;
  const dispose = protectBooksFromNoteDeletion(h.app, extensions);
  dispose();
  assert.equal(h.manager.promptForDeletion, original);
  const disposeAgain = protectBooksFromNoteDeletion(h.app, extensions);
  const readerWrapper = h.manager.promptForDeletion;
  const laterWrapper = function (...args) { return readerWrapper.apply(this, args); };
  h.manager.promptForDeletion = laterWrapper;
  disposeAgain();
  assert.equal(h.manager.promptForDeletion, laterWrapper);
  h.add("book.epub");
  await h.manager.promptForDeletion(h.add("note.md", { "book.epub": 1 }));
  assert.deepEqual(h.prompts, [["book.epub"]]);
});

test("hosts without the internal deletion hook are left untouched", () => {
  const app = { fileManager: {} };
  protectBooksFromNoteDeletion(app, extensions)();
  assert.deepEqual(app.fileManager, {});
});
