import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chapter, legacyMetadata, refinedMetadata, unflaggedEpub } from './fixtures/epub.mjs';
import { JSDOM } from 'jsdom';
import { ZipReader, BlobReader } from 'foliate-js/vendor/zip.js';

const win = new JSDOM().window;
Object.assign(globalThis, { DOMParser: win.DOMParser, XMLSerializer: win.XMLSerializer, document: win.document, Node: win.Node, NodeFilter: win.NodeFilter, customElements: win.customElements, HTMLElement: win.HTMLElement });
globalThis.CSS ??= { escape: value => value };
const { decodeZipText } = await import('../src/epub-zip.js');
const { extractEpubContext } = await import('../src/epub-context.js');
const { foliateElements } = await import('../scripts/foliate-elements.mjs');

test('unflagged UTF-8 names are misread by default and kept intact by the EPUB decoder', async () => {
  const bytes = await unflaggedEpub();
  const names = async options => (await new ZipReader(new BlobReader(new Blob([bytes])), options).getEntries()).map(e => e.filename);
  assert.ok(!(await names({ useWebWorkers: false })).includes(`EPUB/${chapter}`));
  assert.ok((await names({ useWebWorkers: false, decodeText: decodeZipText })).includes(`EPUB/${chapter}`));
  // Genuine CP437 bytes are not valid UTF-8 and keep zip.js's fallback.
  assert.equal(decodeZipText(new Uint8Array([0x82, 0x41]), 'cp437'), undefined);
  assert.equal(decodeZipText(new Uint8Array([0x41]), 'utf-8'), undefined);
});

test('bundled Foliate opens EPUB 2/3 metadata and UTF-8 chapter paths with missing grouping APIs', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const elements = foliateElements(root);
  const result = await build({ absWorkingDir: root, stdin: { contents: 'export { makeBook } from "foliate-js/view.js";', resolveDir: root },
    bundle: true, format: 'esm', write: false, plugins: [elements.plugin], define: elements.define });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbr-epub-zip-'));
  const file = path.join(dir, 'view.mjs');
  fs.writeFileSync(file, result.outputFiles[0].text);
  const books = [];
  try {
    const { makeBook } = await import(file);
    const openBook = async (bytes, name) => {
      const book = await makeBook(new File([bytes], name));
      books.push(book);
      return book;
    };
    const book = await openBook(await unflaggedEpub(), 'book.epub');
    const section = book.sections[1];
    assert.equal(section.id, `EPUB/${chapter}`);
    assert.ok(section.size > 0);
    assert.match((await section.createDocument()).body.textContent, /根干枝叶/);
    assert.equal(book.resolveHref(book.toc[0].href)?.index, 1);
    // Exercise real Foliate metadata parsing and chapter access with the APIs
    // absent in older WebKit, without installing globals for other plugins.
    const bytes = await unflaggedEpub(refinedMetadata);
    const expected = (await openBook(bytes, 'metadata.epub')).metadata;
    assert.deepEqual(expected.title, { und: '前传', en: 'Prelude' });
    assert.equal(expected.author.name, '乔木');
    assert.equal(expected.sortAs, 'Prelude');
    assert.deepEqual(expected.belongsTo.collection, { name: 'Reader Library', position: '2' });
    for (const missing of [[Object], [Map], [Object, Map]]) {
      const descriptors = missing.map(target => Object.getOwnPropertyDescriptor(target, 'groupBy'));
      try {
        for (const target of missing) delete target.groupBy;
        const opened = await openBook(bytes, 'metadata.epub');
        assert.deepEqual(opened.metadata, expected);
        assert.equal(opened.resolveHref(opened.toc[0].href)?.index, 1);
        assert.match((await opened.sections[1].createDocument()).body.textContent, /根干枝叶/);
        const minimal = await openBook(await unflaggedEpub(), 'minimal.epub');
        assert.equal(minimal.metadata.title, '前传');
        for (const version of ['2.0', '3.0']) {
          const encoded = await openBook(await unflaggedEpub(
            version === '2.0' ? legacyMetadata : refinedMetadata,
            { version, encodedHref: true },
          ), `encoded-${version}.epub`);
          assert.equal(encoded.metadata.author.name, '乔木');
          assert.equal(encoded.metadata.sortAs, 'Prelude');
          if (version === '2.0') assert.equal(encoded.metadata.author.sortAs, 'Qiao Mu');
          const target = encoded.resolveHref(encoded.toc[0].href);
          assert.equal(target.index, 1, 'NCX and nav resolve encoded Chinese/spaced paths');
          assert.equal(encoded.sections[target.index].id, `EPUB/${chapter}`);
          const doc = await encoded.sections[target.index].createDocument();
          assert.equal(target.anchor(doc).id, 'start', 'TOC fragment survives URI decoding');
          assert.match(doc.body.textContent, /根干枝叶/);
        }
        for (const target of missing) assert.equal(target.groupBy, undefined);
      } finally {
        missing.forEach((target, index) => {
          if (descriptors[index]) Object.defineProperty(target, 'groupBy', descriptors[index]);
          else delete target.groupBy;
        });
      }
    }
  } finally {
    for (const book of books) book.destroy?.();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AI book attachment reads chapters of an EPUB with unflagged UTF-8 names', async () => {
  const result = await extractEpubContext(await unflaggedEpub(), { DOMParser: win.DOMParser, yieldTask: async () => {} });
  assert.match(result.text, /根干枝叶/);
});
