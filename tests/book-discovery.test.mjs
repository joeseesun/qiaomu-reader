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
