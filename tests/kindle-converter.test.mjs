import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { MOBI } from 'foliate-js/mobi.js';
import JSZip from 'jszip';
import { convert, epubFixture } from './helpers/kindle-converter-fixture.mjs';
const dom = new JSDOM();
Object.assign(globalThis, { document: dom.window.document, DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer });
globalThis.CSS = { escape: value => String(value).replace(/[^\w-]/g, c => `\\${c}`) };
const flatten = items => items.flatMap(item => [item, ...flatten(item.subitems || [])]);
for (const ncx of [false, true]) test(`embedded converter preserves Chinese, images, metadata, footnotes and ${ncx ? 'EPUB2 NCX' : 'EPUB3 nested navigation'} without Calibre`, async () => {
  const source = await epubFixture({ ncx });
  const original = Uint8Array.from(source), priorPath = process.env.PATH;
  let result;
  try { process.env.PATH = ''; result = await convert(source); }
  finally { process.env.PATH = priorPath; }
  assert.deepEqual(source, original);
  assert.equal(result.stats.chapterCount, 2); assert.equal(result.stats.imageResourceCount, 1);
  const book = await new MOBI({}).open(new Blob([result.bytes]));
  try {
    assert.equal(book.metadata.title, '中文测试书 & English'); assert.deepEqual(book.metadata.author, ['测试作者']);
    assert.equal(book.sections.length, 2);
    const nav = flatten(book.toc); assert.deepEqual(nav.map(n => n.label), ['第一章','第二节','注释']);
    assert.notEqual(nav[0].href, nav[1].href, 'same-chapter TOC anchors must not all point at chapter start');
    const first = await book.sections[0].createDocument();
    assert.equal(first.querySelectorAll('h1').length, 1, 'do not duplicate or replace the source heading');
    assert.equal(first.querySelector('#start')?.textContent, '第一章：中文开头');
    assert.ok(first.body.textContent.includes('保留正文 & 标点')); assert.ok(first.body.textContent.includes('𠀀'));
    assert.equal(first.body.textContent.match(/道可道/g).length, 900, 'UTF-8 splitting and compression must preserve the whole chapter');
    const [sectionIndex, position] = book.splitTOCHref(nav[1].href);
    assert.equal(sectionIndex, 0); assert.ok(position.off > 0);
    assert.ok(!first.querySelector('script')); assert.match(first.querySelector('img').getAttribute('src'), /^kindle:embed:/);
    const noteLink = first.querySelector('a').getAttribute('href'); assert.match(noteLink, /^kindle:pos:/);
    const [noteIndex] = book.splitTOCHref(noteLink); assert.equal(noteIndex, 1);
    const cover = await book.getCover(); assert.equal((await cover.arrayBuffer()).byteLength, 68);
  } finally { book.destroy(); }
});
test('ZIP size declarations, CRC corruption, unsafe XML, traversal and missing TOC anchors are rejected', async () => {
  const original = await epubFixture(), eocd = original.length - 22;
  const view = new DataView(original.buffer), offset = view.getUint32(eocd + 16, true);
  const oversized = Uint8Array.from(original); new DataView(oversized.buffer).setUint32(offset + 24, 128 * 1024 * 1024, true);
  await assert.rejects(convert(oversized), { code: 'conversion-size' });
  const corrupted = Uint8Array.from(original); new DataView(corrupted.buffer).setUint32(offset + 16, 123, true);
  await assert.rejects(convert(corrupted), { code: 'conversion' });
  for (const [name, mutate] of [
    ['书籍/章节 一.xhtml', text => text.replace('<!DOCTYPE html>', '<!DOCTYPE html [<!ENTITY evil SYSTEM "file:///etc/passwd">]>')],
    ['书籍/content.opf', text => text.replace('章节%20一.xhtml', '../../outside.xhtml')],
    ['书籍/nav.xhtml', text => text.replace('#later', '#missing')],
  ]) {
    const zip = await JSZip.loadAsync(original); zip.file(name, mutate(await zip.file(name).async('string')));
    await assert.rejects(convert(await zip.generateAsync({ type: 'uint8array' })));
  }
});
test('malformed, encrypted, unsupported-image and unresolved-link EPUBs fail before delivery', async () => {
  for (const options of [{ badResource: true }, { badLink: true }, { encrypted: true }]) await assert.rejects(convert(await epubFixture(options)));
  await assert.rejects(convert(new Uint8Array([1,2,3])), { code: 'conversion' });
});
test('cancellation terminates a real converter thread and timeout is bounded', async () => {
  const bytes = await epubFixture(), aborter = new AbortController();
  const pending = convert(bytes, { signal: aborter.signal }); aborter.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  await assert.rejects(convert(bytes, { timeout: 1 }), { code: 'conversion' });
});
test('standard font obfuscation is allowed while encrypted chapter content is rejected', async () => {
  for (const fontOnly of [true, false]) {
    const zip = await JSZip.loadAsync(await epubFixture());
    if (fontOnly) {
      zip.file('书籍/content.opf', (await zip.file('书籍/content.opf').async('string')).replace('</manifest>', '<item id="font" href="font.otf" media-type="font/otf"/></manifest>'));
      zip.file('书籍/font.otf', new Uint8Array([1,2,3]));
    }
    zip.file('META-INF/encryption.xml', `<encryption><EncryptedData><EncryptionMethod Algorithm="${fontOnly ? 'http://www.idpf.org/2008/embedding' : 'http://www.w3.org/2001/04/xmlenc#aes128-cbc'}"/><CipherData><CipherReference URI="${fontOnly ? '书籍/font.otf' : '书籍/notes.xhtml'}"/></CipherData></EncryptedData></encryption>`);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    if (fontOnly) assert.ok((await convert(bytes)).bytes.length); else await assert.rejects(convert(bytes));
  }
});
test('actual Chinese starter EPUB converts with the bundled engine and an independent reader opens every section', async () => {
  const result = await convert(await fs.readFile('assets/starter-books/7337.epub'));
  const book = await new MOBI({}).open(new Blob([result.bytes]));
  try {
    assert.ok(book.metadata.title); assert.ok(book.sections.length > 10);
    let chars = 0;
    for (const section of book.sections) chars += (await section.createDocument()).body.textContent.length;
    assert.ok(chars > 4000);
  } finally { book.destroy(); }
});
