import test, { after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { decodeBookText, makeTextBook, isTextBook, isListedBook } from "../src/text-book.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
after(() => { dom.window.close(); delete globalThis.document; delete globalThis.window; delete globalThis.DOMParser; });
const bytes = text => new TextEncoder().encode(text);

test("text decoding preserves UTF-8, UTF-16 BOM and GB18030 Chinese", () => {
    assert.equal(decodeBookText(bytes("\uFEFF你好\r\nworld\rtest")), "你好\nworld\ntest");
    assert.equal(decodeBookText(Uint8Array.from([255,254,96,79,125,89])), "你好");
    assert.equal(decodeBookText(Uint8Array.from([254,255,79,96,89,125])), "你好");
    assert.equal(decodeBookText(Uint8Array.from([196,227,186,195])), "你好");
    assert.throws(() => decodeBookText(bytes(" \n")), /text-book-empty/);
    assert.throws(() => decodeBookText(Uint8Array.from([0,1,2])), /text-book-encoding/);
    assert.throws(() => decodeBookText(new Uint8Array(21 * 1024 * 1024)), /text-book-too-large/);
});

test("text files require explicit enrollment while ebooks keep folder discovery", () => {
    for (const name of ["A.MD", "a.markdown", "a.txt", "a.html", "A.HTM"]) assert.ok(isTextBook(name));
    assert.equal(isListedBook({ name: "note.md", path: "Books/note.md" }, "Books", []), false);
    assert.equal(isListedBook({ name: "note.md", path: "notes/note.md" }, "Books", ["notes/note.md"]), true);
    assert.equal(isListedBook({ name: "a.epub", path: "Books/a.epub" }, "Books"), true);
    assert.equal(isListedBook({ name: "a.epub", path: "notes/a.epub" }, "Books"), false);
});

test("TXT builds searchable chapters, escapes HTML and cleans object URLs", async () => {
    const book = await makeTextBook(bytes('前言\n你好世界\n第一章 开始\n<script>alert(1)</script>\n第二章 继续\n终点'), "小说.txt");
    assert.equal(book.metadata.title, "小说");
    assert.equal(book.sections.length, 3);
    assert.deepEqual(book.toc.map(x => x.label), ["前言", "第一章 开始", "第二章 继续"]);
    const doc = book.sections[1].createDocument();
    assert.equal(doc.querySelector("script"), null);
    assert.ok(doc.body.textContent.includes("<script>"));
    const destination = book.resolveHref(book.toc[1].href);
    assert.equal(destination.index, 1);
    assert.equal(destination.anchor(doc).textContent, "第一章 开始");
    assert.equal(book.sections[1].load(), book.sections[1].load());
    const url = book.sections[1].load();
    book.sections[1].unload();
    assert.notEqual(book.sections[1].load(), url);
    book.destroy();
    assert.throws(() => book.sections[1].load(), /Reader closed/);
});

test("HTML retains semantic content but strips active content and dangerous URLs", async () => {
    const input = `<!doctype html><title>文章标题</title><meta name="author" content="作者"><main><h1>开始</h1><p onclick="alert(1)">正文 <b>加粗</b></p><form><input value="secret"></form><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a><a href="#第二节">next</a><h2>第二节</h2><table><tr><td>表格</td></tr></table><img src="images/test.png" onerror="alert(1)"><a href="other.md">note</a></main>`;
    const book = await makeTextBook(bytes(input), "article.html", { resolveResource: path => `app://vault/${path}` });
    assert.equal(book.metadata.title, "文章标题");
    assert.equal(book.metadata.author, "作者");
    assert.equal(book.sections.length, 2);
    const doc = book.sections[0].createDocument();
    assert.equal(doc.querySelector("script,iframe,form,[onclick],[onerror]"), null);
    assert.equal(doc.querySelector("a").getAttribute("href"), null);
    assert.equal(doc.querySelectorAll("a")[1].getAttribute("href"), "#heading-1");
    assert.equal(book.resolveHref("#heading-1").index, 1);
    const second = book.sections[1].createDocument();
    assert.equal(second.querySelector("td").textContent, "表格");
    assert.equal(second.querySelector("img").getAttribute("src"), "app://vault/images/test.png");
    assert.equal(second.querySelector("a").getAttribute("href"), "reader-note:other.md");
    assert.match(second.querySelector('meta[http-equiv]').content, /script-src 'none'/);
    book.destroy();
});

test("Markdown uses real GFM, hides frontmatter and keeps nested TOC and stable anchors", async () => {
    const input = bytes("---\ntitle: Title\n---\n# Chapter\n\nhello **bold**\n\n### Nested\n\ntail\n\n## Next");
    const opts = { parseYaml: () => ({ title: "标题", author: "作者" }) };
    const first = await makeTextBook(input, "a.md", opts);
    const second = await makeTextBook(input, "a.md", opts);
    assert.equal(first.metadata.title, "标题");
    assert.equal(first.toc[0].subitems[0].label, "Nested");
    assert.equal(first.sections[0].createDocument().querySelector("strong").textContent, "bold");
    assert.equal(first.sections[0].createDocument().body.innerHTML, second.sections[0].createDocument().body.innerHTML);
    first.destroy(); second.destroy();
});

test("GFM tables, task lists, strikethrough, autolinks and fenced code render as HTML", async () => {
    const markdown = [
        "# GFM", "", "| Left | Right |", "| :--- | ---: |", "| **yes** | 42 |", "",
        "- [x] Done", "- [ ] Todo", "", "~~obsolete~~ https://example.com", "",
        "```js", "const x = '<script>literal</script>';", "```", "",
        "<script>window.bad = true</script>", '<img src="x" onerror="alert(1)">',
    ].join("\n");
    const book = await makeTextBook(bytes(markdown), "format.md");
    const doc = book.sections[0].createDocument();
    assert.equal(doc.querySelectorAll("table").length, 1);
    assert.equal(doc.querySelectorAll("th")[1].getAttribute("align"), "right");
    assert.equal(doc.querySelectorAll('input[type="checkbox"]').length, 2);
    assert.equal(doc.querySelector("input").checked, true);
    assert.ok([...doc.querySelectorAll("input")].every(input => input.disabled));
    assert.equal(doc.querySelector("del").textContent, "obsolete");
    assert.equal(doc.querySelector("a").href, "https://example.com/");
    assert.ok(doc.querySelector("pre code").textContent.includes("<script>literal</script>"));
    assert.equal(doc.querySelector("script,[onerror]"), null);
    assert.equal(doc.querySelector("p table"), null);
    book.destroy();
});

test("TXT keeps Markdown syntax literal instead of parsing GFM", async () => {
    const book = await makeTextBook(bytes("# Heading\n**bold**\n- [x] Done\n| a | b |"), "literal.txt");
    const doc = book.sections[0].createDocument();
    assert.equal(doc.querySelector("h1,strong,input,table"), null);
    assert.ok(doc.body.textContent.includes("**bold**"));
    book.destroy();
});

test("long unchaptered prose is bounded into sections without dropping text", async () => {
    const input = Array.from({ length: 1000 }, (_, i) => `line-${i} ${"文字".repeat(30)}`).join("\n");
    const book = await makeTextBook(bytes(input), "long.txt");
    assert.ok(book.sections.length >= 2);
    const all = book.sections.map(s => s.createDocument().body.textContent).join("");
    assert.equal(all.replaceAll("\n", ""), input.replaceAll("\n", ""));
    assert.equal(book.toc.length, 1);
    book.destroy();
});


test("TXT keeps stanza line breaks and indentation while collapsing repeated blank lines", async () => {
    const source = "序言\n\n  第一行\n第二行\n\n\n下一段\n\n第一章 开始\n正文";
    const book = await makeTextBook(bytes(source), "poem.txt");
    const doc = book.sections[0].createDocument();
    assert.equal(doc.querySelectorAll("p").length, 2);
    assert.equal(doc.querySelector("p").textContent, "  第一行\n第二行");
    assert.equal(doc.querySelectorAll("p")[1].textContent, "下一段");
    assert.equal(book.toc[1].label, "第一章 开始");
    book.destroy();
});
