import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({ entryPoints: ['src/book-shelf.js'], bundle: true, write: false, format: 'esm', plugins: [{ name: 'host', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'host', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const requestUrl = o => globalThis.shelfRequest(o); export const setIcon = () => {};' }));
} }] });
const { BookShelf } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const books = [{ id: 'OL1W', t: 'A book', a: ['Author'], tp: [], u: 10, ru: 9, q: 90 }];
function fixture(request) {
  const dom = new JSDOM('<main></main><input>');
  globalThis.window = dom.window;
  globalThis.shelfRequest = request;
  const doc = dom.window.document, E = dom.window.HTMLElement.prototype;
  E.createEl = function(tag, opts = {}) {
    const el = doc.createElement(tag);
    if (opts.cls) el.className = opts.cls;
    if (opts.text) el.textContent = opts.text;
    if (opts.value !== undefined) el.value = opts.value;
    if (opts.href) el.href = opts.href;
    for (const [key, value] of Object.entries(opts.attr || {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  E.createDiv = function(opts) { return this.createEl('div', opts); };
  E.createSpan = function(opts) { return this.createEl('span', opts); };
  E.empty = function() { this.replaceChildren(); };
  E.setText = function(text) { this.textContent = text; };
  E.addClass = function(cls) { this.classList.add(cls); };
  E.toggleClass = function(cls, on) { this.classList.toggle(cls, on); };
  const root = doc.querySelector('main'), plugin = { settings: { shelfMarks: {} }, saveAll: async () => {} };
  const shelf = new BookShelf(root, { plugin, translate: key => key, chinese: false, locale: () => 'en', vaultBooks: () => [], scroller: root, field: doc.querySelector('input') });
  return { shelf, root, plugin, close() { shelf.dispose(); dom.window.close(); } };
}

test('failed shelf loading offers a working retry after the request settles', async () => {
  let failed = true;
  const f = fixture(async ({ url }) => {
    if (failed) throw Error('offline');
    return { status: 200, json: url.endsWith('topics.json') ? [] : books };
  });
  try {
    await tick(); await tick();
    const retry = [...f.root.querySelectorAll('button')].find(el => el.textContent === 'shelf-retry');
    assert.ok(retry, 'failure must offer retry rather than remain loading');
    failed = false; retry.click(); await tick(); await tick();
    assert.equal(f.root.querySelectorAll('.qiaomu-reader-discovery-card').length, 1);
  } finally { f.close(); }
});

test('failed reading-list save restores status, enables retry, and reports failure', async () => {
  const f = fixture(async ({ url }) => ({ status: 200, json: url.endsWith('topics.json') ? [] : books }));
  try {
    await tick(); await tick();
    f.plugin.saveAll = async () => { throw Error('disk full'); };
    f.shelf._showDetail(books[0]); await tick();
    const oldMarks = f.plugin.settings.shelfMarks;
    const button = f.root.querySelector('.qiaomu-reader-discovery-marks button');
    button.click(); await tick(); await tick();
    assert.deepEqual(f.plugin.settings.shelfMarks, oldMarks);
    assert.equal(f.root.querySelector('.qiaomu-reader-discovery-marks button').disabled, false);
    assert.match(f.root.textContent, /saving-failed-check-vault-permissions-and-retry/);
    f.plugin.saveAll = async () => {};
    f.root.querySelector('.qiaomu-reader-discovery-marks button').click(); await tick();
    assert.equal(f.plugin.settings.shelfMarks.OL1W.s, 'wish');
  } finally { f.close(); }
});
