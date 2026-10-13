import { Modal, Notice, Platform, Scope, Setting, requestUrl, setIcon } from 'obsidian';
import { TtsController } from './tts-controller.js';
import { EdgeSpeechClient } from './tts-edge-client.js';
import { buildSpeechRequest, checkTtsSignal, synthesizeHttp, TTS_PROVIDERS, ttsError, ttsProfile } from './tts-providers.js';
import { rememberSpeechProgress, restorePdfSpeechPage, savedSpeechProgress, speechAnchorVisible, speechStartMode } from './tts-progress.js';
import { TTS_MODELS, canLoadVoiceCatalog, changeSpeechModel, loadVoiceCatalog, modelKey, uniqueChoices, voiceChoices } from './tts-choices.js';
import { speechDocumentChunks, splitSpeechText } from './tts-text.js';
import { macVoiceChoices } from './tts-mac-voices.js';
import { createLocalTtsManager, LOCAL_MODELS, localVoiceChoices, normalizeLocalProfile } from './tts-local.js';
import { LocalSpeechPanel } from './tts-local-ui.js';
import { speechServiceLinks } from './tts-service-links.js';

// The new feature has reviewed Chinese/English copy. Other plugin languages
// explicitly fall back to English until their TTS translations are reviewed.
export const TTS_COPY = {
  welcome: ['默认使用 Edge 在线朗读，无需密钥。文字会发送至微软，可在「语音设置」切换其他服务。', 'Edge online speech needs no key and sends reading text to Microsoft. Open Speech settings to configure other providers.'],
  welcomeOther: ['点击音色可换声音、选模型和试听；语音设置可配置其他服务。', 'Click the voice to change voices, models or test speech. Open Speech settings to configure other providers.'],
  welcomeUnavailable: ['当前设备未提供系统朗读接口。打开「语音设置」选择并配置其他服务。', 'System speech is unavailable on this device. Open Speech settings to choose and configure another provider.'],
  macos: ['Mac 本地语音', 'Mac local speech'], macosHelp: ['调用本机已安装音色，无需密钥。可用音色取决于系统版本；下载新声音后刷新列表并试听。', 'Uses installed Mac voices without a key. Availability depends on macOS; refresh and audition after downloading voices.'],
  voiceEnhanced: ['增强', 'Enhanced'], voicePremium: ['高品质', 'Premium'],
  recommended: ['推荐', 'Recommended'], voiceDisplayName: ['使用阅读器显示名', 'Reader display name'],
  voiceSources: ['音色来源', 'Voice sources'],
  localModel: ['本地模型', 'Local models'],
  localModelHelp: ['在本机合成，无需密钥；首次需联网下载模型和运行环境。', 'Synthesis stays on this computer without a key. Setup downloads models and their runtime once.'],
  modelDownloadSize: ['模型下载约', 'Model download: about'], downloadUse: ['下载并使用', 'Download and use'], cancelDownload: ['取消下载', 'Cancel download'],
  localDetails: ['存储与音色来源', 'Storage and voice sources'],
  localStorage: ['模型与运行环境存放在本机应用数据目录，独立于笔记库。', 'Models and their runtime live in device application data, outside vaults.'],
  kokoroHelp: ['知夏、言川等为阅读器显示名；提供精选中英文音色。', 'Zhixia, Yanchuan and other Chinese voice names are Reader display names. Includes selected Chinese and English voices.'],
  meloHelp: ['提供一个中英音色；英文仅支持内置词典中的词。', 'One Chinese/English voice. English words must be present in the built-in lexicon.'],
  'localPhase-unknown': ['正在检查安装状态…', 'Checking installation…'], 'localPhase-missing': ['尚未安装；首次安装可能需要几分钟。', 'Not installed. Initial setup can take several minutes.'],
  'localPhase-runtime': ['正在准备运行环境…', 'Preparing runtime…'], 'localPhase-extract': ['正在校验并展开模型…', 'Verifying and extracting model…'],
  'localPhase-environment': ['正在安装依赖…', 'Installing dependencies…'], 'localPhase-download': ['正在下载文件…', 'Downloading files…'],
  'localPhase-downloaded': ['文件已下载，继续准备…', 'Files downloaded. Preparing…'],
  'localPhase-installed': ['安装完成，等待合成检查…', 'Installed. Awaiting synthesis check…'], 'localPhase-verify': ['正在合成测试；首次加载可能较慢…', 'Testing synthesis. First load may take a while…'],
  'localPhase-ready': ['已通过本机合成检查', 'Synthesis verified on this device'], 'localPhase-cancelled': ['已取消，重新下载可继续。', 'Cancelled. Download again to resume.'],
  'localPhase-cancelling': ['正在取消下载…', 'Cancelling download…'],
  'error-localPlatform': ['本地模型安装仅适用于桌面端，请选择系统语音或云端服务。', 'Local model installation requires desktop. Choose system speech or a cloud provider.'],
  'error-localMissing': ['此设备尚未安装或验证该模型，请点击「下载并使用」。', 'This model is not installed or verified on this device. Choose Download and use.'],
  'error-localModel': ['请选择列表中的本地模型。', 'Choose a local model from the list.'],
  'error-localPath': ['存储位置不能在笔记库或插件目录内。', 'Storage must be outside vaults and plugin directories.'],
  'error-localBusy': ['其他窗口正在准备此模型，请稍后重试。', 'Another window is preparing this model. Retry shortly.'],
  'error-localDownload': ['下载失败，请检查网络后重试。', 'Download failed. Check the network and retry.'],
  'error-localChecksum': ['下载校验失败，请重试。', 'Download verification failed. Retry.'], 'error-localArchive': ['安装包格式异常，请重试。', 'Invalid installation archive. Retry.'],
  'error-localEnvironment': ['运行环境未能启动，请重新安装模型。', 'The runtime could not start. Reinstall the model.'],
  'error-localInstall': ['安装未完成，请检查网络和剩余磁盘空间后重试。', 'Installation did not finish. Check the network and free disk space, then retry.'],
  'error-localInference': ['本地模型未能生成音频，请重试或切换模型、音色。', 'Local synthesis failed. Retry or change the model or voice.'],
  gotIt: ['知道了', 'Got it'], voiceSettings: ['语音设置', 'Speech settings'],
  serviceModels: ['服务与模型', 'Service and model'], configureTest: ['配置并试听', 'Set up and test'],
  voiceSearch: ['搜索音色', 'Search voices'], noVoices: ['没有匹配的音色', 'No matching voices'],
  customVoice: ['填写音色 ID', 'Enter a voice ID'], done: ['返回朗读', 'Back to reading'],
  returnSpeech: ['回到朗读处', 'Return to speech'], nextChapter: ['继续下一章', 'Continue next chapter'],
  browseEnd: ['本章已读完。继续会打开下一章。', 'Chapter finished. Continue opens the next chapter.'],
  fromPage: ['从当前页朗读', 'Read from current page'],
  'error-resume': ['无法恢复保存的位置。可选择「从当前页朗读」重新开始。', 'Could not restore the saved position. Choose Read from current page to start again.'],
  custom: ['自定义…', 'Custom…'], customValue: ['自定义 ID', 'Custom ID'],
  refreshVoices: ['更新音色列表', 'Refresh voice list'], catalogReady: ['音色列表已更新', 'Voice list updated'],
  catalogPartial: ['已加载前 1000 个音色；其他音色可填 ID。', 'Loaded the first 1,000 voices; enter an ID for others.'],
  choiceHint: ['更换后从当前段落继续；试听不会改变进度。', 'Continue from the current segment after changing voices. Testing keeps your place.'],
  configure: ['配置服务', 'Configure service'], previewStop: ['停止试听', 'Stop test'],
  read: ['朗读', 'Read aloud'], selected: ['朗读选中内容', 'Read selection'], settings: ['朗读设置', 'Speech settings'],
  service: ['语音服务', 'Voice service'], system: ['系统语音', 'System voice'], voice: ['音色', 'Voice'], model: ['模型', 'Model'],
  key: ['API 密钥', 'API key'], url: ['服务地址', 'Service URL'], region: ['区域', 'Region'], advanced: ['高级设置', 'Advanced settings'],
  getKey: ['获取密钥', 'Get a key'], serviceDocs: ['服务文档', 'Service docs'],
  customKeyHelp: ['向所用服务商获取密钥；本机服务无需密钥时可留空。', 'Get a key from your provider; leave it empty for local services that need no key.'],
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
  'error-macPlatform': ['Mac 本地语音仅适用于 Mac 桌面端，请选择其他语音服务。', 'Mac local speech requires a Mac desktop. Choose another provider.'],
  'error-native': ['本机语音调用失败，请刷新音色、重试或更换语音服务。', 'Local speech failed. Refresh voices, retry, or choose another provider.'],
  'error-systemUnavailable': ['当前设备未提供系统朗读接口，请在语音设置中选择其他服务。', 'System speech is unavailable on this device. Choose another provider in Speech settings.'],
  'error-http': ['语音请求失败（HTTP {0}），请检查服务配置或重试。', 'Speech request failed (HTTP {0}). Check settings or retry.'],
  rateLimitUntil: ['语音服务暂时限流，已暂停请求。{0} 后可重试，也可更换服务。', 'The voice service is rate-limiting requests. Retry after {0}, or choose another service.'],
  'error-rateLimit': ['请求过于频繁（429），请稍后重试或更换语音服务。', 'Too many requests (429). Retry later or choose another voice service.'],
  'error-edge403': ['Edge 拒绝了本次请求（403），可重试或改用系统语音。', 'Edge rejected this request (403). Retry or use system voice.'],
  'error-emptyText': ['此处没有可朗读文字；扫描 PDF 需要先识别文字。', 'No readable text here. Scanned PDFs need text recognition first.'],
  'error-save': ['设置未能保存，请重试。', 'Could not save settings. Please retry.'],
};
export function ttsText(plugin, key, value = '') {
  const pair = TTS_COPY[key] || TTS_COPY['error-network'];
  return pair[plugin.settings.language === 'zh' ? 0 : 1].replace('{0}', String(value));
}
function errorText(plugin, error, provider) {
  if (error?.status === 429 && error.retryAt > Date.now()) {
    const time = new Date(error.retryAt).toLocaleTimeString(plugin.settings.language === 'zh' ? 'zh-CN' : 'en-US');
    return ttsText(plugin, 'rateLimitUntil', time);
  }
  const key = error?.status === 429 ? 'error-rateLimit' : provider === 'edge' && error?.status === 403 ? 'error-edge403'
    : error?.code === 'configuration' ? 'configuration' : `error-${error?.code || 'network'}`;
  return ttsText(plugin, key, error?.status);
}
function config(plugin) {
  const saved = plugin.settings.tts;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) plugin.settings.tts = {};
  const settings = plugin.settings.tts;
  if (!TTS_PROVIDERS[settings.provider]) settings.provider = Platform.isDesktopApp ? 'edge' : 'system';
  if (!settings.profiles || typeof settings.profiles !== 'object') settings.profiles = {};
  if (settings.profiles.localModel) {
    const previous = settings.profiles.localModel, next = normalizeLocalProfile(previous);
    settings.profiles.localModel = next;
    if (previous.model !== next.model || previous.voice !== next.voice) persist(plugin);
  }
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
function ensureLocalTts(plugin) {
  if (plugin.localTts) return plugin.localTts;
  const vault = plugin.app.vault.adapter.getBasePath?.();
  plugin.localTts = createLocalTtsManager({ vaultPaths: vault ? [vault] : [] });
  plugin.register(() => plugin.localTts.dispose());
  return plugin.localTts;
}
export function ensureTts(plugin) {
  if (plugin.tts) return plugin.tts;
  const listeners = new Set();
  const edge = new EdgeSpeechClient(async (text, voice, options) => {
    const { synthesizeEdge } = await import('./tts-edge.js');
    checkTtsSignal(options.signal); return synthesizeEdge(text, voice, options);
  });
  plugin.ttsListeners = listeners;
  plugin.tts = new TtsController({
    makeAudio: () => new window.Audio(), speech: window.speechSynthesis,
    makeUtterance: text => new window.SpeechSynthesisUtterance(text),
    synthesize: async (profile, text, signal) => {
      if (profile.id === 'edge') {
        if (!Platform.isDesktopApp) throw ttsError('mobile');
        return edge.synthesize(text, profile.voice, { signal });
      }
      if (profile.id === 'macos') {
        if (!Platform.isDesktopApp || !Platform.isMacOS) throw ttsError('macPlatform');
        const { synthesizeMacSpeech } = await import('./tts-macos.js');
        return synthesizeMacSpeech(text, profile.voice, { signal });
      }
      if (profile.id === 'localModel') return ensureLocalTts(plugin).synthesize(profile, text, signal);
      return synthesizeHttp(profile, text, { request: requestUrl, key: profile.key, signal });
    },
    onChange: controller => { for (const listener of listeners) listener(controller); },
  });
  plugin.register(() => { plugin.tts.dispose(); listeners.clear(); });
  return plugin.tts;
}
function captureSpeech(controller) {
  return controller.owner?.view && controller.items.length ? {
    owner: controller.owner, items: controller.items, nextSection: controller.nextSection,
    index: controller.index, rate: controller.rate, waitingSection: controller.waitingSection,
    file: controller.owner.view.file,
  } : null;
}
function restoreSpeech(controller, session, plugin) {
  const view = session?.owner?.view;
  if (!view || view._closed || view.file !== session.file || view._ttsBar?.hidden) return;
  controller.start(session.owner, session.items, profileFor(plugin), { ...session, paused: true });
  if (session.waitingSection) { controller.index = session.index; controller.waitingSection = true; controller.emit(); }
}
function configurationError(plugin, profile = profileFor(plugin)) {
  if (profile.id === 'system') return typeof window.speechSynthesis?.speak === 'function' && typeof window.speechSynthesis?.getVoices === 'function' && typeof window.SpeechSynthesisUtterance === 'function' ? null : ttsError('systemUnavailable');
  if (profile.id === 'macos') return Platform.isDesktopApp && Platform.isMacOS ? null : ttsError('macPlatform');
  if (profile.id === 'edge') return Platform.isDesktopApp ? null : ttsError('mobile');
  if (profile.id === 'localModel') return !Platform.isDesktopApp ? ttsError('localPlatform')
    : ensureLocalTts(plugin).snapshot(profile.model).phase === 'ready' ? null : ttsError('localMissing');
  try { buildSpeechRequest(profile, '', profile.key); return null; }
  catch (error) { return error; }
}
function hideSpeechProvider(id, selected) {
  return id !== selected && ((['edge', 'localModel'].includes(id) && !Platform.isDesktopApp) || (id === 'macos' && (!Platform.isDesktopApp || !Platform.isMacOS)));
}
function speechDescription(id) { return id === 'system' ? 'local' : id === 'localModel' ? 'localModelHelp' : id === 'macos' ? 'macosHelp' : id === 'edge' ? 'edge' : 'cloud'; }
function renderServiceHelp(host, profile, tx) {
  host.empty();
  const links = speechServiceLinks(profile);
  if (!links) { host.setText(tx('customKeyHelp')); return; }
  links.forEach((href, i) => {
    if (i) host.appendText(' · ');
    host.createEl('a', { text: tx(i ? 'serviceDocs' : 'getKey'), href, attr: { target: '_blank', rel: 'noopener noreferrer' } });
  });
}
export function openTtsSettings(plugin) { const modal = new TtsSettingsModal(plugin); modal.open(); return modal; }
class SpeechChoices {
  constructor(host, plugin, onChange, options = {}) {
    Object.assign(this, { host, plugin, onChange, options }); this.catalog = {}; this.provider = config(plugin).provider;
    this.onVoices = () => { if (config(plugin).provider === 'system') this.render(); };
    window.speechSynthesis?.addEventListener('voiceschanged', this.onVoices); this.render();
  }
  destroy() { this.disposed = true; this.abort?.abort(); this.localPanel?.destroy(); window.speechSynthesis?.removeEventListener('voiceschanged', this.onVoices); }
  render() {
    const searchQuery = this.host.querySelector('input[type="search"]')?.value || '';
    const p = this.plugin, tx = key => ttsText(p, key), settings = config(p), profile = ttsProfile(settings), id = profile.id;
    if (this.provider !== id) { this.abort?.abort(); this.catalog = {}; this.message = ''; this.nativeLoaded = false; this.localLoaded = false; this.provider = id; }
    this.localPanel?.destroy(); this.host.empty();
    const update = (key, value) => {
      const current = ttsProfile(config(p));
      const next = key === modelKey(current) && id !== 'localModel' ? changeSpeechModel(current, value, this.catalog) : { ...current, [key]: value };
      const normalized = id === 'localModel' ? normalizeLocalProfile(key === 'model' ? { ...next, voice: '' } : next) : next;
      const { id: _id, label: _label, ...saved } = normalized;
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
    if (id === 'localModel') field('model', tx('model'), LOCAL_MODELS.map(x => ({ id: x.id, label: x.label })), false);
    const voices = id === 'system' ? [{ id: '', label: tx('systemVoice') }, ...(window.speechSynthesis?.getVoices?.() || []).map(v => ({ id: v.voiceURI, label: `${v.name} · ${v.lang}` }))]
      : id === 'macos' ? [{ id: '', label: tx('systemVoice') }, ...(this.catalog.voices || [])] : id === 'localModel' ? localVoiceChoices(profile.model, p.settings.language === 'zh') : voiceChoices(profile, this.catalog);
    this.voices = voices;
    if (!this.options.preview) field('voice', tx('voice'), voices, !['system', 'localModel'].includes(id));
    else {
      if (!voices.some(v => v.id === profile.voice) && profile.voice) voices.push({ id: profile.voice, label: profile.voice });
      const searchLabel = this.host.createEl('label', { cls: 'qbr-tts-search' });
      searchLabel.createSpan({ cls: 'qbr-tts-sr', text: tx('voiceSearch') });
      const search = searchLabel.createEl('input', { type: 'search', attr: { placeholder: tx('voiceSearch') } });
      search.value = searchQuery;
      const list = this.host.createDiv('qbr-tts-voice-list');
      const empty = this.host.createDiv({ cls: 'qbr-tts-choice-feedback', text: tx('noVoices') }); empty.hidden = true;
      for (const entry of voices) {
        const row = list.createDiv('qbr-tts-voice-row'); row.dataset.voice = entry.id;
        const choose = button(row, profile.voice === entry.id ? 'check' : 'audio-lines', entry.label, () => {
          update('voice', entry.id);
          Array.from(this.host.querySelectorAll('.qbr-tts-voice-row')).find(el => el.dataset.voice === entry.id)?.querySelector('button')?.focus();
        }, true);
        choose.setAttribute('aria-pressed', String(profile.voice === entry.id));
        if (entry.sourceName) choose.createSpan({ cls: 'qbr-tts-voice-source qbr-tts-sr', text: entry.sourceName });
        const preview = button(row, 'volume-2', `${tx('preview')} ${entry.label}`, () => this.options.preview(entry.id));
        preview.addClass('qbr-tts-voice-preview');
      }
      const filterVoices = () => {
        const query = search.value.trim().toLocaleLowerCase(); let matches = 0;
        for (const row of list.children) { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); if (!row.hidden) matches++; }
        empty.hidden = matches > 0;
      };
      search.addEventListener('input', filterVoices); filterVoices();
      if (!['system', 'localModel', 'macos'].includes(id)) {
        const details = this.host.createEl('details', { cls: 'qbr-tts-custom-voice' });
        details.createEl('summary', { text: tx('customVoice') });
        const label = details.createEl('label', { cls: 'qbr-tts-choice qbr-tts-custom' }); label.createSpan({ text: tx('customValue') });
        const input = label.createEl('input', { type: 'text', value: profile.voice, attr: { spellcheck: 'false' } });
        input.addEventListener('change', () => update('voice', input.value.trim()));
      }
    }
    if (voices.some(v => v.sourceName)) {
      const sources = this.host.createEl('details', { cls: 'qbr-tts-voice-sources' }); sources.createEl('summary', { text: tx('voiceSources') });
      for (const v of voices.filter(v => v.sourceName)) sources.createDiv({ text: `${v.label.split(' · ')[0]} · ${v.sourceName}` });
    }
    if (id === 'localModel' && Platform.isDesktopApp) {
      const manager = ensureLocalTts(p);
      const load = async () => {
        const voices = await manager.voices(profile.model, p.settings.language === 'zh');
        if (this.disposed || config(p).provider !== id) return;
        this.catalog.voices = voices; this.render(); p.tts?.emit();
      };
      this.localPanel = new LocalSpeechPanel(this.host.createDiv(), { manager, app: p.app, model: profile.model, tx,
        errorText: error => errorText(p, error, id), onReady: load, onState: state => { if (['ready', 'missing', 'error'].includes(state.phase)) p.tts?.emit(); } });
      if (!this.localLoaded) { this.localLoaded = true; void load().catch(error => { this.message = errorText(p, error, id); }); }
    }
    let nativeLoad;
    if (canLoadVoiceCatalog(id) || id === 'macos') {
      const load = button(this.host, 'refresh-cw', tx('refreshVoices'), async () => {
        this.abort?.abort(); const abort = this.abort = new AbortController(); load.disabled = true; feedback.setText(tx('loading'));
        try {
          const profile = profileFor(p);
          let result;
          if (id === 'macos') {
            if (!Platform.isDesktopApp || !Platform.isMacOS) throw ttsError('macPlatform');
            const { macSpeechVoices } = await import('./tts-macos.js');
            const voices = await macSpeechVoices(abort.signal);
            result = { voices: macVoiceChoices(voices, tx, p.settings.language === 'zh') };
          } else result = await loadVoiceCatalog(profile, { request: requestUrl, key: profile.key, signal: abort.signal });
          if (abort.signal.aborted || this.disposed || config(p).provider !== id) return;
          this.catalog = result; this.message = tx(result.more ? 'catalogPartial' : 'catalogReady'); this.render();
        } catch (error) {
          if (!abort.signal.aborted && !this.disposed && config(p).provider === id) { this.message = errorText(p, error, id); this.render(); }
        }
      }, true);
      if (id === 'macos' && !this.nativeLoaded && Platform.isDesktopApp && Platform.isMacOS) nativeLoad = load;
    }
    const feedback = this.host.createDiv({ cls: 'qbr-tts-choice-feedback', text: this.message || '', attr: { role: 'status' } });
    if (nativeLoad) { this.nativeLoaded = true; nativeLoad.click(); }
    this.options.onRender?.();
  }
}
class TtsSettingsModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; this.previewOwner = {}; }
  onOpen() {
    this.contentEl.addClass('qbr-tts-settings');
    const controller = ensureTts(this.plugin);
    this.session = captureSpeech(controller);
    if (this.session && ['playing', 'loading'].includes(controller.state)) controller.toggle();
    this.render();
    this.contentEl.querySelector('input[type="password"]')?.focus();
  }
  render() {
    const p = this.plugin, tx = key => ttsText(p, key), settings = config(p), controller = ensureTts(p);
    this.contentEl.empty(); this.setTitle(tx('settings'));
    this.picker?.destroy();
    const changed = () => { controller.stop(this.previewOwner); controller.cache.clear(); persist(p); };
    new Setting(this.contentEl).setName(tx('service')).addDropdown(drop => {
      for (const [id, value] of Object.entries(TTS_PROVIDERS)) {
        if (hideSpeechProvider(id, settings.provider)) continue;
        drop.addOption(id, ['system', 'macos', 'localModel', 'doubao', 'siliconflow'].includes(id) ? tx(id) : value.label);
      }
      drop.setValue(settings.provider).onChange(value => { settings.provider = value; changed(); this.render(); });
    });
    const id = settings.provider, profile = ttsProfile(settings);
    this.contentEl.createEl('p', { cls: 'qbr-tts-description', text: tx(speechDescription(id)) });
    if (id === 'doubao' || id === 'minimax') this.contentEl.createEl('p', { cls: 'qbr-tts-description', text: tx(`${id}Help`) });
    let keyHelp;
    const update = (key, value) => {
      settings.profiles[id] = { ...settings.profiles[id], [key]: value.trim() }; changed();
      if (keyHelp && key === 'baseUrl') renderServiceHelp(keyHelp, ttsProfile(settings), tx);
    };
    const field = (host, key, label = key) => new Setting(host).setName(tx(label)).addText(input => input.setValue(profile[key] || '').onChange(value => update(key, value)));
    if (!['system', 'macos', 'edge', 'localModel'].includes(id)) new Setting(this.contentEl).setName(tx('key')).addText(input => {
      input.inputEl.type = 'password'; input.inputEl.autocomplete = 'off';
      input.setValue(p.app.secretStorage?.getSecret(`qiaomu-reader-tts-${id}`) || '').onChange(value => {
        try { p.app.secretStorage.setSecret(`qiaomu-reader-tts-${id}`, value.trim()); changed(); }
        catch { new Notice(tx('error-save')); }
      });
    });
    if (!['system', 'macos', 'edge', 'localModel'].includes(id)) {
      keyHelp = this.contentEl.createEl('p', { cls: 'qbr-tts-service-help qbr-tts-description' });
      renderServiceHelp(keyHelp, profile, tx);
    }
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
    button(this.contentEl, 'arrow-left', tx('done'), () => this.close(), true);
  }
  onClose() {
    this.picker?.destroy(); this.unsubscribe?.();
    const controller = this.plugin.tts;
    const canRestore = !controller.owner || controller.owner === this.previewOwner || controller.owner === this.session?.owner;
    controller.stop(this.previewOwner);
    if (canRestore) restoreSpeech(controller, this.session, this.plugin);
    this.session?.owner.view._ttsRefresh?.(); this.contentEl.empty();
  }
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
async function navigateSpeech(view, target) {
  view._ttsNavigating = (view._ttsNavigating || 0) + 1;
  try { return await view.engine.goTo(target); }
  finally { view._ttsNavigating--; }
}
function navigatePdfSpeech(view, page) {
  view._ttsNavigating = (view._ttsNavigating || 0) + 1;
  try {
    if (!restorePdfSpeechPage(view, page)) throw ttsError('resume');
  } finally { view._ttsNavigating--; }
}
function engineItems(view, fromCurrent = false, exactRange = null) {
  const contents = view.engine.contents();
  const { doc, index } = (exactRange ? contents.find(c => c.doc === exactRange.startContainer.ownerDocument) : contents[0]) || {};
  if (!doc?.body) return [];
  const range = exactRange || (fromCurrent ? view.engine.currentLocation()?.range : null);
  const local = config(view.plugin).provider === 'localModel';
  return speechDocumentChunks(doc, range?.startContainer.ownerDocument === doc ? range : null, local ? 40 : 240, local).map(item => ({ ...item, section: index }));
}
async function startReading(view, selectedText, resume = 'auto') {
  const plugin = view.plugin, controller = ensureTts(plugin), file = view.file;
  if (!file || view._openingBook) return;
  const settings = config(plugin);
  const shouldResume = resume === 'auto' ? speechStartMode(view, settings) === 'resume' : resume;
  const saved = !selectedText && shouldResume ? savedSpeechProgress(settings, file) : null;
  const request = view._ttsRequest = (view._ttsRequest || 0) + 1;
  controller.stop();
  const token = controller.generation;
  try {
    let exactRange = null;
    if (saved?.cfi && view.engine) {
      const engine = view.engine;
      try {
        await engine.goTo(saved.cfi);
        if (token !== controller.generation || request !== view._ttsRequest || file !== view.file || view._closed || view.engine !== engine) return;
        exactRange = engine.rangeFromCfi(saved.cfi);
      }
      catch { throw ttsError('resume'); }
      if (!exactRange) throw ttsError('resume');
    }
    if (token !== controller.generation || request !== view._ttsRequest || file !== view.file || view._closed) return;
    let items, nextSection;
    const local = settings.provider === 'localModel';
    if (selectedText) items = splitSpeechText(selectedText, local ? 40 : 240, local);
    else if (view.engine) {
      const engine = view.engine; items = engineItems(view, true, exactRange);
      let section = items[0]?.section ?? engine.contents()[0]?.index;
      nextSection = async signal => {
        for (;;) {
          const next = engine.nextReadingSection(section);
          if (next === null) return [];
          checkTtsSignal(signal);
          if (view.engine !== engine || view.file !== file) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          await navigateSpeech(view, next); checkTtsSignal(signal); section = next;
          const chunks = engineItems(view); if (chunks.length) return chunks;
        }
      };
    } else {
      const lazy = view._pdfLazy;
      let page = saved?.page || view.pager?.currentPdfPageNumber?.() || 1;
      if (saved?.page) navigatePdfSpeech(view, page);
      const chunks = page => splitSpeechText(lazy?.textFor(page) || '', local ? 40 : 240, local).map(item => ({ ...item, page }));
      items = chunks(page).filter(item => !saved || item.end > saved.offset);
      const pages = [...(view.pager?.flow?.querySelectorAll('.qiaomu-reader-pdf-page-break[data-pdf-page-no]') || [])]
        .map(el => Number(el.dataset.pdfPageNo)).filter(n => Number.isInteger(n) && n > page).sort((a, b) => a - b);
      nextSection = pages.length ? async signal => {
        for (const next of pages) {
          if (next <= page) continue;
          checkTtsSignal(signal);
          if (view.file !== file || view._pdfLazy !== lazy) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          page = next;
          const items = chunks(page);
          if (items.length) return items;
        }
        return [];
      } : undefined;
    }
    if (!items.length) { new Notice(ttsText(plugin, 'error-emptyText')); return; }
    const owner = {
      view, follow: true, clearHighlight: () => clearHighlight(view),
      onSegment: async item => {
        if (file !== view.file) { controller.stop(owner); return; }
        highlight(view, item.range);
        if (!selectedText && item.range && view.engine) {
          const cfi = view.engine.cfiFromRange(item.section, item.range);
          if (cfi) {
            rememberSpeechProgress(settings, file, { cfi });
            persist(plugin);
            if (owner.follow && !speechAnchorVisible(view, { cfi })) await navigateSpeech(view, cfi);
          }
        } else if (!selectedText && item.page) {
          rememberSpeechProgress(settings, file, { page: item.page, offset: item.start }); persist(plugin);
          if (owner.follow && view.pager?.currentPdfPageNumber?.() !== item.page) navigatePdfSpeech(view, item.page);
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
  const readAction = button(tray, 'volume-2', tx('read'), () => openTts(view)); readAction.addClass('qbr-tts-read-action');
  const bar = view._ttsBar = view.contentEl.createDiv('qbr-tts-player'); bar.hidden = true;
  const status = bar.createEl('div', { cls: 'qbr-tts-sr', attr: { role: 'status' } });

  const controls = bar.createDiv('qbr-tts-controls');
  const voiceButton = button(controls, 'audio-lines', tx('voice'), () => toggleChoices(), true); voiceButton.addClass('qbr-tts-current-voice');
  voiceButton.setAttribute('aria-expanded', 'false');
  const speed = controls.createEl('button', { cls: 'qbr-tts-button qbr-tts-speed', attr: { type: 'button', 'aria-expanded': 'false' } });
  let savedSession = null, previewState = 'ready', previewError = null;
  const previewOwner = {};
  const captureSession = () => controller.owner?.view === view ? captureSpeech(controller) : null;
  const stopPreview = (restore = true) => {
    const session = savedSession; savedSession = null;
    if (controller.owner === previewOwner) controller.stop(previewOwner);
    if (restore && session) restoreSpeech(controller, session, plugin);
  };
  const previous = button(controls, 'skip-back', tx('previous'), () => controller.skip(-1));
  const play = button(controls, 'play', tx('play'), () => {
    if (controller.owner === previewOwner) stopPreview();
    if (controller.owner?.view === view && ['playing', 'paused', 'loading', 'error'].includes(controller.state)) controller.toggle();
    else void startReading(view, view._ttsSelectedText);
  });
  play.addClass('qbr-tts-play');
  const next = button(controls, 'skip-forward', tx('next'), () => controller.skip(1));
  controls.appendChild(speed);
  const close = button(controls, 'x', tx('finish'), () => { stopViewTts(view); tray.querySelector('.qbr-tts-button')?.focus(); }); close.addClass('qbr-tts-close');
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
    closeChoices(); rates.hidden = false; fitPanels(); speed.setAttribute('aria-expanded', 'true');
    rateScope = new Scope(); rateScope.register([], 'Escape', () => { closeRates(); speed.focus(); return false; });
    plugin.app.keymap.pushScope(rateScope); rateChoices.querySelector('[aria-pressed="true"]')?.focus();
  });
  const onOutside = event => {
    if (!rates.contains(event.target) && !speed.contains(event.target)) closeRates();
    if (!options.contains(event.target) && !voiceButton.contains(event.target)) closeChoices();
  };
  const doc = bar.ownerDocument; doc.addEventListener('pointerdown', onOutside);
  bar.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !options.hidden) { event.preventDefault(); event.stopPropagation(); closeChoices(); voiceButton.focus(); }
    if (event.key === 'Escape' && !rates.hidden) { event.preventDefault(); event.stopPropagation(); closeRates(); speed.focus(); }
  });
  const origins = bar.createDiv('qbr-tts-origins');
  const resumeSaved = button(origins, 'history', tx('saved'), () => { stopPreview(false); void startReading(view, null, true); }, true);
  const fromPage = button(origins, 'text-cursor-input', tx('fromPage'), () => { stopPreview(false); void startReading(view, null, false); }, true);
  const returnSpeech = button(origins, 'locate', tx('returnSpeech'), async () => {
    const saved = savedSpeechProgress(config(plugin), view.file);
    if (!saved) return;
    try {
      if (saved.cfi && view.engine) await navigateSpeech(view, saved.cfi);
      else navigatePdfSpeech(view, saved.page);
      if (controller.owner?.view === view) controller.owner.follow = true;
      refresh();
    } catch (error) { new Notice(errorText(plugin, error, config(plugin).provider)); }
  }, true);
  const options = bar.createDiv('qbr-tts-options'); options.hidden = true;
  const popupHeader = options.createDiv('qbr-tts-popup-header');
  popupHeader.createSpan({ text: tx('voice') });
  button(popupHeader, 'x', tx('close'), () => { closeChoices(); voiceButton.focus(); });
  let choiceScope;
  const closeChoices = () => {
    options.hidden = true; voiceButton.setAttribute('aria-expanded', 'false');
    if (choiceScope) { plugin.app.keymap.popScope(choiceScope); choiceScope = null; }
    if (controller.owner === previewOwner) { stopPreview(); previewState = 'ready'; refresh(); }
  };
  const fitPanels = () => {
    const available = Math.max(100, bar.getBoundingClientRect().top - view.contentEl.getBoundingClientRect().top - 16);
    bar.style.setProperty('--qbr-tts-panel-height', `${available}px`);
  };
  const resize = new bar.ownerDocument.defaultView.ResizeObserver(fitPanels); resize.observe(view.contentEl);
  const toggleChoices = () => {
    if (!options.hidden) { closeChoices(); return; }
    closeRates(); dismissIntro(); options.hidden = false; fitPanels(); voiceButton.setAttribute('aria-expanded', 'true');
    choiceScope = new Scope(); choiceScope.register([], 'Escape', () => { closeChoices(); voiceButton.focus(); return false; });
    plugin.app.keymap.pushScope(choiceScope);
    options.querySelector('.qbr-tts-voice-row button[aria-pressed="true"]')?.focus();
  };
  view._ttsCloseChoices = closeChoices;
  const selections = options.createDiv('qbr-tts-selections');
  const serviceLabel = selections.createEl('label', { cls: 'qbr-tts-choice' }); serviceLabel.createSpan({ text: tx('service') });
  const service = serviceLabel.createEl('select', { attr: { 'data-tts-field': 'service' } });
  for (const [id, value] of Object.entries(TTS_PROVIDERS)) {
    if (hideSpeechProvider(id, config(plugin).provider)) continue;
    service.createEl('option', { value: id, text: ['system', 'macos', 'localModel', 'doubao', 'siliconflow'].includes(id) ? tx(id) : value.label });
  }
  const changed = () => {
    if (controller.owner === previewOwner) stopPreview();
    else { const session = captureSession(); if (session) restoreSpeech(controller, session, plugin); }
    previewState = 'ready'; previewError = null; refresh();
  };
  let previewVoice = '';
  const audition = voice => {
    if (configurationError(plugin, { ...profileFor(plugin), voice })) { configure(); return; }
    if (controller.owner === previewOwner && previewVoice === voice) { stopPreview(); previewState = 'ready'; refresh(); return; }
    if (controller.owner !== previewOwner) savedSession = captureSession();
    previewVoice = voice; previewError = null;
    controller.start(previewOwner, [{ text: tx('sample') }], { ...profileFor(plugin), voice });
  };
  const picker = new SpeechChoices(selections.createDiv('qbr-tts-choices'), plugin, changed, { preview: audition });
  service.addEventListener('change', () => { config(plugin).provider = service.value; persist(plugin); changed(); picker.render(); });
  const previewFeedback = options.createDiv({ cls: 'qbr-tts-choice-feedback', attr: { role: 'status' } });
  const setup = options.createDiv('qbr-tts-setup');
  const setupMessage = setup.createDiv('qbr-tts-choice-feedback');
  const configure = () => { stopPreview(); closeChoices(); closeRates(); dismissIntro(); openTtsSettings(plugin); };
  button(setup, 'settings-2', tx('configureTest'), configure, true);
  const footer = options.createDiv('qbr-tts-popup-footer');
  button(footer, 'settings-2', tx('voiceSettings'), configure, true);
  const privacy = footer.createDiv('qbr-tts-choice-feedback');
  const intro = bar.createDiv('qbr-tts-intro');
  const introText = intro.createDiv('qbr-tts-intro-text');
  const introActions = intro.createDiv('qbr-tts-intro-actions');
  button(introActions, 'settings-2', tx('voiceSettings'), configure, true);
  button(introActions, 'check', tx('gotIt'), () => { dismissIntro(); play.focus(); }, true);
  const dismissIntro = () => { if (!config(plugin).introSeen) { config(plugin).introSeen = true; persist(plugin); } intro.hidden = true; };
  const errorBox = bar.createDiv('qbr-tts-error'); errorBox.hidden = true;
  const errorMessage = errorBox.createDiv({ attr: { role: 'alert' } });
  button(errorBox, 'rotate-ccw', tx('retry'), () => controller.retry(), true);
  button(errorBox, 'settings-2', tx('voiceSettings'), configure, true);
  const fallback = button(errorBox, 'volume-2', tx('fallback'), () => {
    config(plugin).provider = 'system'; persist(plugin);
    if (controller.owner?.view === view && controller.items.length) {
      const { owner, items, nextSection, index, rate } = controller;
      controller.start(owner, items, profileFor(plugin), { nextSection, index, rate });
    } else void startReading(view, view._ttsSelectedText);
  }, true);
  const refresh = () => {
    const own = controller.owner?.view === view, state = own ? controller.state : 'idle';
    const saved = !view._ttsSelectedText && savedSpeechProgress(config(plugin), view.file);
    const willResume = saved && speechStartMode(view, config(plugin)) === 'resume';
    const profile = ttsProfile(config(plugin)), rate = own ? controller.rate : config(plugin).rate || 1;
    status.setText(state === 'idle' ? tx(willResume ? 'saved' : 'play') : state === 'error' ? errorText(plugin, controller.error, profile.id) : tx(state));
    if (own && controller.waitingSection) status.setText(tx('browseEnd'));
    readAction.toggleClass('is-playing', own && state === 'playing');
    readAction.setAttribute('aria-pressed', String(own && state === 'playing'));
    const playing = ['playing', 'loading'].includes(state);
    play.replaceChildren(); setIcon(play, state === 'loading' ? 'loader-circle' : playing ? 'pause' : 'play');
    play.createSpan({ cls: 'qbr-tts-sr', text: tx(own && controller.waitingSection ? 'nextChapter' : playing ? 'pause' : state === 'paused' ? 'resume' : state === 'error' ? 'retry' : willResume ? 'saved' : 'play') });
    play.setAttribute('aria-busy', String(state === 'loading'));
    previous.disabled = !own || controller.index <= 0;
    next.disabled = !own || controller.index >= controller.items.length - 1;
    speed.replaceChildren(); speed.createSpan({ cls: 'qbr-tts-sr', text: `${tx('speed')} ` }); speed.createSpan({ text: `${rate}×` });
    for (const choice of rateChoices.children) choice.setAttribute('aria-pressed', String(Number(choice.dataset.rate) === Number(rate)));
    rateTitle.setText(`${tx('speed')} · ${rate}×`);
    speedHint.setText(profile.id === 'system' ? tx('speedNote') : ''); speedHint.hidden = profile.id !== 'system';
    service.value = profile.id;
    if (picker.provider !== profile.id) picker.render();
    privacy.setText(tx(speechDescription(profile.id)));
    const voices = picker.voices || voiceChoices(profile);
    const voiceName = voices.find(v => v.id === profile.voice)?.label || profile.voice || tx('systemVoice');
    voiceButton.replaceChildren(); setIcon(voiceButton, 'audio-lines');
    voiceButton.createSpan({ text: voiceName.split(' · ')[0], cls: 'qbr-tts-voice-name' });
    voiceButton.createSpan({ text: ` · ${tx('voice')}`, cls: 'qbr-tts-sr' });
    for (const row of options.querySelectorAll('.qbr-tts-voice-row')) {
      const auditioning = controller.owner === previewOwner && row.dataset.voice === previewVoice;
      const preview = row.querySelector('.qbr-tts-voice-preview');
      const name = voices.find(v => v.id === row.dataset.voice)?.label || row.dataset.voice;
      preview.replaceChildren(); setIcon(preview, auditioning ? 'square' : 'volume-2');
      preview.createSpan({ cls: 'qbr-tts-sr', text: `${tx(auditioning ? 'previewStop' : 'preview')} ${name}` });
    }
    previewFeedback.setText(previewError ? errorText(plugin, previewError, profile.id) : previewState === 'ready' || previewState === 'idle' ? '' : tx(previewState));
    const invalid = configurationError(plugin);
    setup.hidden = !invalid; if (invalid) setupMessage.setText(errorText(plugin, invalid, profile.id));
    intro.hidden = !!config(plugin).introSeen || !options.hidden || !rates.hidden;
    introText.setText(tx(profile.id === 'edge' ? 'welcome' : invalid?.code === 'systemUnavailable' ? 'welcomeUnavailable' : 'welcomeOther'));
    bar.toggleClass('qbr-tts-with-intro', !intro.hidden);
    errorBox.hidden = state !== 'error'; bar.toggleClass('qbr-tts-has-error', state === 'error');
    if (state === 'error') errorMessage.setText(errorText(plugin, controller.error, profile.id));
    fallback.hidden = profile.id === 'system' || !!configurationError(plugin, { id: 'system' });
    const browsing = own && controller.owner.follow === false;
    origins.hidden = !saved || (!browsing && !['idle', 'ended', 'paused', 'error'].includes(state));
    resumeSaved.hidden = own && ['paused', 'playing', 'loading'].includes(state);
    returnSpeech.hidden = !browsing;
    fromPage.hidden = false;
    bar.toggleClass('qbr-tts-has-context', !origins.hidden);
    if (!bar.hidden) fitPanels();
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
  picker.options.onRender = refresh;
  plugin.ttsListeners.add(listener); view._ttsRefresh = () => { picker.render(); refresh(); }; view._ttsRefreshPosition = refresh;
  view._ttsOnRelocate = detail => {
    const saved = savedSpeechProgress(config(plugin), view.file);
    if (detail?.reason !== 'anchor' && !view._ttsNavigating && controller.owner?.view === view && saved && !speechAnchorVisible(view, saved)) controller.owner.follow = false;
    refresh();
  };
  refresh();
  view._ttsStopPreview = () => stopPreview(false);
  view._ttsCleanup = () => {
    view._ttsRequest = (view._ttsRequest || 0) + 1;
    stopPreview(false); closeChoices(); closeRates(); resize.disconnect(); picker.destroy();
    doc.removeEventListener('pointerdown', onOutside);
    plugin.ttsListeners.delete(listener); if (controller.owner?.view === view) controller.stop(); clearHighlight(view); bar.remove(); view._ttsBar = null; view._ttsRefreshPosition = null; view._ttsOnRelocate = null;
  };
}

export function stopViewTts(view) {
  view._ttsStopPreview?.(); view._ttsCloseChoices?.(); view._ttsCloseRates?.();
  view._ttsRequest = (view._ttsRequest || 0) + 1;
  if (view.plugin.tts?.owner?.view === view) view.plugin.tts.stop();
  view._ttsSelectedText = null;
  if (view._ttsBar) view._ttsBar.hidden = true;
}
