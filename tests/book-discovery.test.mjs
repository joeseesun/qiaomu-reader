import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { externalBookSearchUrls, gutenbergSearchUrl, gutenbergDetailUrl, gutenbergCoverUrl, parseGutenbergSearch, parseGutenbergEpub, validGutenbergEpub, safeBookFileName } from "../src/book-discovery.js";

test("external catalog search opens both encoded queries only for nonempty input", () => {
  assert.deepEqual(externalBookSearchUrls("  西游记 & Alice  "), {
    anna: "https://annas-archive.gl/search?q=%E8%A5%BF%E6%B8%B8%E8%AE%B0%20%26%20Alice",
    zlibrary: "https://z-library.sk/s/%E8%A5%BF%E6%B8%B8%E8%AE%B0%20%26%20Alice"
  });
  assert.equal(externalBookSearchUrls("   "), null);
});

const parser = new JSDOM("").window.DOMParser;
const parseXml = (xml) => new parser().parseFromString(xml, "application/xml");
const feed = (entries) => `<feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;

test("Gutenberg search keeps book entries and canonical IDs only", () => {
  const xml = feed(`
    <entry><id>https://www.gutenberg.org/ebooks/11.opds</id><title>Alice's Adventures in Wonderland</title><author><name>Lewis Carroll</name></author></entry>
    <entry><id>https://www.gutenberg.org/ebooks/12.opds</id><title>Through the Looking-Glass</title><content type="text">Lewis Carroll</content></entry>
    <entry><id>https://www.gutenberg.org/ebooks/11.opds</id><title>Duplicate</title></entry>
    <entry><id>https://example.org/ebooks/12.opds</id><title>Other host</title></entry>
    <entry><id>https://www.gutenberg.org/ebooks/subjects/search.opds</id><title>Subjects</title></entry>`);
  assert.deepEqual(parseGutenbergSearch(xml, parseXml), [
    { id: "11", title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", pageUrl: "https://www.gutenberg.org/ebooks/11" },
    { id: "12", title: "Through the Looking-Glass", author: "Lewis Carroll", pageUrl: "https://www.gutenberg.org/ebooks/12" }
  ]);
  assert.equal(gutenbergSearchUrl("诗 词"), "https://www.gutenberg.org/ebooks/search.opds/?query=%E8%AF%97%20%E8%AF%8D");
  assert.equal(parseGutenbergSearch(feed('<entry><id>/ebooks/99</id><title>Unknown author</title><content type="text">1,396 downloads</content></entry>'), parseXml)[0].author, "");
  assert.equal(gutenbergDetailUrl("11"), "https://www.gutenberg.org/ebooks/11.opds");
  assert.equal(gutenbergCoverUrl("11"), "https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg");
  assert.throws(() => gutenbergCoverUrl("../private"));
});

test("EPUB selection accepts only bounded Gutenberg acquisition links", () => {
  const xml = feed(`<entry>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://example.org/ebooks/11.epub.images" length="300"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://www.gutenberg.org/ebooks/11.epub.noimages" length="300"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://www.gutenberg.org/ebooks/11.epub3.images" length="300"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://www.gutenberg.org/ebooks/12.epub.images" length="300"/>
  </entry>`);
  assert.equal(parseGutenbergEpub(xml, "11", parseXml)?.url, "https://www.gutenberg.org/ebooks/11.epub3.images");
  assert.equal(parseGutenbergEpub(feed(""), "11", parseXml), null);
  assert.throws(() => parseGutenbergSearch("<html/>", parseXml));
});

test("download bytes and file names are constrained before vault writes", () => {
  const bytes = new Uint8Array(128);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(validGutenbergEpub(bytes.buffer), true);
  bytes[0] = 0x3c;
  assert.equal(validGutenbergEpub(bytes.buffer), false);
  assert.equal(safeBookFileName("A/B: C", "11"), "A B C (Gutenberg 11).epub");
});

import { shelfBookUrl, shelfCoverUrl, normalizeShelfBooks, shelfOrder, searchShelf, shelfText, normalizeShelfDetail, pickShelfComments, matchLibraryBooks, recommendShelf } from "../src/book-discovery.js";

const shelf = normalizeShelfBooks([
  { id: "OL1W", t: "Thinking, fast and slow", tz: "思考，快与慢", a: ["Daniel Kahneman"], y: 2011, u: 879, ru: 373, cu: 80, q: 51, s: 95, tp: ["psychology"], w: "剖析大脑" },
  { id: "OL2W", t: "The art of computer programming", tz: "计算机程序设计艺术", a: ["Donald Knuth"], y: 1968, u: 1125, ru: 336, cu: 10, q: 50, lr: 37, s: 100, tp: ["programming"] },
  { id: "OL3W", t: "Clean Code", a: ["Robert C. Martin"], y: 2008, u: 600, ru: 200, cu: 150, q: 30, s: 90, tp: ["programming"] },
  { id: "bad", t: "Injected" },
  { id: "OL4W", t: "" }
]);

