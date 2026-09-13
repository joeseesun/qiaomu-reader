import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  isCalibreSyntaxQuery,
  parseSimpleCalibreQuery,
  pickPreferredFormat,
  formatBytes,
  isInsideDir,
  calibreSafeFilename,
  copyToArrayBuffer,
} from "../src/calibre-library.js";

test("simple field filters are not treated as calibredb syntax", () => {
  assert.equal(isCalibreSyntaxQuery("金字塔"), false);
  assert.equal(isCalibreSyntaxQuery("author:福勒"), false);
  assert.equal(isCalibreSyntaxQuery("title:重构"), false);
  assert.equal(isCalibreSyntaxQuery("author:福勒 and format:epub"), true);
  assert.equal(isCalibreSyntaxQuery('title:"The Ring"'), false);
  assert.equal(isCalibreSyntaxQuery("(epub or pdf)"), true);
});

test("parseSimpleCalibreQuery extracts one field", () => {
  assert.deepEqual(parseSimpleCalibreQuery("金字塔原理"), { field: "", q: "金字塔原理" });
  assert.deepEqual(parseSimpleCalibreQuery("author: Martin Fowler"), { field: "author", q: "Martin Fowler" });
  assert.deepEqual(parseSimpleCalibreQuery("format:epub"), { field: "format", q: "epub" });
});

test("pickPreferredFormat prefers EPUB then PDF", () => {
  const allowed = new Set(["epub", "pdf", "mobi", "azw3"]);
  assert.equal(pickPreferredFormat(["MOBI", "EPUB"], allowed), "epub");
  assert.equal(pickPreferredFormat(["PDF", "AZW3"], allowed), "pdf");
  assert.equal(pickPreferredFormat(["MOBI"], allowed), "mobi");
  assert.equal(pickPreferredFormat(["TXT"], allowed), "");
});

test("formatBytes uses MB for large books", () => {
  assert.match(formatBytes(4500 * 1024), /MB|KB/);
  assert.equal(formatBytes(50 * 1024 * 1024), "50 MB");
});

test("isInsideDir rejects parent traversal", () => {
  assert.equal(isInsideDir("/lib", "/lib/a/book.epub", path), true);
  assert.equal(isInsideDir("/lib", "/lib", path), true);
  assert.equal(isInsideDir("/lib", "/etc/passwd", path), false);
  assert.equal(isInsideDir("/lib", "/lib/../etc/passwd", path), false);
});

test("calibreSafeFilename strips Windows-unsafe and fullwidth punctuation", () => {
  assert.equal(calibreSafeFilename("红太阳是怎样升起的：延安整风运动", "epub"), "红太阳是怎样升起的_延安整风运动.epub");
  assert.equal(calibreSafeFilename("a/b:c*d", "PDF"), "a_b_c_d.pdf");
  assert.match(calibreSafeFilename("..hidden", "epub"), /^[^.].*\.epub$/);
});

test("copyToArrayBuffer detaches from the source view", () => {
  const src = new Uint8Array([1, 2, 3, 4]);
  const buf = copyToArrayBuffer(src);
  assert.equal(buf.byteLength, 4);
  assert.notEqual(buf, src.buffer);
  src[0] = 9;
  assert.equal(new Uint8Array(buf)[0], 1);
});
