import { Modal, Notice, Platform, Scope, Setting, requestUrl, setIcon } from 'obsidian';
import { TtsController } from './tts-controller.js';
import { checkTtsSignal, synthesizeHttp, TTS_PROVIDERS, ttsError, ttsProfile } from './tts-providers.js';
import { TTS_MODELS, canLoadVoiceCatalog, changeSpeechModel, loadVoiceCatalog, modelKey, uniqueChoices, voiceChoices } from './tts-choices.js';
import { speechDocumentChunks, splitSpeechText } from './tts-text.js';

// The new feature has reviewed Chinese/English copy. Other plugin languages
// explicitly fall back to English until their TTS translations are reviewed.
export const TTS_COPY = {
  custom: ['自定义…', 'Custom…'], customValue: ['自定义 ID', 'Custom ID'],
  refreshVoices: ['更新音色列表', 'Refresh voice list'], catalogReady: ['音色列表已更新', 'Voice list updated'],
  catalogPartial: ['已加载前 1000 个音色；其他音色可填 ID。', 'Loaded the first 1,000 voices; enter an ID for others.'],
  choiceHint: ['更换后从当前段落继续；试听不会改变进度。', 'Continue from the current segment after changing voices. Testing keeps your place.'],
  configure: ['配置服务', 'Configure service'], previewStop: ['停止试听', 'Stop test'],
  read: ['朗读', 'Read aloud'], selected: ['朗读选中内容', 'Read selection'], settings: ['朗读设置', 'Speech settings'],
  service: ['语音服务', 'Voice service'], system: ['系统语音', 'System voice'], voice: ['音色', 'Voice'], model: ['模型', 'Model'],
  key: ['API 密钥', 'API key'], url: ['服务地址', 'Service URL'], region: ['区域', 'Region'], advanced: ['高级设置', 'Advanced settings'],
  options: ['朗读选项', 'Playback options'], collapse: ['收起选项', 'Collapse options'], finish: ['结束朗读', 'End reading'],
  segment: ['第 {0} 段', 'Segment {0}'], speedNote: ['系统语音将在下一段应用新倍速。', 'System speech applies the new speed to the next segment.'],
  resourceId: ['语音资源 ID', 'Speech resource ID'], doubao: ['豆包语音', 'Doubao'], siliconflow: ['硅基流动', 'SiliconFlow'],
  doubaoHelp: ['使用豆包语音控制台的 API Key；音色需与语音资源匹配。', 'Use an API key from the Doubao Voice console. Match the voice to its speech resource.'],
  minimaxHelp: ['默认使用国内站；国际站账号请在高级设置中改为 https://api.minimax.io/v1。', 'Defaults to the China endpoint. International accounts: set https://api.minimax.io/v1 in Advanced settings.'],
  preview: ['试听', 'Test voice'], sample: ['你好，这是乔木阅读器的语音朗读测试。', 'Hello. This is a Qiaomu Reader voice test.'],
  play: ['从这里朗读', 'Read from here'], pause: ['暂停', 'Pause'], resume: ['继续', 'Resume'], stop: ['停止', 'Stop'],
  previous: ['上一段', 'Previous segment'], next: ['下一段', 'Next segment'], speed: ['倍速', 'Speed'], close: ['关闭', 'Close'],
  ready: ['尚未试听', 'Not tested'], loading: ['正在准备语音…', 'Preparing speech…'], playing: ['正在朗读', 'Reading aloud'],
  paused: ['已暂停', 'Paused'], ended: ['朗读结束', 'Finished'], verified: ['试听成功', 'Voice test passed'],
  retry: ['重试', 'Retry'], fallback: ['改用系统语音', 'Use system voice'], saved: ['继续上次朗读', 'Resume last reading'],
  cloud: ['在线合成：朗读文字会发送到所选服务；付费服务按用量计费。', 'Online synthesis sends text to the selected service. Paid services charge for usage.'],
  local: ['使用设备提供的语音；部分系统音色需要联网。', 'Uses device voices; some system voices require a network connection.'],
  edge: ['免费在线语音，需要联网；当前提供桌面接入。', 'Free online speech. Requires a network connection; desktop integration only.'],
  systemVoice: ['自动选择', 'Automatic'], configuration: ['请在朗读设置中填写模型和音色。', 'Enter a model and voice in speech settings.'],
  'error-key': ['请在朗读设置中填写 API 密钥。', 'Enter an API key in speech settings.'],
  'error-url': ['请填写有效的服务地址。', 'Enter a valid service URL.'], 'error-https': ['远程服务需使用 HTTPS 地址。', 'Remote services require HTTPS.'],
  'error-region': ['请填写 Azure 区域，例如 eastasia。', 'Enter an Azure region, such as eastasia.'],
  'error-resource': ['请填写与豆包音色匹配的语音资源 ID。', 'Enter the speech resource ID matching the Doubao voice.'],
  'error-service': ['服务返回错误（{0}），请检查密钥、余额及音色权限后重试。', 'Provider error ({0}). Check the key, balance and voice access, then retry.'],
  'error-system': ['系统语音未能播放，请检查设备音色或更换服务。', 'System speech failed. Check device voices or choose another service.'],
  'error-voice': ['此设备没有保存的音色，请重新选择。', 'The saved voice is unavailable on this device. Choose another voice.'],
  'error-network': ['语音服务连接失败，请重试或更换服务。', 'Could not connect. Retry or choose another service.'],
  'error-timeout': ['语音服务响应超时，请重试或更换服务。', 'Speech request timed out. Retry or choose another service.'],
  'error-empty': ['服务没有返回音频，请检查模型与音色。', 'No audio returned. Check the model and voice.'],
  'error-response': ['服务返回了无法播放的内容，请检查配置。', 'The response was not playable audio. Check the configuration.'],
  'error-playback': ['音频未能播放，请重试。', 'Audio playback failed. Please retry.'],
  'error-mobile': ['手机端请使用系统语音或其他云端服务。', 'On mobile, use system speech or another cloud provider.'],
  'error-http': ['语音请求失败（HTTP {0}），请检查服务配置或重试。', 'Speech request failed (HTTP {0}). Check settings or retry.'],
  'error-edge403': ['Edge 拒绝了本次请求（403），可重试或改用系统语音。', 'Edge rejected this request (403). Retry or use system voice.'],
  'error-emptyText': ['此处没有可朗读文字；扫描 PDF 需要先识别文字。', 'No readable text here. Scanned PDFs need text recognition first.'],
  'error-save': ['设置未能保存，请重试。', 'Could not save settings. Please retry.'],
};
export function ttsText(plugin, key, value = '') {
  const pair = TTS_COPY[key] || TTS_COPY['error-network'];
  return pair[plugin.settings.language === 'zh' ? 0 : 1].replace('{0}', String(value));
}
function errorText(plugin, error, provider) {
  const key = provider === 'edge' && error?.status === 403 ? 'error-edge403'
    : error?.code === 'configuration' ? 'configuration' : `error-${error?.code || 'network'}`;
  return ttsText(plugin, key, error?.status);
}
function config(plugin) {
  const saved = plugin.settings.tts;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) plugin.settings.tts = {};
  const settings = plugin.settings.tts;
  if (!TTS_PROVIDERS[settings.provider]) settings.provider = 'system';
  if (!settings.profiles || typeof settings.profiles !== 'object') settings.profiles = {};
  return settings;
}
function persist(plugin) {
  void plugin._saveLocalData().catch(() => new Notice(ttsText(plugin, 'error-save')));
}
function profileFor(plugin) {
  const profile = ttsProfile(config(plugin));
  return { ...profile, key: plugin.app.secretStorage?.getSecret(`qiaomu-reader-tts-${profile.id}`) || '' };
}
function button(parent, icon, label, run, text = false) {
  const el = parent.createEl('button', { cls: 'qbr-tts-button', attr: { type: 'button' } });
  setIcon(el, icon);
  el.createSpan({ text: label, cls: text ? '' : 'qbr-tts-sr' });
  el.addEventListener('click', run); return el;
}
export function ensureTts(plugin) {
  if (plugin.tts) return plugin.tts;
  const listeners = new Set();
  plugin.ttsListeners = listeners;
  plugin.tts = new TtsController({
    makeAudio: () => new window.Audio(), speech: window.speechSynthesis,
    makeUtterance: text => new window.SpeechSynthesisUtterance(text),
    synthesize: async (profile, text, signal) => {
      if (profile.id === 'edge') {
        if (!Platform.isDesktopApp) throw ttsError('mobile');
        const { synthesizeEdge } = await import('./tts-edge.js');
        checkTtsSignal(signal); return synthesizeEdge(text, profile.voice, { signal });
      }
      return synthesizeHttp(profile, text, { request: requestUrl, key: profile.key, signal });
    },
    onChange: controller => { for (const listener of listeners) listener(controller); },
  });
  plugin.register(() => { plugin.tts.dispose(); listeners.clear(); });
  return plugin.tts;
}
export function openTtsSettings(plugin) { new TtsSettingsModal(plugin).open(); }
class SpeechChoices {
  constructor(host, plugin, onChange) {
    Object.assign(this, { host, plugin, onChange }); this.catalog = {}; this.provider = config(plugin).provider;
    this.onVoices = () => { if (config(plugin).provider === 'system') this.render(); };
    window.speechSynthesis?.addEventListener('voiceschanged', this.onVoices); this.render();
  }
  destroy() { this.disposed = true; this.abort?.abort(); window.speechSynthesis?.removeEventListener('voiceschanged', this.onVoices); }
  render() {
    const p = this.plugin, tx = key => ttsText(p, key), settings = config(p), profile = ttsProfile(settings), id = profile.id;
    if (this.provider !== id) { this.abort?.abort(); this.catalog = {}; this.message = ''; this.provider = id; }
    this.host.empty();
    const update = (key, value) => {
      const current = ttsProfile(config(p));
      const next = key === modelKey(current) ? changeSpeechModel(current, value, this.catalog) : { ...current, [key]: value };
      const { id: _id, label: _label, ...saved } = next;
      config(p).profiles[id] = saved; persist(p); this.message = ''; this.onChange(); this.render();
    };
    const field = (key, label, values, custom = true) => {
      const row = this.host.createEl('label', { cls: 'qbr-tts-choice' }); row.createSpan({ text: label });
      const select = row.createEl('select', { attr: { 'data-tts-field': key } });
      values = uniqueChoices(values);
      const value = String(profile[key] || '');
      if (!values.some(v => v.id === value) && value) values.push({ id: value, label: value });
      for (const entry of values) select.createEl('option', { value: entry.id, text: entry.label });
      if (custom) select.createEl('option', { value: '__custom__', text: tx('custom') });
      select.value = value || (custom ? '__custom__' : '');
      const customRow = this.host.createEl('label', { cls: 'qbr-tts-choice qbr-tts-custom' });
      customRow.hidden = select.value !== '__custom__'; customRow.createSpan({ text: `${label} · ${tx('customValue')}` });
      const input = customRow.createEl('input', { type: 'text', value, attr: { spellcheck: 'false' } });
      select.addEventListener('change', () => {
        customRow.hidden = select.value !== '__custom__';
        if (!customRow.hidden) { input.focus(); input.select(); } else update(key, select.value);
      });
      input.addEventListener('change', () => update(key, input.value.trim()));
    };
    if (TTS_MODELS[id]) field(modelKey(profile), tx('model'), [...TTS_MODELS[id], ...(this.catalog.models || [])]);
    const voices = id === 'system' ? [{ id: '', label: tx('systemVoice') }, ...(window.speechSynthesis?.getVoices() || []).map(v => ({ id: v.voiceURI, label: `${v.name} · ${v.lang}` }))] : voiceChoices(profile, this.catalog);
    field('voice', tx('voice'), voices, id !== 'system');
    if (canLoadVoiceCatalog(id)) {
      const load = button(this.host, 'refresh-cw', tx('refreshVoices'), async () => {
        this.abort?.abort(); const abort = this.abort = new AbortController(); load.disabled = true; feedback.setText(tx('loading'));
        try {
          const profile = profileFor(p);
          const result = await loadVoiceCatalog(profile, { request: requestUrl, key: profile.key, signal: abort.signal });
          if (abort.signal.aborted || this.disposed || config(p).provider !== id) return;
          this.catalog = result; this.message = tx(result.more ? 'catalogPartial' : 'catalogReady'); this.render();
        } catch (error) {
          if (!abort.signal.aborted && !this.disposed) { feedback.setText(errorText(p, error, id)); load.disabled = false; }
        }
      }, true);
    }
    const feedback = this.host.createDiv({ cls: 'qbr-tts-choice-feedback', text: this.message || '', attr: { role: 'status' } });
  }
}
class TtsSettingsModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.previewOwner = {}; }
  onOpen() {
    this.contentEl.addClass('qbr-tts-settings');
    this.render();
  }
  render() {
    const p = this.plugin, tx = key => ttsText(p, key), settings = config(p), controller = ensureTts(p);
    this.contentEl.empty(); this.setTitle(tx('settings'));
    this.picker?.destroy();
    const changed = () => { controller.stop(); controller.cache.clear(); persist(p); };
    new Setting(this.contentEl).setName(tx('service')).addDropdown(drop => {
      for (const [id, value] of Object.entries(TTS_PROVIDERS)) {
        if (id === 'edge' && !Platform.isDesktopApp) continue;
        drop.addOption(id, ['system', 'doubao', 'siliconflow'].includes(id) ? tx(id) : value.label);
      }
      drop.setValue(settings.provider).onChange(value => { settings.provider = value; changed(); this.render(); });
    });
    const id = settings.provider, profile = ttsProfile(settings);
    this.contentEl.createEl('p', { cls: 'qbr-tts-description', text: tx(id === 'system' ? 'local' : id === 'edge' ? 'edge' : 'cloud') });
    if (id === 'doubao' || id === 'minimax') this.contentEl.createEl('p', { cls: 'qbr-tts-description', text: tx(`${id}Help`) });
    const update = (key, value) => {
      settings.profiles[id] = { ...settings.profiles[id], [key]: value.trim() }; changed();
    };
    const field = (host, key, label = key) => new Setting(host).setName(tx(label)).addText(input => input.setValue(profile[key] || '').onChange(value => update(key, value)));
    if (!['system', 'edge'].includes(id)) new Setting(this.contentEl).setName(tx('key')).addText(input => {
      input.inputEl.type = 'password'; input.inputEl.autocomplete = 'off';
      input.setValue(p.app.secretStorage?.getSecret(`qiaomu-reader-tts-${id}`) || '').onChange(value => {
        try { p.app.secretStorage.setSecret(`qiaomu-reader-tts-${id}`, value.trim()); changed(); }
        catch { new Notice(tx('error-save')); }
      });
    });
    this.picker = new SpeechChoices(this.contentEl.createDiv('qbr-tts-choices'), p, changed);
    if (id === 'azure') field(this.contentEl, 'region');
    if (profile.baseUrl !== undefined) {
      const details = this.contentEl.createEl('details'); details.createEl('summary', { text: tx('advanced') });
      field(details, 'baseUrl', 'url');
    }
    const status = this.contentEl.createEl('p', { cls: 'qbr-tts-status', text: tx('ready'), attr: { role: 'status' } });
    this.unsubscribe?.();
    const listener = c => {
      if (c.owner !== this.previewOwner) { status.setText(tx('ready')); return; }
      status.setText(c.state === 'error' ? errorText(p, c.error, id) : tx(c.state === 'ended' ? 'verified' : c.state));
    };
    p.ttsListeners.add(listener); this.unsubscribe = () => p.ttsListeners.delete(listener);
    button(this.contentEl, 'volume-2', tx('preview'), () => controller.start(this.previewOwner, [{ text: tx('sample') }], profileFor(p)), true);
    button(this.contentEl, 'square', tx('stop'), () => controller.stop(this.previewOwner), true);
  }
  onClose() { this.picker?.destroy(); this.voiceCleanup?.(); this.unsubscribe?.(); this.plugin.tts?.stop(this.previewOwner); this.contentEl.empty(); }
}

