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
test('cloud setup offers provider-specific public key and speech docs without exposing keys', () => {
  const expected = {
    openai: 'platform.openai.com/api-keys', qwen: 'bailian.console.aliyun.com/cn-beijing/model/settings/api-key',
    doubao: 'console.volcengine.com/speech/service', minimax: 'platform.minimax.cn/console/access?tab=api-keys',
    siliconflow: 'cloud.siliconflow.cn/account/ak', elevenlabs: 'elevenlabs.io/app/developers/api-keys',
    azure: 'portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices',
  };
  const f = fixture({ provider: 'openai', introSeen: true });
  f.p.app.secretStorage.getSecret = () => 'private-test-key';
  ui.openTtsSettings(f.p);
  const service = () => lastModal.contentEl.querySelector('select');
  for (const [id, url] of Object.entries(expected)) {
    service().value = id; service().dispatchEvent(new dom.window.Event('change'));
    const links = [...lastModal.contentEl.querySelectorAll('.qbr-tts-service-help a')];
    assert.equal(links.length, 2); assert.equal(links[0].href, `https://${url}`);
    assert.equal(links[0].textContent, '获取密钥'); assert.equal(links[1].textContent, '服务文档');
    for (const link of links) {
      assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
      assert.equal(link.hasAttribute('title'), false); assert.equal(link.hasAttribute('aria-label'), false);
      assert.equal(link.href.includes('private-test-key'), false);
    }
  }
  assert.equal(f.calls.length, 0); lastModal.close(); f.cleanup();
});
test('help follows MiniMax endpoint edits; custom and keyless services avoid unrelated signup links', () => {
  const f = fixture({ provider: 'minimax', introSeen: true }); f.p.settings.language = 'en';
  ui.openTtsSettings(f.p);
  const root = lastModal.contentEl;
  assert.equal(root.querySelector('.qbr-tts-service-help a').textContent, 'Get a key');
  const endpoint = root.querySelector('details input');
  endpoint.value = 'https://api.minimax.io/v1'; endpoint.dispatchEvent(new dom.window.Event('change'));
  assert.equal(new URL(root.querySelector('.qbr-tts-service-help a').href).hostname, 'platform.minimax.io');
  endpoint.value = 'https://api.minimax.cn/v1'; endpoint.dispatchEvent(new dom.window.Event('change'));
  assert.equal(new URL(root.querySelector('.qbr-tts-service-help a').href).hostname, 'platform.minimax.cn');
  const change = id => { const select = root.querySelector('select'); select.value = id; select.dispatchEvent(new dom.window.Event('change')); };
  change('compatible'); assert.equal(root.querySelectorAll('.qbr-tts-service-help a').length, 0);
  assert.match(root.querySelector('.qbr-tts-service-help').textContent, /your provider/);
  for (const id of ['edge', 'system']) { change(id); assert.equal(root.querySelector('.qbr-tts-service-help'), null); }
  assert.equal(f.calls.length, 0); lastModal.close(); f.cleanup();
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

test('voice search is available for short lists and survives choosing a filtered voice', () => {
  const f = fixture({ provider: 'edge' });
  f.q('.qbr-tts-current-voice').click();
  let input = f.q('.qbr-tts-search input');
  assert.ok(input); assert.equal(input.parentElement.hidden, false);
  input.value = '云希'; input.dispatchEvent(new dom.window.Event('input'));
  const row = [...f.q('.qbr-tts-voice-list').children].find(el => !el.hidden);
  assert.ok(row); row.querySelector('button').click();
  input = f.q('.qbr-tts-search input');
  assert.equal(input.value, '云希');
  assert.equal([...f.q('.qbr-tts-voice-list').children].filter(el => !el.hidden).length, 1);
  assert.equal(f.scopes.size, 1); f.cleanup();
});
