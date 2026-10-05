import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { ZipReader, BlobReader } from 'foliate-js/vendor/zip.js';

const win = new JSDOM().window;
Object.assign(globalThis, { DOMParser: win.DOMParser, XMLSerializer: win.XMLSerializer, document: win.document, Node: win.Node, NodeFilter: win.NodeFilter, customElements: win.customElements, HTMLElement: win.HTMLElement });
globalThis.CSS ??= { escape: value => value };
const { decodeZipText } = await import('../src/epub-zip.js');
const { extractEpubContext } = await import('../src/epub-context.js');
const { foliateElements } = await import('../scripts/foliate-elements.mjs');

const chapter = '01 方案 根干枝叶的成长模型.xhtml';

// Mirrors web-exported EPUBs: UTF-8 names with the ZIP UTF-8 flag (bit 11)
// cleared and no Unicode Path extra field (0x7075) to recover them.
async function unflaggedEpub(metadata = '<dc:title>前传</dc:title>') {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('EPUB/package.opf', `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0"><metadata>${metadata}</metadata><manifest><item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c0" href="${chapter}" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="toc"/><itemref idref="c0"/></spine></package>`);
  zip.file('EPUB/toc.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="${chapter}">01 方案</a></li></ol></nav></body></html>`);
  zip.file(`EPUB/${chapter}`, '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>什么叫根干枝叶模型？</p></body></html>');
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const sig = view.getUint32(i, true);
    const header = sig === 0x04034b50 ? { flag: 6, name: 26, extra: 30 } : sig === 0x02014b50 ? { flag: 8, name: 28, extra: 46 } : null;
    if (!header) continue;
    view.setUint16(i + header.flag, view.getUint16(i + header.flag, true) & ~0x0800, true);
    const start = i + header.extra + view.getUint16(i + header.name, true), end = start + view.getUint16(i + header.name + 2, true);
    for (let at = start; at + 4 <= end; at += 4 + view.getUint16(at + 2, true))
      if (view.getUint16(at, true) === 0x7075) view.setUint16(at, 0xffff, true);
  }
  return bytes;
}

test('unflagged UTF-8 names are misread by default and kept intact by the EPUB decoder', async () => {
  const bytes = await unflaggedEpub();
  const names = async options => (await new ZipReader(new BlobReader(new Blob([bytes])), options).getEntries()).map(e => e.filename);
  assert.ok(!(await names({ useWebWorkers: false })).includes(`EPUB/${chapter}`));
  assert.ok((await names({ useWebWorkers: false, decodeText: decodeZipText })).includes(`EPUB/${chapter}`));
  // Genuine CP437 bytes are not valid UTF-8 and keep zip.js's fallback.
  assert.equal(decodeZipText(new Uint8Array([0x82, 0x41]), 'cp437'), undefined);
  assert.equal(decodeZipText(new Uint8Array([0x41]), 'utf-8'), undefined);
});

test('bundled Foliate opens UTF-8 EPUB chapters with missing grouping APIs', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const elements = foliateElements(root);
  const result = await build({ absWorkingDir: root, stdin: { contents: 'export { makeBook } from "foliate-js/view.js";', resolveDir: root },
    bundle: true, format: 'esm', write: false, plugins: [elements.plugin], define: elements.define });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbr-epub-zip-'));
  const file = path.join(dir, 'view.mjs');
  fs.writeFileSync(file, result.outputFiles[0].text);
  try {
    const { makeBook } = await import(file);
    const book = await makeBook(new File([await unflaggedEpub()], 'book.epub'));
    const section = book.sections[1];
    assert.equal(section.id, `EPUB/${chapter}`);
    assert.ok(section.size > 0);
    assert.match((await section.createDocument()).body.textContent, /根干枝叶/);
    assert.equal(book.resolveHref(book.toc[0].href)?.index, 1);
    // Exercise real Foliate metadata parsing and chapter access with the APIs
    // absent in older WebKit, without installing globals for other plugins.
    const metadata = `<dc:title id="title">前传</dc:title>
      <dc:creator id="author">乔木</dc:creator><dc:language>zh</dc:language>
      <meta refines="#title" property="title-type">main</meta>
      <meta refines="#title" property="alternate-script" xml:lang="en">Prelude</meta>
      <meta refines="#author" property="role" scheme="marc:relators">aut</meta>
      <meta property="belongs-to-collection" id="collection">Reader Library</meta>
      <meta refines="#collection" property="collection-type">collection</meta>
      <meta refines="#collection" property="group-position">2</meta>
      <meta name="calibre:title_sort" content="Prelude"/>`;
    const bytes = await unflaggedEpub(metadata);
    const expected = (await makeBook(new File([bytes], 'metadata.epub'))).metadata;
    assert.deepEqual(expected.title, { und: '前传', en: 'Prelude' });
    assert.equal(expected.author.name, '乔木');
    assert.equal(expected.sortAs, 'Prelude');
    assert.deepEqual(expected.belongsTo.collection, { name: 'Reader Library', position: '2' });
    for (const missing of [[Object], [Map], [Object, Map]]) {
      const descriptors = missing.map(target => Object.getOwnPropertyDescriptor(target, 'groupBy'));
      try {
        for (const target of missing) delete target.groupBy;
        const opened = await makeBook(new File([bytes], 'metadata.epub'));
        assert.deepEqual(opened.metadata, expected);
        assert.equal(opened.resolveHref(opened.toc[0].href)?.index, 1);
        assert.match((await opened.sections[1].createDocument()).body.textContent, /根干枝叶/);
        const minimal = await makeBook(new File([await unflaggedEpub()], 'minimal.epub'));
        assert.equal(minimal.metadata.title, '前传');
        for (const target of missing) assert.equal(target.groupBy, undefined);
      } finally {
        missing.forEach((target, index) => {
          if (descriptors[index]) Object.defineProperty(target, 'groupBy', descriptors[index]);
          else delete target.groupBy;
        });
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('AI book attachment reads chapters of an EPUB with unflagged UTF-8 names', async () => {
  const result = await extractEpubContext(await unflaggedEpub(), { DOMParser: win.DOMParser, yieldTask: async () => {} });
  assert.match(result.text, /根干枝叶/);
});
