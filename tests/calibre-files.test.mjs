import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readLibraryFile, searchCalibreLibrary, CALIBRE_BLOCK_BYTES } from '../src/calibre-library.js';

test('Calibre reads a real SQLite library and enforces file boundaries and size before copying', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-calibre-test-'));
  const library = path.join(dir, 'library');
  fs.mkdirSync(library);
  const previous = globalThis.window;
  globalThis.window = { require: createRequire(import.meta.url), process };
  try {
    execFileSync('python3', ['-c', `
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.executescript('''
CREATE TABLE books(id INTEGER, title TEXT, path TEXT, uuid TEXT, has_cover INTEGER, last_modified TEXT);
CREATE TABLE authors(id INTEGER, name TEXT);
CREATE TABLE books_authors_link(book INTEGER, author INTEGER);
CREATE TABLE data(book INTEGER, format TEXT, uncompressed_size INTEGER, name TEXT);
CREATE TABLE identifiers(book INTEGER, type TEXT, val TEXT);
CREATE TABLE last_read_positions(book INTEGER, pos_frac REAL, epoch INTEGER);
CREATE TABLE tags(id INTEGER, name TEXT);
CREATE TABLE books_tags_link(book INTEGER, tag INTEGER);
INSERT INTO books VALUES(1, '测试书', 'Author/Book', 'fixture-uuid', 0, '2026-09-26');
INSERT INTO authors VALUES(1, '测试作者');
INSERT INTO books_authors_link VALUES(1,1);
INSERT INTO data VALUES(1,'EPUB',4,'Book');
INSERT INTO last_read_positions VALUES(1,0.5,123);
''')
c.commit()
`, path.join(library, 'metadata.db')]);
    const result = await searchCalibreLibrary({ libraryPath: library, query: 'title:测试', limit: 10 });
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].uuid, 'fixture-uuid');
    assert.equal(result.books[0].authors, '测试作者');
    const book = path.join(library, 'book.epub');
    fs.writeFileSync(book, Buffer.from([1, 2, 3, 4]));
    assert.deepEqual([...new Uint8Array(readLibraryFile(library, book).bytes)], [1, 2, 3, 4]);
    const outside = path.join(dir, 'outside.epub');
    fs.writeFileSync(outside, 'outside');
    const link = path.join(library, 'link.epub');
    fs.symlinkSync(outside, link);
    assert.throws(() => readLibraryFile(library, link), /path-outside-library/);
    fs.truncateSync(book, CALIBRE_BLOCK_BYTES);
    assert.throws(() => readLibraryFile(library, book), /calibre-file-too-large/);
  } finally {
    globalThis.window = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
