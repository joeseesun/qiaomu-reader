import { SoundDialog } from './sound-dialog.js';
import { Notice, Platform, Scope, requestUrl, setIcon } from 'obsidian';
import { TtsController } from './tts-controller.js';
import { EdgeSpeechClient } from './tts-edge-client.js';
import { buildSpeechRequest, checkTtsSignal, synthesizeHttp, TTS_PROVIDERS, ttsError, ttsProfile } from './tts-providers.js';
import { rememberSpeechProgress, restorePdfSpeechPage, savedSpeechProgress, speechAnchorVisible, speechStartMode } from './tts-progress.js';
import { TTS_MODELS, canLoadVoiceCatalog, changeSpeechModel, loadVoiceCatalog, voiceChoices } from './tts-choices.js';
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
  more: ['更多朗读操作', 'More speech actions'], position: ['朗读位置', 'Speech position'], progress: ['本节朗读进度', 'Section reading progress'],
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
  plugin.register(() => { plugin._soundDialog?.close(); plugin.tts.dispose(); listeners.clear(); });
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

export function openTtsSettings(plugin) {
  plugin._soundDialog?.close();
  const controller = ensureTts(plugin), tx = key => ttsText(plugin, key), chinese = plugin.settings.language === 'zh';
  let saved = null, previewOwner = null;
  const profile = id => ({ ...ttsProfile(config(plugin), id), key: plugin.app.secretStorage?.getSecret(`qiaomu-reader-tts-${id}`) || '' });
  const stop = owner => {
    if (previewOwner !== owner) return;
    const canRestore = controller.owner === owner || !controller.owner;
    controller.stop(owner); previewOwner = null;
    if (canRestore && saved) restoreSpeech(controller, saved, plugin);
    saved = null;
  };
  const dialog = new SoundDialog(plugin.app, {
    initialProvider: !config(plugin).introSeen && Platform.isDesktopApp && Platform.isMacOS ? 'macos' : undefined,
    chinese, current: () => profileFor(plugin), profile,
    providers: selected => Object.entries(TTS_PROVIDERS).filter(([id]) => !hideSpeechProvider(id, selected)).map(([id, p]) => ({ id, label: ['system','macos','localModel','doubao','siliconflow'].includes(id) ? tx(id) : p.label })),
    models: p => p.id === 'localModel' ? LOCAL_MODELS : TTS_MODELS[p.id] || [],
    changeModel: (p, value, catalog) => p.id === 'localModel' ? { ...p, ...normalizeLocalProfile({ ...p, model: value, voice: '' }) } : changeSpeechModel(p, value, catalog || {}),
    voices: (p, catalog) => catalog?.voices || (p.id === 'system' ? [{ id: '', label: tx('systemVoice') }, ...(window.speechSynthesis?.getVoices?.() || []).map(v => ({ id: v.voiceURI, label: `${v.name} · ${v.lang}` }))] : p.id === 'macos' ? [{ id: '', label: tx('systemVoice') }] : p.id === 'localModel' ? localVoiceChoices(p.model, chinese) : voiceChoices(p)),
    canLoad: p => p.id === 'macos' || canLoadVoiceCatalog(p.id),
    load: async (p, signal) => {
      if (p.id === 'macos') { const { macSpeechVoices } = await import('./tts-macos.js'); return { voices: macVoiceChoices(await macSpeechVoices(signal), tx, chinese) }; }
      return loadVoiceCatalog(p, { request: requestUrl, key: p.key, signal });
    },
    validate: p => configurationError(plugin, p), error: (error, id) => errorText(plugin, error, id), links: speechServiceLinks,
    subscribe: listener => { plugin.ttsListeners.add(listener); return () => plugin.ttsListeners.delete(listener); },
    preview: (owner, text, p) => {
      if (!previewOwner) saved = captureSpeech(controller);
      previewOwner = owner; controller.start(owner, [{ text }], p);
    }, stop,
    setup: (el, p, onReady) => new LocalSpeechPanel(el, { manager: ensureLocalTts(plugin), model: p.model, tx, errorText: e => errorText(plugin, e, 'localModel'), onReady, onState: onReady }),
    apply: async p => {
      const previous = structuredClone(config(plugin)), oldKey = profile(p.id).key;
      const { id, key, label: _label, ...values } = p;
      try {
        if (key !== oldKey) plugin.app.secretStorage.setSecret(`qiaomu-reader-tts-${id}`, key);
        config(plugin).profiles[id] = values; config(plugin).provider = id; config(plugin).introSeen = true;
        await plugin._saveLocalData();
        const session = captureSpeech(controller); if (session) restoreSpeech(controller, session, plugin);
      } catch (error) { plugin.settings.tts = previous; if (key !== oldKey) plugin.app.secretStorage.setSecret(`qiaomu-reader-tts-${id}`, oldKey); throw error; }
    },
    confirm: async () => { config(plugin).introSeen = true; await plugin._saveLocalData(); },
    closed: () => { if (plugin._soundDialog === dialog) plugin._soundDialog = null; for (const listener of plugin.ttsListeners) listener(controller); },
  });
  plugin._soundDialog = dialog; dialog.open(); return dialog;
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
  view._ttsFinishClosing?.(); view._ttsBar.hidden = false; view._ttsBar.inert = false;
  view._ttsBar.parentElement.classList.add('is-open'); view.contentEl.classList.remove('qiaomu-reader-immersive'); view._armImmersive?.(); view._ttsRefresh?.();
}
export function attachTts(view, tray) {
  view._ttsCleanup?.();
  const plugin = view.plugin, c = ensureTts(plugin), tx = key => ttsText(plugin, key);
  const slot = tray.createDiv('qbr-tts-slot'), doc = tray.ownerDocument, win = doc.defaultView;
  const read = button(slot, 'play', tx('read'), () => {
    openTts(view);
    if (!config(plugin).introSeen) { openTtsSettings(plugin); return; }
    play.click();
  }); read.classList.add('qbr-tts-read-action');
  const idleMore = button(slot, 'ellipsis', tx('more'), () => { openTts(view); showPanel(menu); }); idleMore.classList.add('qbr-tts-idle-more');
  const bar = view._ttsBar = slot.createDiv('qbr-tts-player qbr-tts-inline'); bar.hidden = true;
  const status = bar.createDiv({ cls: 'qbr-tts-sr', attr: { role: 'status' } });
  const controls = bar.createDiv('qbr-tts-controls');
  const play = button(controls, 'play', tx('play'), () => {
    plugin._soundDialog?.close();
    if (c.owner?.view === view && ['playing', 'paused', 'loading', 'error'].includes(c.state)) c.toggle();
    else void startReading(view, view._ttsSelectedText);
  }); play.classList.add('qbr-tts-play');
  const speed = button(controls, 'gauge', tx('speed'), () => showPanel(rates), true); speed.classList.add('qbr-tts-speed');
  const more = button(controls, 'ellipsis', tx('more'), () => menu.hidden ? showPanel(menu) : closePanels()); more.classList.add('qbr-tts-more');
  const close = button(controls, 'x', tx('finish'), () => stopViewTts(view, true)); close.classList.add('qbr-tts-close');
  const menu = bar.createDiv('qbr-tts-menu'), position = bar.createDiv('qbr-tts-position'), rates = bar.createDiv('qbr-tts-rates');
  const panels = [menu, position, rates]; panels.forEach(p => { p.hidden = true; });
  let scope, closingTimer, frame;
  const closePanels = () => { panels.forEach(p => { p.hidden = true; }); more.setAttribute('aria-expanded', 'false'); if (scope) { plugin.app.keymap.popScope(scope); scope = null; } };
  const fit = () => {
    const root = view.contentEl.getBoundingClientRect(); slot.classList.toggle('is-narrow', root.width <= 650); menuSpeed.hidden = root.width > 650;
    if (bar.hidden) return;
    const anchor = slot.getBoundingClientRect(), width = Math.max(160, Math.min(360, root.width - 32));
    bar.style.setProperty('--qbr-tts-panel-height', `${Math.max(100, root.bottom - anchor.bottom - 16)}px`);
    bar.style.setProperty('--qbr-tts-panel-width', `${width}px`);
    bar.style.setProperty('--qbr-tts-panel-shift', `${Math.max(0, width - (anchor.right - root.left - 16))}px`);
  };
  const showPanel = panel => {
    closePanels(); panel.hidden = false; more.setAttribute('aria-expanded', 'true'); fit();
    scope = new Scope(); scope.register([], 'Escape', () => { closePanels(); more.focus(); return false; }); plugin.app.keymap.pushScope(scope);
    panel.querySelector('button:not([hidden]):not(:disabled)')?.focus();
  };
  const sound = () => { closePanels(); openTtsSettings(plugin); };
  const menuSpeed = button(menu, 'gauge', tx('speed'), () => showPanel(rates), true);
  button(menu, 'audio-lines', tx('voiceSettings'), sound, true);
  button(menu, 'locate', tx('position'), () => showPanel(position), true);
  button(menu, 'square', tx('finish'), () => stopViewTts(view, true), true);
  const transport = position.createDiv('qbr-tts-position-transport');
  const previous = button(transport, 'skip-back', tx('previous'), () => c.skip(-1), true), next = button(transport, 'skip-forward', tx('next'), () => c.skip(1), true);
  const saved = button(position, 'history', tx('saved'), () => { closePanels(); view._ttsSelectedText = null; void startReading(view, null, true); }, true);
  button(position, 'text-cursor-input', tx('fromPage'), () => { closePanels(); view._ttsSelectedText = null; void startReading(view, null, false); }, true);
  const returnSpeech = button(position, 'locate', tx('returnSpeech'), async () => {
    const progress = savedSpeechProgress(config(plugin), view.file); if (!progress) return;
    try { if (progress.cfi && view.engine) await navigateSpeech(view, progress.cfi); else navigatePdfSpeech(view, progress.page); if (c.owner?.view === view) c.owner.follow = true; closePanels(); refresh(); }
    catch (error) { new Notice(errorText(plugin, error, config(plugin).provider)); }
  }, true);
  const rateChoices = rates.createDiv('qbr-tts-rate-choices');
  for (const rate of [0.5, .75, 1, 1.25, 1.5, 1.75, 2]) {
    const b = button(rateChoices, 'check', `${rate}×`, () => { config(plugin).rate = rate; if (c.owner?.view === view) c.setRate(rate); persist(plugin); closePanels(); refresh(); more.focus(); }, true); b.dataset.rate = String(rate);
  }
  const errorBox = bar.createDiv('qbr-tts-error'), errorMessage = errorBox.createDiv({ attr: { role: 'alert' } }); errorBox.hidden = true;
  button(errorBox, 'rotate-ccw', tx('retry'), () => c.retry(), true); button(errorBox, 'settings-2', tx('voiceSettings'), sound, true);
  const progress = bar.createDiv({ cls: 'qbr-tts-sr', attr: { role: 'progressbar', 'aria-label': tx('progress'), 'aria-valuemin': '0', 'aria-valuemax': '100' } });
  const refresh = () => {
    const own = c.owner?.view === view, state = own ? c.state : 'idle', busy = ['playing', 'loading'].includes(state);
    const icon = state === 'loading' ? 'loader-circle' : busy ? 'pause' : state === 'ended' ? 'rotate-ccw' : 'play';
    if (play.dataset.icon !== icon) {
      play.replaceChildren(); setIcon(play, icon); play.dataset.icon = icon;
      if (!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) play.querySelector('svg')?.animate?.([{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 150 });
    }
    let label = play.querySelector('.qbr-tts-sr'); if (!label) label = play.createSpan({ cls: 'qbr-tts-sr' });
    label.setText(tx(own && c.waitingSection ? 'nextChapter' : busy ? 'pause' : state === 'paused' ? 'resume' : state === 'error' ? 'retry' : 'play'));
    play.setAttribute('aria-busy', String(state === 'loading')); status.setText(state === 'idle' ? tx('play') : tx(state));
    if (own) { const fraction = state === 'ended' ? 1 : c.index / Math.max(1, c.items.length); play.style.setProperty('--qbr-tts-progress', String(fraction)); progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100))); }
    previous.disabled = !own || c.index <= 0; next.disabled = !own || c.index >= c.items.length - 1;
    const rate = own ? c.rate : config(plugin).rate || 1; speed.replaceChildren(); speed.createSpan({ cls: 'qbr-tts-sr', text: tx('speed') }); speed.createSpan({ text: `${rate}×` });
    menuSpeed.setAttribute('aria-label', `${tx('speed')} ${rate}×`);
    for (const b of rateChoices.children) b.setAttribute('aria-pressed', String(Number(b.dataset.rate) === rate));
    saved.hidden = !savedSpeechProgress(config(plugin), view.file); returnSpeech.hidden = !own || c.owner.follow !== false;
    errorBox.hidden = state !== 'error'; if (!errorBox.hidden) errorMessage.setText(errorText(plugin, c.error, config(plugin).provider)); fit();
  };
  const outside = event => { if (!bar.contains(event.target)) closePanels(); };
  doc.addEventListener('pointerdown', outside);
  bar.addEventListener('keydown', e => { if (e.key === 'Escape' && panels.some(p => !p.hidden)) { e.preventDefault(); e.stopPropagation(); closePanels(); more.focus(); } });
  const observer = new win.ResizeObserver(() => { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(fit); }); observer.observe(view.contentEl);
  view._ttsFinishClosing = () => { win.clearTimeout(closingTimer); slot.classList.remove('is-closing', 'is-open'); };
  view._ttsCollapse = animate => {
    view._ttsFinishClosing(); bar.inert = true;
    if (animate && !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { slot.classList.add('is-closing'); closingTimer = win.setTimeout(() => { view._ttsFinishClosing(); read.focus(); }, 340); } else read.focus();
  };
  view._ttsClosePanels = closePanels; view._ttsRefresh = refresh; view._ttsRefreshPosition = refresh;
  view._ttsOnRelocate = detail => { const saved = savedSpeechProgress(config(plugin), view.file); if (detail?.reason !== 'anchor' && !view._ttsNavigating && c.owner?.view === view && saved && !speechAnchorVisible(view, saved)) c.owner.follow = false; refresh(); };
  plugin.ttsListeners.add(refresh); refresh();
  view._ttsCleanup = () => {
    view._ttsRequest = (view._ttsRequest || 0) + 1; plugin._soundDialog?.close(); closePanels(); view._ttsFinishClosing();
    observer.disconnect(); win.cancelAnimationFrame(frame); doc.removeEventListener('pointerdown', outside); plugin.ttsListeners.delete(refresh);
    if (c.owner?.view === view) c.stop(); clearHighlight(view); slot.remove(); view._ttsBar = null; view._ttsRefreshPosition = null; view._ttsOnRelocate = null;
  };
}
export function stopViewTts(view, animate = false) {
  view.plugin._soundDialog?.close(); view._ttsClosePanels?.(); view._ttsRequest = (view._ttsRequest || 0) + 1;
  if (view.plugin.tts?.owner?.view === view) view.plugin.tts.stop(); view._ttsSelectedText = null;
  if (view._ttsBar) view._ttsBar.hidden = true; view._ttsCollapse?.(animate);
}
