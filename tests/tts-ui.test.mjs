import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { TtsController } from '../src/tts-controller.js';

const bundle = await build({ entryPoints: ['src/tts-ui.js'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'host', setup(b) {
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
  for (const [k, v] of Object.entries(opts.attr || {})) el.setAttribute(k, v);
  this.append(el); return el;
};
E.createDiv = function(opts) { return this.createEl('div', opts); };
E.createSpan = function(opts) { return this.createEl('span', opts); };
E.empty = function() { this.replaceChildren(); };
E.setText = function(text) { this.textContent = text; };
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
test('first desktop use defaults to Edge, explains online transfer, exposes settings and persists dismissal', () => {
  const f = fixture();
  assert.equal(f.p.settings.tts.provider, 'edge');
  const intro = f.q('.qbr-tts-intro'); assert.equal(intro.hidden, false); assert.match(intro.textContent, /微软/);
  assert.match(intro.querySelector('button').textContent, /语音设置/);
  intro.querySelectorAll('button')[1].click();
  ui.stopViewTts(f.view); ui.openTts(f.view);
  assert.equal(intro.hidden, true); assert.equal(f.p.settings.tts.introSeen, true);
  assert.equal(f.calls.length, 0); f.cleanup();
});
test('existing explicit service remains; mobile fresh install retains system preference', () => {
  const old = fixture({ provider: 'system' }); assert.equal(old.p.settings.tts.provider, 'system'); old.cleanup();
  ttsHost.Platform.isDesktopApp = false;
  const mobile = fixture(); assert.equal(mobile.p.settings.tts.provider, 'system'); mobile.cleanup();
  ttsHost.Platform.isDesktopApp = true;
});
test('missing mobile system API gives a direct setup route and hides desktop-only providers', () => {
  ttsHost.Platform.isDesktopApp = false;
  const f = fixture();
  assert.match(f.q('.qbr-tts-intro').textContent, /未提供系统朗读接口/);
  f.q('.qbr-tts-current-voice').click();
  assert.equal(f.q('.qbr-tts-setup').hidden, false);
  assert.match(f.q('.qbr-tts-setup').textContent, /选择其他服务/);
  const services = [...f.q('select[data-tts-field="service"]').options].map(v => v.value);
  assert.equal(services.includes('macos'), false); assert.equal(services.includes('edge'), false);
  f.cleanup(); ttsHost.Platform.isDesktopApp = true;
});
test('a synced Mac provider remains visible on Windows with a specific recovery instead of invoking Node speech', () => {
  ttsHost.Platform.isMacOS = false;
  const f = fixture({ provider: 'macos', introSeen: true });
  f.q('.qbr-tts-current-voice').click();
  assert.equal(f.p.settings.tts.provider, 'macos'); assert.equal(f.calls.length, 0);
  assert.match(f.q('.qbr-tts-setup').textContent, /仅适用于 Mac/);
  const services = [...f.q('select[data-tts-field="service"]').options].map(v => v.value);
  assert.ok(services.includes('macos')); assert.ok(services.includes('edge'));
  f.cleanup();
});
test('voice preview does not select voice or synthesize book on restore; Escape and close clean up', async () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  const owner = { view: f.view }, items = [{ text: '第一段' }, { text: '第二段' }];
  f.c.start(owner, items, { id: 'edge', voice: 'zh-CN-XiaoxiaoNeural' }, { paused: true, index: 1, rate: 1.5 });
  f.q('.qbr-tts-current-voice').click();
  f.q('[data-voice="zh-CN-YunxiNeural"] .qbr-tts-voice-preview').click(); await tick();
  assert.equal(f.calls.at(-1).profile.voice, 'zh-CN-YunxiNeural');
  assert.equal(f.p.settings.tts.profiles.edge, undefined);
  f.c.audio.onended(); await tick();
  assert.equal(f.c.owner, owner); assert.equal(f.c.index, 1); assert.equal(f.c.rate, 1.5); assert.equal(f.c.state, 'paused');
  assert.equal(f.calls.length, 1);
  f.q('.qbr-tts-options').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(f.q('.qbr-tts-options').hidden, true); assert.equal(f.scopes.size, 0);
  assert.equal(doc.activeElement, f.q('.qbr-tts-current-voice'));
  f.q('.qbr-tts-close').click(); assert.equal(f.view._ttsBar.hidden, true); assert.equal(f.c.owner, null); f.cleanup();
});
test('configuration is one click from intro; modal preserves position after preview and never resumes automatically', async () => {
  const f = fixture({ provider: 'edge' });
  const owner = { view: f.view }, items = [{ text: '正文' }, { text: '下一句' }];
  f.c.start(owner, items, { id: 'edge' }, { paused: true, index: 1, rate: 1.25 });
  f.q('.qbr-tts-intro button').click();
  assert.equal(f.p.settings.tts.introSeen, true);
  [...lastModal.contentEl.querySelectorAll('button')].find(b => b.textContent === '试听').click(); await tick();
  lastModal.close();
  assert.equal(f.c.owner, owner); assert.equal(f.c.index, 1); assert.equal(f.c.rate, 1.25); assert.equal(f.c.state, 'paused');
  assert.equal(f.calls.length, 1); f.cleanup();
});
test('unconfigured cloud service has direct configuration recovery and retains inline models', () => {
  const f = fixture({ provider: 'siliconflow', introSeen: true });
  f.q('.qbr-tts-current-voice').click();
  assert.ok(f.q('select[data-tts-field="model"]')); assert.equal(f.q('.qbr-tts-setup').hidden, false);
  assert.match(f.q('.qbr-tts-setup').textContent, /配置并试听/);
  f.q('.qbr-tts-setup button').click();
  assert.equal(doc.activeElement.type, 'password'); lastModal.close(); f.cleanup();
});
test('failed preview restores book, shows rate-limit recovery, and keeps provider choice', async () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  f.c.synthesize = async () => { throw Object.assign(Error('rate'), { code: 'http', status: 429 }); };
  const owner = { view: f.view };
  f.c.start(owner, [{ text: '正文' }], { id: 'edge' }, { paused: true, rate: 1.5 });
  f.q('.qbr-tts-current-voice').click();f.q('.qbr-tts-voice-preview').click();await tick();
  assert.equal(f.c.owner, owner); assert.equal(f.c.state, 'paused'); assert.equal(f.p.settings.tts.provider, 'edge');
  assert.match(f.q('.qbr-tts-options').textContent, /429.*稍后重试/);f.cleanup();
});
test('closing book during configuration prevents restoring stale audio; chapter wait survives audition', async () => {
  const f = fixture({ provider: 'edge', introSeen: true });
  const owner = { view: f.view, follow: false };
  f.c.start(owner, [{ text: '末句' }], { id: 'edge' }, { paused: true });f.c.index=1;f.c.waitingSection=true;
  f.q('.qbr-tts-current-voice').click();f.q('.qbr-tts-voice-preview').click();await tick();f.c.audio.onended();await tick();
  assert.equal(f.c.waitingSection, true);assert.equal(f.c.index, 1);
  f.q('.qbr-tts-popup-footer button').click();ui.stopViewTts(f.view);lastModal.close();
  assert.equal(f.c.owner, null);assert.equal(f.calls.length, 1);f.cleanup();
});