test("shelf keeps only well-formed rows and safe URLs", () => {
  assert.deepEqual(shelf.map((book) => book.id), ["OL1W", "OL2W", "OL3W"]);
  assert.equal(shelfBookUrl("OL2W"), "https://hackerbooks.qiaomu.ai/data/book/OL2W.json");
  assert.throws(() => shelfBookUrl("../meta"));
  assert.equal(shelfCoverUrl(12), "https://hackerbooks.qiaomu.ai/covers/12.webp");
  assert.equal(shelfCoverUrl("12/../x"), "");
});

test("shelf views rank like the web shelf", () => {
  assert.deepEqual(shelfOrder(shelf, "best").map((book) => book.id), ["OL1W", "OL2W", "OL3W"]);
  assert.deepEqual(shelfOrder(shelf, "top").map((book) => book.id), ["OL2W", "OL1W", "OL3W"]);
  assert.deepEqual(shelfOrder(shelf, "lindy", { lastYear: 2026 }).map((book) => book.id), ["OL2W"]);
  assert.deepEqual(shelfOrder(shelf, "best", { topic: "programming" }).map((book) => book.id), ["OL2W", "OL3W"]);
});

test("shelf search matches Chinese titles without punctuation and authors", () => {
  assert.equal(searchShelf(shelf, "思考快与慢")[0].id, "OL1W");
  assert.equal(searchShelf(shelf, "knuth")[0].id, "OL2W");
  assert.deepEqual(searchShelf(shelf, "  "), []);
  assert.equal(shelfText(shelf[0], true).title, "思考，快与慢");
  assert.equal(shelfText(shelf[0], false).title, "Thinking, fast and slow");
  assert.equal(shelfText(shelf[0], false).blurb, "");
});

test("shelf detail drops malformed parts and balances comment stances", () => {
  const detail = normalizeShelfDetail({
    id: "OL1W", stance: { r: 3, n: 1, c: 1 }, why: { why: ["a", 3], fit: "f", warn: "" },
    related: ["OL2W", "OL1W", "x"],
    comments: [{ id: 1, x: "yes", sv: "r" }, { id: 2, x: "yes", sv: "r" }, { id: 3, x: "yes", sv: "r" }, { id: 4, x: "no", sv: "c" }, { id: "5", x: "bad" }]
  }, "OL1W");
  assert.deepEqual(detail.why.points, ["a"]);
  assert.deepEqual(detail.related, ["OL2W"]);
  assert.equal(detail.comments.length, 4);
  assert.deepEqual(pickShelfComments(detail.comments).map((item) => item.id), [1, 2, 4]);
  assert.throws(() => normalizeShelfDetail({ id: "OL9W" }, "OL1W"));
});

test("library file names match shelf books only on clear titles", () => {
  const owned = matchLibraryBooks(shelf, ["Thinking, Fast and Slow - Daniel Kahneman", "计算机程序设计艺术 (z-lib.org)", "Clean", "notes"]);
  assert.deepEqual([...owned].sort(), ["OL1W", "OL2W"]);
});

test("recommendations follow co-mentions, skip owned books and ignore bad data", () => {
  const co = { OL1W: ["OL3W", "OL2W", "OL404W"], OL2W: "bad" };
  assert.deepEqual(recommendShelf(shelf, co, new Set(["OL1W", "OL2W"])).map((book) => book.id), ["OL3W"]);
  assert.deepEqual(recommendShelf(shelf, null, new Set(["OL1W"])), []);
});

import { normalizeShelfMarks, toggleShelfMark, markedShelf } from "../src/book-discovery.js";

test("reading lists toggle, order by recency and drop bad rows", () => {
  let marks = normalizeShelfMarks({ OL1W: { s: "read", at: 1 }, OL2W: { s: "wish", at: 3 }, bad: { s: "wish" }, OL3W: { s: "other" } });
  assert.deepEqual(Object.keys(marks), ["OL2W", "OL1W"]);
  marks = toggleShelfMark(marks, "OL3W", "wish", 5);
  assert.equal(marks.OL3W.s, "wish");
  marks = toggleShelfMark(marks, "OL3W", "read", 6);
  assert.equal(marks.OL3W.s, "read");
  marks = toggleShelfMark(marks, "OL3W", "read", 7);
  assert.equal(marks.OL3W, undefined);
  assert.equal(toggleShelfMark(marks, "../x", "wish"), marks);
  const byId = new Map(shelf.map((book) => [book.id, book]));
  assert.deepEqual(markedShelf(byId, { OL1W: { s: "wish", at: 1 }, OL3W: { s: "wish", at: 2 }, OL9W: { s: "wish", at: 3 } }, "wish").map((book) => book.id), ["OL3W", "OL1W"]);
  assert.deepEqual(normalizeShelfMarks(["x"]), {});
});
