import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { TtsController } from '../src/tts-controller.js';

const bundle = await build({ entryPoints: ['src/tts-ui.js'], bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.py': 'text' }, plugins: [{ name: 'host', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'host', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const {Modal,Notice,Platform,Scope,Setting,requestUrl,setIcon}=globalThis.ttsHost;' }));
} }] });
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
const doc = dom.window.document;
const E = dom.window.HTMLElement.prototype;
E.createEl = function(tag, opts = {}) {
  const el = doc.createElement(tag); if (typeof opts === 'string') opts = { cls: opts };
  if (opts.cls) el.className = opts.cls;
  if (opts.text) el.textContent = opts.text;
  if (opts.type) el.type = opts.type;
  if (opts.value !== undefined) el.value = opts.value;
  if (opts.href) el.href = opts.href;
  for (const [k, v] of Object.entries(opts.attr || {})) el.setAttribute(k, v);
  this.append(el); return el;
};
E.createDiv = function(opts) { return this.createEl('div', opts); };
E.createSpan = function(opts) { return this.createEl('span', opts); };
E.empty = function() { this.replaceChildren(); };
E.setText = function(text) { this.textContent = text; };
E.appendText = function(text) { this.append(doc.createTextNode(text)); };
E.addClass = function(c) { this.classList.add(c); };
E.toggleClass = function(c, yes) { this.classList.toggle(c, yes); };
dom.window.ResizeObserver = class { observe() {} disconnect() {} };
let lastModal;
class Modal {
  constructor(app) { this.app = app; this.contentEl = doc.body.createDiv(); lastModal = this; }
  open() { this.onOpen(); } close() { this.onClose(); this.contentEl.remove(); } setTitle() {}
}
class Setting {
  constructor(el) { this.el = el.createEl('label'); }
  setName(v) { this.el.createSpan({ text: v }); return this; }
  addDropdown(f) {
    const el = this.el.createEl('select'), d = { addOption(v, t) { el.createEl('option', { value: v, text: t }); return d; }, setValue(v) { el.value = v; return d; }, onChange(fn) { el.onchange = () => fn(el.value); return d; } }; f(d); return this;
  }
  addText(f) {
    const el = this.el.createEl('input'), d = { inputEl: el, setValue(v) { el.value = v; return d; }, onChange(fn) { el.onchange = () => fn(el.value); return d; } }; f(d); return this;
  }
}
globalThis.ttsHost = { Modal, Setting, Notice: class {}, Platform: { isDesktopApp: true }, Scope: class { register() {} }, requestUrl: () => { throw Error('unexpected network'); }, setIcon: (el, name) => el.createEl('i', { attr: { 'data-icon': name } }) };
const ui = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(tts) {
  const calls = [], scopes = new Set();
  const p = { settings: { language: 'zh', ...(tts ? { tts } : {}) }, app: { keymap: { pushScope: s => scopes.add(s), popScope: s => scopes.delete(s) }, secretStorage: { getSecret: () => '', setSecret() {} } }, _saveLocalData: async () => {}, register() {}, ttsListeners: new Set() };
  const c = p.tts = new TtsController({ synthesize: async (profile, text) => { calls.push({ profile, text }); return { bytes: new Uint8Array([1]), mime: 'audio/mpeg' }; }, makeAudio: () => ({ play: async () => {}, pause() {}, removeAttribute() {}, load() {} }), onChange: c => { for (const f of p.ttsListeners) f(c); } });
  const root = doc.body.createDiv(), tray = root.createDiv();
  const view = { plugin: p, contentEl: root, file: { path: 'test.epub', stat: { mtime: 1 } } };
  ui.attachTts(view, tray); ui.openTts(view);
  const q = s => root.querySelector(s);
  const cleanup = () => { view._ttsCleanup(); root.remove(); };
  return { p, c, view, calls, q, scopes, cleanup };
}
test('first-use setup discloses provider and does not synthesize or change it while browsing', () => {
  const f = fixture(); ui.stopViewTts(f.view); f.q('.qbr-tts-read-action').click();
  assert.equal(f.p.settings.tts.provider, 'edge'); assert.equal(f.calls.length, 0);
  assert.match(lastModal.contentEl.textContent, /微软/);
  lastModal.switchProvider('doubao'); assert.equal(lastModal.list.hidden, true); assert.equal(lastModal.test.disabled, true);
  assert.equal(f.p.settings.tts.provider, 'edge'); lastModal.close(); f.cleanup();
});
test('fresh mobile retains system preference and gives setup when the device API is unavailable', () => {
  ttsHost.Platform.isDesktopApp = false; const f = fixture(); ui.openTtsSettings(f.p);
  assert.equal(f.p.settings.tts.provider, 'system'); assert.match(lastModal.feedback.textContent, /未提供系统朗读接口/);
  assert.equal(lastModal.test.disabled, true); assert.equal(lastModal.adapter.providers('').some(p => p.id === 'macos'), false);
  lastModal.close(); f.cleanup(); ttsHost.Platform.isDesktopApp = true;
});
test('audition restores exact paused book position and rate without changing active voice or extra synthesis', async () => {
  const f = fixture({ provider: 'edge', introSeen: true }); const owner = { view: f.view }, items = [{ text: '第一段' }, { text: '第二段' }];
  f.c.start(owner, items, { id: 'edge' }, { paused: true, index: 1, rate: 1.5 });
  ui.openTtsSettings(f.p); lastModal.profile.voice = 'zh-CN-YunxiNeural'; lastModal.audition(); await tick();
  assert.equal(f.calls.at(-1).profile.voice, 'zh-CN-YunxiNeural'); assert.equal(f.p.settings.tts.profiles.edge, undefined);
  f.c.audio.onended(); await tick(); assert.equal(f.c.owner, owner); assert.equal(f.c.index, 1); assert.equal(f.c.rate, 1.5); assert.equal(f.c.state, 'paused'); assert.equal(f.calls.length, 1);
  lastModal.close(); f.cleanup();
});
test('failed audition retains draft and provider; closing the book never restores stale speech', async () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  f.c.start({ view: f.view }, [{ text: '正文' }], { id: 'edge' }, { paused: true });
  ui.openTtsSettings(f.p); lastModal.audition(); await tick(); f.c.fail({ code: 'http', status: 401 }, f.c.generation); await tick();
  assert.equal(f.c.state, 'paused'); assert.match(lastModal.feedback.textContent, /401/); assert.equal(f.p.settings.tts.provider, 'edge');
  lastModal.audition(); await tick(); f.view._closed = true; f.view._ttsCleanup(); assert.equal(f.c.owner, null); assert.equal(f.calls.length, 1); f.cleanup();
});
test('inline menu preserves paused navigation and exposes speech location without losing other actions', () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  f.c.start({ view: f.view }, [{ text: '一' }, { text: '二' }, { text: '三' }], { id: 'edge' }, { paused: true, index: 1 });
  f.q('.qbr-tts-more').click(); const menu = f.q('.qbr-tts-menu'); assert.equal(menu.children.length, 4); assert.doesNotMatch(menu.textContent, /朗读选项|阅读位置/); menu.children[2].click();
  const nav = f.q('.qbr-tts-position'); f.q('.qbr-tts-position-transport').children[1].click(); assert.equal(f.c.index, 2); assert.equal(f.c.state, 'paused'); assert.equal(f.calls.length, 0);
  nav.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(nav.hidden, true); assert.equal(doc.activeElement, f.q('.qbr-tts-more'));
  f.q('.qbr-tts-more').click(); menu.children[2].click(); assert.equal(f.q('.qbr-tts-position').hidden, false); assert.match(f.q('.qbr-tts-position').textContent, /从当前页朗读/);
  f.q('.qbr-tts-close').click(); assert.equal(f.view._ttsBar.hidden, true); assert.equal(f.c.owner, null); ui.openTts(f.view); assert.equal(f.view._ttsBar.inert, false); f.cleanup();
});
test('automatic EPUB page-follow awaits relocation without disabling follow, while manual browsing does', async () => {
  const f=fixture({provider:'system',introSeen:true});
  const book=new JSDOM('<body><p>第一页。第二页。</p></body>').window.document,node=book.querySelector('p').firstChild;
  const ranges=[0,4].map(start=>{const range=book.createRange();range.setStart(node,start);range.setEnd(node,start+4);return range;});
  let current=ranges[0],arrive;
  f.view.engine={currentLocation:()=>({range:current}),rangeFromCfi:cfi=>ranges[cfi.includes('second')?1:0]};
  f.p.settings.tts.progress={[f.view.file.path]:{cfi:'epubcfi(second)',mtime:1}};
  const owner={view:f.view,follow:true,onSegment:()=>{f.view._ttsNavigating=1;return new Promise(resolve=>{arrive=()=>{current=ranges[1];f.view._ttsOnRelocate();f.view._ttsNavigating=0;resolve();};});}};
  f.c.start(owner,[{text:'第二页。'}],{id:'edge'});await tick();f.view._ttsOnRelocate();
  assert.equal(owner.follow,true);assert.equal(f.c.state,'loading');
  arrive();await tick();assert.equal(owner.follow,true);assert.equal(f.c.state,'playing');
  current=ranges[0];f.view._ttsOnRelocate({reason:'anchor'});assert.equal(owner.follow,true);
  f.view._ttsOnRelocate({reason:'page'});assert.equal(owner.follow,false);f.cleanup();
});

test('speed stays directly accessible at both widths without a redundant options submenu', () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  const menu = f.q('.qbr-tts-menu');
  assert.equal(menu.children[0].hidden, false); menu.children[0].click();
  assert.equal(f.q('.qbr-tts-rates').hidden, false);
  f.view.contentEl.getBoundingClientRect = () => ({ width: 900, bottom: 700, left: 0 });
  f.view._ttsRefresh(); assert.equal(menu.children[0].hidden, true);
  assert.equal([...menu.children].filter(b => !b.hidden).length, 3);
  f.q('.qbr-tts-speed').click(); assert.equal(f.q('.qbr-tts-rates').hidden, false);
  f.cleanup();
});