function clearHighlight(view) {
  for (const doc of view._ttsHighlightDocs || []) doc.defaultView?.CSS?.highlights?.delete('qbr-speech');
  view._ttsHighlightDocs?.clear();
}
function highlight(view, range) {
  clearHighlight(view);
  if (!range?.startContainer?.isConnected) return;
  const doc = range.startContainer.ownerDocument, win = doc.defaultView;
  if (!win?.CSS?.highlights || !win.Highlight) return;
  if (!doc.querySelector('style[data-qbr-speech]')) {
    const style = doc.createElement('style'); style.dataset.qbrSpeech = '';
    style.textContent = '::highlight(qbr-speech){background:rgba(160,150,100,.24);text-decoration:underline;}'; doc.head.appendChild(style);
  }
  win.CSS.highlights.set('qbr-speech', new win.Highlight(range));
  (view._ttsHighlightDocs ||= new Set()).add(doc);
}
function engineItems(view, fromCurrent = false) {
  const { doc, index } = view.engine.contents()[0] || {};
  if (!doc?.body) return [];
  const range = fromCurrent ? view.engine.currentLocation()?.range : null;
  return speechDocumentChunks(doc, range?.startContainer.ownerDocument === doc ? range : null).map(item => ({ ...item, section: index }));
}
async function startReading(view, selectedText, resume = false) {
  const plugin = view.plugin, controller = ensureTts(plugin), file = view.file;
  if (!file || view._openingBook) return;
  const settings = config(plugin), saved = settings.progress?.[file.path];
  const request = view._ttsRequest = (view._ttsRequest || 0) + 1;
  controller.stop();
  const token = controller.generation;
  try {
    if (resume && saved?.mtime === file.stat?.mtime && saved.cfi && view.engine) await view.engine.goTo(saved.cfi);
    if (token !== controller.generation || request !== view._ttsRequest || file !== view.file || view._closed) return;
    let items, nextSection;
    if (selectedText) items = splitSpeechText(selectedText);
    else if (view.engine) {
      const engine = view.engine; items = engineItems(view, true);
      let section = engine.contents()[0]?.index;
      nextSection = async signal => {
        for (;;) {
          const next = engine.nextReadingSection(section);
          if (next === null) return [];
          checkTtsSignal(signal);
          if (view.engine !== engine || view.file !== file) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          await engine.goTo(next); checkTtsSignal(signal); section = next;
          const chunks = engineItems(view); if (chunks.length) return chunks;
        }
      };
    } else {
      const page = view.pager?.currentPdfPageNumber?.() || 1;
      items = splitSpeechText(view._pdfLazy?.textFor(page) || '');
    }
    if (!items.length) { new Notice(ttsText(plugin, 'error-emptyText')); return; }
    const owner = {
      view, clearHighlight: () => clearHighlight(view),
      onSegment: item => {
        if (file !== view.file) { controller.stop(owner); return; }
        highlight(view, item.range);
        if (!selectedText && item.range && view.engine) {
          const cfi = view.engine.cfiFromRange(item.section, item.range);
          if (cfi) {
            settings.progress ||= {}; settings.progress[file.path] = { cfi, mtime: file.stat?.mtime };
            // Keep the bounded set of most recently heard books, not full text.
            const entries = Object.entries(settings.progress); if (entries.length > 100) delete settings.progress[entries[0][0]];
            persist(plugin);
            void view.engine.goTo(cfi).catch(() => {});
          }
        }
      },
    };
    controller.makeAudio = () => new view.contentEl.ownerDocument.defaultView.Audio();
    controller.start(owner, items, profileFor(plugin), { nextSection, rate: settings.rate || 1 });
  } catch (error) { new Notice(errorText(plugin, error, settings.provider)); }
}
export function openTts(view, selectedText) {
  if (!view._ttsBar) return;
  if (selectedText) stopViewTts(view);
  view._ttsSelectedText = selectedText || null;
  view._ttsBar.hidden = false;
  view._ttsRefresh?.();
}
export function attachTts(view, tray) {
  const plugin = view.plugin, controller = ensureTts(plugin), tx = key => ttsText(plugin, key);
  view._ttsCleanup?.();
  button(tray, 'volume-2', tx('read'), () => openTts(view));
  const bar = view._ttsBar = view.contentEl.createDiv('qbr-tts-player'); bar.hidden = true;
  const status = bar.createEl('div', { cls: 'qbr-tts-sr', attr: { role: 'status' } });
  const detail = bar.createDiv('qbr-tts-detail'); detail.hidden = true;
  const heading = detail.createDiv('qbr-tts-heading');
  const position = detail.createDiv('qbr-tts-position');
  const controls = bar.createDiv('qbr-tts-controls');
  const speed = controls.createEl('button', { cls: 'qbr-tts-button qbr-tts-speed', attr: { type: 'button', 'aria-expanded': 'false' } });
  let savedSession = null, previewState = 'ready', previewError = null;
  const previewOwner = {};
  const captureSession = () => controller.owner?.view === view && controller.items.length ? { owner: controller.owner, items: controller.items, nextSection: controller.nextSection, index: controller.index, rate: controller.rate, file: view.file } : null;
  const stopPreview = (restore = true) => {
    const session = savedSession; savedSession = null;
    if (controller.owner === previewOwner) controller.stop(previewOwner);
    if (restore && session && session.file === view.file && !view._closed) controller.start(session.owner, session.items, profileFor(plugin), { ...session, paused: true });
  };
  const previous = button(controls, 'skip-back', tx('previous'), () => controller.skip(-1));
  const play = button(controls, 'play', tx('play'), () => {
    if (controller.owner === previewOwner) stopPreview();
    if (controller.owner?.view === view && ['playing', 'paused', 'loading', 'error'].includes(controller.state)) controller.toggle();
    else void startReading(view, view._ttsSelectedText);
  });
  play.addClass('qbr-tts-play');
  const next = button(controls, 'skip-forward', tx('next'), () => controller.skip(1));
  const expand = button(controls, 'chevron-up', tx('options'), () => {
    detail.hidden = !detail.hidden; options.hidden = detail.hidden;
    bar.toggleClass('qbr-tts-expanded', !detail.hidden);
    expand.setAttribute('aria-expanded', String(!detail.hidden));
    expand.replaceChildren(); setIcon(expand, detail.hidden ? 'chevron-up' : 'chevron-down');
    expand.createSpan({ cls: 'qbr-tts-sr', text: tx(detail.hidden ? 'options' : 'collapse') });
    closeRates();
  });
  expand.setAttribute('aria-expanded', 'false');
  const rates = bar.createDiv('qbr-tts-rates'); rates.hidden = true;
  const rateTitle = rates.createDiv({ cls: 'qbr-tts-rate-heading', text: tx('speed') });
  const rateChoices = rates.createDiv('qbr-tts-rate-choices');
  let rateScope;
  const closeRates = () => { rates.hidden = true; speed.setAttribute('aria-expanded', 'false');
    if (rateScope) { plugin.app.keymap.popScope(rateScope); rateScope = null; }
  };
  view._ttsCloseRates = closeRates;
  for (const value of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
    const choice = rateChoices.createEl('button', { text: `${value}×`, cls: 'qbr-tts-button', attr: { type: 'button' } });
    choice.dataset.rate = String(value);
    choice.addEventListener('click', () => {
      config(plugin).rate = value; if (controller.owner?.view === view) controller.setRate(value);
      persist(plugin); refresh(); closeRates(); speed.focus();
    });
  }
  const speedHint = rates.createDiv('qbr-tts-speed-hint');
  speed.addEventListener('click', () => {
    if (!rates.hidden) { closeRates(); return; }
    rates.hidden = false; speed.setAttribute('aria-expanded', 'true');
    rateScope = new Scope(); rateScope.register([], 'Escape', () => { closeRates(); speed.focus(); return false; });
    plugin.app.keymap.pushScope(rateScope); rateChoices.querySelector('[aria-pressed="true"]')?.focus();
  });
  const onOutside = event => { if (!rates.contains(event.target) && !speed.contains(event.target)) closeRates(); };
  const doc = bar.ownerDocument; doc.addEventListener('pointerdown', onOutside);
  bar.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !rates.hidden) { event.preventDefault(); event.stopPropagation(); closeRates(); speed.focus(); }
  });
  const options = bar.createDiv('qbr-tts-options'); options.hidden = true;
  const selections = options.createDiv('qbr-tts-selections');
  const serviceLabel = selections.createEl('label', { cls: 'qbr-tts-choice' }); serviceLabel.createSpan({ text: tx('service') });
  const service = serviceLabel.createEl('select', { attr: { 'data-tts-field': 'service' } });
  for (const [id, value] of Object.entries(TTS_PROVIDERS)) {
    if (id === 'edge' && !Platform.isDesktopApp) continue;
    service.createEl('option', { value: id, text: ['system', 'doubao', 'siliconflow'].includes(id) ? tx(id) : value.label });
  }
  const changed = () => {
    if (controller.owner === previewOwner) stopPreview();
    else { const session = captureSession(); if (session) controller.start(session.owner, session.items, profileFor(plugin), { ...session, paused: true }); }
    previewState = 'ready'; previewError = null; refresh();
  };
  const picker = new SpeechChoices(selections.createDiv('qbr-tts-choices'), plugin, changed);
  service.addEventListener('change', () => { config(plugin).provider = service.value; persist(plugin); changed(); picker.render(); });
  const sampleRow = options.createDiv('qbr-tts-preview-row');
  const preview = button(sampleRow, 'volume-2', tx('preview'), () => {
    if (controller.owner === previewOwner) { stopPreview(); previewState = 'ready'; refresh(); return; }
    savedSession = captureSession(); previewError = null;
    controller.start(previewOwner, [{ text: tx('sample') }], profileFor(plugin));
  }, true);
  button(sampleRow, 'settings-2', tx('configure'), () => { stopPreview(); openTtsSettings(plugin); }, true);
  const previewFeedback = options.createDiv({ cls: 'qbr-tts-choice-feedback', attr: { role: 'status' } });
  options.createDiv({ cls: 'qbr-tts-choice-feedback', text: tx('choiceHint') });
  const privacy = options.createDiv('qbr-tts-choice-feedback');
  const resume = button(options, 'history', tx('saved'), () => void startReading(view, null, true), true);
  button(options, 'square', tx('finish'), () => stopViewTts(view), true);
  const errorBox = bar.createDiv('qbr-tts-error'); errorBox.hidden = true;
  const errorMessage = errorBox.createDiv({ attr: { role: 'alert' } });
  const fallback = button(errorBox, 'volume-2', tx('fallback'), () => {
    config(plugin).provider = 'system'; persist(plugin);
    if (controller.owner?.view === view && controller.items.length) {
      const { owner, items, nextSection, index, rate } = controller;
      controller.start(owner, items, profileFor(plugin), { nextSection, index, rate });
    } else void startReading(view, view._ttsSelectedText);
  }, true);
  const refresh = () => {
    const own = controller.owner?.view === view, state = own ? controller.state : 'idle';
    const profile = ttsProfile(config(plugin)), rate = own ? controller.rate : config(plugin).rate || 1;
    status.setText(state === 'idle' ? tx('play') : state === 'error' ? errorText(plugin, controller.error, profile.id) : tx(state));
    heading.setText(view.file?.basename || tx('options'));
    position.setText(own && controller.items.length ? ttsText(plugin, 'segment', `${Math.min(controller.index + 1, controller.items.length)} / ${controller.items.length}`)
      : tx(view._ttsSelectedText ? 'selected' : 'play'));
    const playing = ['playing', 'loading'].includes(state);
    play.replaceChildren(); setIcon(play, state === 'loading' ? 'loader-circle' : playing ? 'pause' : 'play');
    play.createSpan({ cls: 'qbr-tts-sr', text: tx(playing ? 'pause' : state === 'paused' ? 'resume' : state === 'error' ? 'retry' : 'play') });
    play.setAttribute('aria-busy', String(state === 'loading'));
    previous.disabled = !own || controller.index <= 0;
    next.disabled = !own || controller.index >= controller.items.length - 1;
    speed.replaceChildren(); speed.createSpan({ cls: 'qbr-tts-sr', text: `${tx('speed')} ` }); speed.createSpan({ text: `${rate}×` });
    for (const choice of rateChoices.children) choice.setAttribute('aria-pressed', String(Number(choice.dataset.rate) === Number(rate)));
    rateTitle.setText(`${tx('speed')} · ${rate}×`);
    speedHint.setText(profile.id === 'system' ? tx('speedNote') : ''); speedHint.hidden = profile.id !== 'system';
    service.value = profile.id;
    if (picker.provider !== profile.id) picker.render();
    privacy.setText(tx(profile.id === 'system' ? 'local' : profile.id === 'edge' ? 'edge' : 'cloud'));
    preview.replaceChildren(); setIcon(preview, controller.owner === previewOwner ? 'square' : 'volume-2');
    preview.createSpan({ text: tx(controller.owner === previewOwner ? 'previewStop' : 'preview') });
    previewFeedback.setText(previewError ? errorText(plugin, previewError, profile.id) : tx(previewState));
    errorBox.hidden = state !== 'error'; bar.toggleClass('qbr-tts-has-error', state === 'error');
    if (state === 'error') errorMessage.setText(errorText(plugin, controller.error, profile.id));
    fallback.hidden = profile.id === 'system';
    resume.hidden = !['idle', 'ended'].includes(state) || !!view._ttsSelectedText || !config(plugin).progress?.[view.file?.path]?.cfi || !view.engine;
  };
  const listener = () => {
    if (controller.owner === previewOwner) {
      previewState = controller.state === 'ended' ? 'verified' : controller.state;
      previewError = controller.error;
      if (['ended', 'error'].includes(controller.state)) {
        const generation = controller.generation;
        queueMicrotask(() => { if (controller.owner === previewOwner && controller.generation === generation) { stopPreview(); refresh(); } });
      }
    } else if (controller.owner && savedSession) savedSession = null;
    refresh();
  };
  plugin.ttsListeners.add(listener); view._ttsRefresh = () => { picker.render(); refresh(); }; refresh();
  view._ttsStopPreview = () => stopPreview(false);
  view._ttsCleanup = () => {
    view._ttsRequest = (view._ttsRequest || 0) + 1;
    closeRates(); picker.destroy(); stopPreview(false);
    doc.removeEventListener('pointerdown', onOutside);
    plugin.ttsListeners.delete(listener); if (controller.owner?.view === view) controller.stop(); clearHighlight(view); bar.remove(); view._ttsBar = null;
  };
}

export function stopViewTts(view) {
  view._ttsCloseRates?.(); view._ttsStopPreview?.();
  view._ttsRequest = (view._ttsRequest || 0) + 1;
  if (view.plugin.tts?.owner?.view === view) view.plugin.tts.stop();
  view._ttsSelectedText = null;
  if (view._ttsBar) view._ttsBar.hidden = true;
}
