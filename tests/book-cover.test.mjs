import { isTextBook } from "../src/text-book.js";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import vm from "node:vm";
import { createBookCover, coverAuthor, coverPalette } from "../src/book-cover.js";

test("cover metadata is inert XML, including hostile titles and structured authors", () => {
  const title = '<script>alert("x")</script> & Books';
  const svg = createBookCover({ title, author: [{ name: "A & B" }, { name: "作者" }] });
  const { document } = new JSDOM(svg, { contentType: "image/svg+xml" }).window;
  assert.equal(document.querySelector("script, parsererror, image, foreignObject"), null);
  assert.equal(document.querySelector("title").textContent, title);
  assert.equal(coverAuthor([{ name: "A & B" }, { name: "作者" }]), "A & B · 作者");
});

test("long metadata stays within cover bounds without unbounded output", () => {
  const svg = createBookCover({ title: "Very long 书名 ".repeat(1000), author: "Author ".repeat(1000) });
  const { document } = new JSDOM(svg, { contentType: "image/svg+xml" }).window;
  assert.ok(svg.length < 5000);
  const text = [...document.querySelectorAll("text")];
  assert.ok(text.length <= 7);
  assert.ok(text.every(el => Number(el.getAttribute("y")) <= 688));
  assert.ok(text.some(el => el.textContent.endsWith("…")));
});

test("starter books have distinct stable palettes and covers are reproducible", () => {
  const titles = ["道德经", "唐诗三百首", "Meditations", "Jekyll and Hyde", "Alice in Wonderland", "世说新语"];
  assert.equal(new Set(titles.map(t => coverPalette(t)[0])).size, 6);
  const meta = { title: "A different book", author: "Some Author" };
  assert.equal(createBookCover(meta), createBookCover(meta));
  const { document } = new JSDOM(createBookCover(meta), { contentType: "image/svg+xml" }).window;
  assert.equal(document.querySelector("[href], [src]"), null);
});

test("existing books get metadata covers without rewriting bytes, and embedded covers retain priority", async () => {
  const source = fs.readFileSync(new URL("../src/reader-engine.js", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("export async function coverFromBytes")).replace("export ", "");
  for (const kind of ["missing", "broken", "embedded"]) {
    const embedded = new Blob(["cover"], { type: "image/png" });
    let destroyed = 0;
    const readCover = vm.runInNewContext(`${method}; coverFromBytes`, {
      Blob, File, isTextBook, createBookCover,
      makeBook: async () => ({ metadata: { title: "书中标题", author: [{ name: "原作者" }] },
        getCover: async () => { if (kind === "broken") throw Error("no cover asset"); return kind === "embedded" ? embedded : null; },
        destroy: () => { destroyed++; },
      }),
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await readCover(bytes, "file-name.epub");
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(destroyed, 1);
    if (kind === "embedded") assert.equal(result, embedded);
    else { assert.equal(result.type, "image/svg+xml"); assert.match(await result.text(), /书中标题/); assert.match(await result.text(), /原作者/); }
  }
});

test("old generated cover cache migrates once without removing real artwork", async () => {
  const { migrateCoverCache } = await import("../src/book-cover.js");
  const svg = createBookCover({ title: "道德经" });
  const cache = { generated: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"), original: "data:image/jpeg;base64,YQ==", customSvg: "data:image/svg+xml;base64," + btoa('<svg><circle/></svg>') };
  assert.deepEqual(Object.keys(migrateCoverCache(cache)), ["original", "customSvg"]);
  assert.equal(migrateCoverCache(cache, 1), cache);
  assert.equal(Object.keys(cache).length, 3);
});

test("curated cover upgrades only starter identities and missing/generated artwork", async () => {
  const { findStarterBook } = await import("../src/starter-library.js");
  const { isGeneratedBookCover } = await import("../src/book-cover.js");
  const books = [{ id: "7337" }];
  assert.equal(findStarterBook({ identifier: "urn:qbr:starter:7337" }, books), books[0]);
  assert.equal(findStarterBook({ title: "道德经", identifier: "some-other-edition" }, books), undefined);
  const source = fs.readFileSync(new URL("../src/reader-engine.js", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("export async function coverFromBytes")).replace("export ", "");
  for (const kind of ["missing", "generated", "jpeg", "custom-svg", "resolver-failure"]) {
    let resolved = 0, destroyed = 0;
    const original = kind === "missing" || kind === "resolver-failure" ? null : new Blob([kind === "generated" ? createBookCover({ title: "道德经" }) : "original"], { type: kind === "jpeg" ? "image/jpeg" : "image/svg+xml" });
    const read = vm.runInNewContext(`${method}; coverFromBytes`, { Blob, File, isTextBook, createBookCover, isGeneratedBookCover,
      makeBook: async () => ({ metadata: { identifier: "urn:qbr:starter:7337", title: "道德经" }, getCover: async () => original, destroy: () => destroyed++ }),
    });
    const art = new Blob(["actual cover"], { type: "image/jpeg" });
    const result = await read(new Uint8Array([1]), "old.epub", async metadata => {
      resolved++; assert.ok(findStarterBook(metadata, books));
      if (kind === "resolver-failure") throw Error("broken artwork");
      return art;
    });
    assert.equal(destroyed, 1);
    assert.equal(resolved, ["jpeg", "custom-svg"].includes(kind) ? 0 : 1);
    if (kind === "resolver-failure") assert.equal(result.type, "image/svg+xml");
    else assert.equal(result, resolved ? art : original);
  }
});

test('untyped MOBI cover blobs retain bytes and acquire an image MIME type', async () => {
  const source = fs.readFileSync(new URL('../src/reader-engine.js', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('export async function coverFromBytes')).replace('export ', '');
  const bytes = new Uint8Array([255,216,255,224,0,16]);
  const read = vm.runInNewContext(`${method}; coverFromBytes`, { Blob, File, isTextBook, createBookCover,
    makeBook: async () => ({ getCover: async () => new Blob([bytes]) }),
  });
  const cover = await read(new Uint8Array([1]), 'book.mobi');
  assert.equal(cover.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await cover.arrayBuffer()), bytes);
});
