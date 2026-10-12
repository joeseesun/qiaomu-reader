import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildSpeechRequest, synthesizeHttp, ttsProfile, SpeechCache, awaitSpeechRequest } from '../src/tts-providers.js';
import { splitSpeechText, speechDocumentChunks } from '../src/tts-text.js';
import { TtsController } from '../src/tts-controller.js';
import { synthesizeEdge } from '../src/tts-edge.js';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

globalThis.window = globalThis;
const tick = () => new Promise(resolve => setImmediate(resolve));
test('provider requests use distinct protocols and escape SSML', () => {
  const text = 'a < b & c';
  const openai = buildSpeechRequest(ttsProfile({}, 'openai'), text, 'test-key');
  assert.equal(openai.url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(JSON.parse(openai.body).response_format, 'mp3');
  const qwen = buildSpeechRequest(ttsProfile({}, 'qwen'), text, 'test-key');
  assert.equal(JSON.parse(qwen.body).input.text, text);
  const azure = buildSpeechRequest({ ...ttsProfile({}, 'azure'), region: 'eastasia' }, text, 'test-key');
  assert.match(azure.body, /a &lt; b &amp; c/);
  assert.equal(azure.headers.Authorization, undefined);
  assert.equal(azure.headers['Ocp-Apim-Subscription-Key'], 'test-key');
});
test('custom local server can omit key; invalid remote URLs fail before request', () => {
  const profile = { id: 'compatible', baseUrl: 'http://localhost:8880/v1/audio/speech', model: 'kokoro', voice: 'af_heart' };
  assert.equal(buildSpeechRequest(profile, 'Hello').url, profile.baseUrl);
  assert.throws(() => buildSpeechRequest({ ...profile, baseUrl: 'http://example.com' }, 'Hello'), { code: 'https' });
  assert.throws(() => buildSpeechRequest(ttsProfile({}, 'qwen'), 'Hello'), { code: 'key' });
});
test('Qwen audio download never receives API credentials', async () => {
  const calls = [];
  const result = await synthesizeHttp(ttsProfile({}, 'qwen'), 'Hello', { key: 'test-key', request: async req => {
    calls.push(req);
    return calls.length === 1 ? { status: 200, json: { output: { audio: { url: 'http://example.oss-cn-beijing.aliyuncs.com/audio?signature=test' } } } }
      : { status: 200, arrayBuffer: new Uint8Array([1, 2]).buffer, headers: { 'content-type': 'audio/wav' } };
  } });
  assert.equal(calls[1].headers, undefined); assert.match(calls[1].url, /^https:/);
  assert.equal(result.bytes.length, 2);
});
test('JSON errors, empty audio and 403 never become playable bytes', async () => {
  for (const [response, code] of [[{ status: 403 }, 'http'], [{ status: 200, arrayBuffer: new ArrayBuffer(0) }, 'empty'], [{ status: 200, arrayBuffer: new Uint8Array([1]).buffer, headers: { 'content-type': 'application/json' } }, 'response']]) {
    await assert.rejects(synthesizeHttp(ttsProfile({}, 'openai'), 'x', { key: 'key', request: async () => response }), { code });
  }
});
test('host request cancellation resolves promptly and discards late results', async () => {
  const abort = new AbortController(); let finish;
  const pending = awaitSpeechRequest(new Promise(resolve => { finish = resolve; }), abort.signal);
  abort.abort(); await assert.rejects(pending, { name: 'AbortError' }); finish('late');
});
test('bounded cache evicts oldest audio, touching an item retains it', () => {
  const cache = new SpeechCache(4), audio = { bytes: new Uint8Array(2) };
  cache.set('a', audio); cache.set('b', audio); cache.get('a'); cache.set('c', audio);
  assert.equal(cache.get('b'), undefined); assert.equal(cache.bytes, 4);
  cache.clear(); assert.equal(cache.bytes, 0);
});
test('long Chinese/mixed text chunks preserve all original offsets and surrogate pairs', () => {
  const text = '甲'.repeat(239) + '😀' + '乙。Hello world! 下一句。';
  const parts = splitSpeechText(text);
  assert.ok(parts.every(x => x.end - x.start <= 240));
  assert.equal(parts.map(x => text.slice(x.start, x.end)).join(''), text);
  assert.ok(parts.every(x => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(x.text)));
});
test('DOM speech skips navigation/ruby annotations and starts inside current text', () => {
  const doc = new JSDOM('<body><nav>目录</nav><p>第一句。<em>第二句。</em>第三句。</p><p>汉<ruby>字<rt>zi</rt></ruby></p></body>').window.document;
  const from = doc.createRange(); from.setStart(doc.querySelector('em').firstChild, 0); from.collapse(true);
  const chunks = speechDocumentChunks(doc, from);
  assert.equal(chunks[0].text, '第二句。');
  assert.ok(!chunks.map(x => x.text).join('').includes('zi'));
  for (const chunk of chunks) assert.equal(chunk.range.toString().replace(/\s+/g, ' ').trim(), chunk.text);
});
function harness(synthesize) {
  const audios = [], states = [];
  const c = new TtsController({ synthesize, makeAudio: () => {
    const audio = { plays: 0, play: async () => { audio.plays++; }, pause() {}, load() {}, removeAttribute() {} };
    audios.push(audio); return audio;
  }, onChange: c => states.push(c.state) });
  return { c, audios, states };
}
const audio = () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'audio/mpeg' });
test('switching books cannot play an older late synthesis result', async () => {
  let resolveOld;
  const { c, audios } = harness(async (_p, text) => text === 'old' ? new Promise(r => { resolveOld = r; }) : audio());
  c.start({}, [{ text: 'old' }], { id: 'openai' });
  c.start({}, [{ text: 'new' }], { id: 'openai' }); await tick();
  resolveOld(audio()); await tick();
  assert.equal(audios.length, 1); assert.equal(c.items[0].text, 'new'); c.dispose();
});
test('pausing during synthesis does not auto-play when bytes arrive', async () => {
  let finish;
  const { c, audios } = harness(() => new Promise(r => { finish = r; }));
  c.start({}, [{ text: 'hello' }], { id: 'openai' }); c.toggle(); finish(audio()); await tick();
  assert.equal(c.state, 'paused'); assert.equal(audios[0].plays, 0);
  c.toggle(); assert.equal(audios[0].plays, 1); c.dispose();
});
test('prefetch is bounded and a speed change does not regenerate audio', async () => {
  const calls = []; const { c, audios } = harness(async (_p, text) => { calls.push(text); return audio(); });
  c.start({}, ['one', 'two', 'three', 'four'].map(text => ({ text })), { id: 'openai' }); await tick();
  assert.deepEqual(calls, ['one', 'two']); c.setRate(1.5); assert.equal(audios[0].playbackRate, 1.5);
  audios[0].onended(); await tick(); assert.deepEqual(calls, ['one', 'two', 'three']); c.dispose();
});
test('failure keeps current segment and does not silently switch provider or skip', async () => {
  const { c } = harness(async () => { throw Object.assign(new Error('http'), { code: 'http', status: 403 }); });
  c.start({}, [{ text: 'one' }, { text: 'two' }], { id: 'edge' }); await tick();
  assert.equal(c.state, 'error'); assert.equal(c.index, 0); assert.equal(c.profile.id, 'edge'); c.dispose();
});
test('closing session during chapter navigation prevents late playback', async () => {
  let finish;
  const { c, audios } = harness(async () => audio());
  c.start({}, [{ text: 'chapter one' }], { id: 'openai' }, { nextSection: () => new Promise(r => { finish = r; }) });
  await tick(); audios[0].onended(); c.stop(); finish([{ text: 'chapter two' }]); await tick();
  assert.equal(c.state, 'idle'); assert.equal(audios.length, 1); c.dispose();
});

test('Doubao, MiniMax, ElevenLabs and SiliconFlow use their documented credentials and payloads', () => {
  const doubao = buildSpeechRequest(ttsProfile({}, 'doubao'), '正文', 'test');
  assert.equal(doubao.headers['X-Api-Key'], 'test'); assert.equal(doubao.headers.Authorization, undefined);
  assert.equal(doubao.headers['X-Api-Resource-Id'], 'seed-tts-2.0');
  assert.equal(JSON.parse(doubao.body).req_params.audio_params.format, 'mp3');
  const minimax = buildSpeechRequest(ttsProfile({}, 'minimax'), '正文', 'test');
  assert.equal(minimax.url, 'https://api.minimax.cn/v1/t2a_v2');
  assert.equal(JSON.parse(minimax.body).output_format, 'hex'); assert.equal(JSON.parse(minimax.body).stream, false);
  const eleven = buildSpeechRequest(ttsProfile({}, 'elevenlabs'), 'text', 'test');
  assert.equal(eleven.headers['xi-api-key'], 'test'); assert.equal(eleven.headers.Authorization, undefined);
  assert.equal(JSON.parse(eleven.body).model_id, 'eleven_multilingual_v2');
  const silicon = buildSpeechRequest(ttsProfile({}, 'siliconflow'), '正文', 'test');
  assert.equal(silicon.url, 'https://api.siliconflow.cn/v1/audio/speech');
  assert.equal(JSON.parse(silicon.body).voice, 'FunAudioLLM/CosyVoice2-0.5B:alex');
});
test('MiniMax decodes hex, rejects provider failures, invalid hex and empty responses', async () => {
  const call = json => synthesizeHttp(ttsProfile({}, 'minimax'), 'x', { key: 'test', request: async () => ({ status: 200, json }) });
  assert.deepEqual([...(await call({ base_resp: { status_code: 0 }, data: { audio: '494433ff' } })).bytes], [73,68,51,255]);
  await assert.rejects(call({ base_resp: { status_code: 1008 } }), { code: 'service', status: 1008 });
  await assert.rejects(call({ base_resp: { status_code: 0 }, data: { audio: '12zz' } }), { code: 'response' });
  await assert.rejects(call({ base_resp: { status_code: 0 }, data: { audio: '' } }), { code: 'empty' });
});
test('Doubao joins NDJSON chunks and rejects mid-response service errors or truncation', async () => {
  const call = text => synthesizeHttp(ttsProfile({}, 'doubao'), 'x', { key: 'test', request: async () => ({ status: 200, text }) });
  const text = '{"code":0,"data":"SUQz"}\n{"code":0,"data":"/w=="}\n{"code":20000000}\n';
  assert.deepEqual([...(await call(text)).bytes], [73,68,51,255]);
  await assert.rejects(call('{"code":0,"data":"SUQz"}\n{"code":45000000}'), { code: 'service', status: 45000000 });
  await assert.rejects(call('{"code":0,"data":"SUQz"}\n{"code":'), { code: 'response' });
  await assert.rejects(call('{"code":0}'), { code: 'empty' });
});
test('ruby pronunciation remains excluded when a range spans following text', () => {
  const doc = new JSDOM('<body><p>汉<ruby>字<rt>zi</rt></ruby>继续读。</p></body>').window.document;
  assert.equal(speechDocumentChunks(doc)[0].text, '汉字继续读。');
});
test('Edge assembles binary audio and propagates 403 without retrying forever', async () => {
  class Socket extends EventEmitter {
    constructor(url) { super(); this.url = url; Socket.latest = this; setImmediate(() => this.emit('open')); }
    send() {} terminate() { this.terminated = true; }
  }
  const pending = synthesizeEdge('test', 'zh-CN-XiaoxiaoNeural', { Socket });
  for (let i=0; !Socket.latest && i<30; i++) await tick();
  const url = new URL(Socket.latest.url);
  assert.equal(url.hostname, 'api.msedgeservices.com');
  assert.equal(url.searchParams.has('Ocp-Apim-Subscription-Key'), true);
  assert.equal(url.searchParams.has('TrustedClientToken'), false);
  const header = Buffer.from('Path:audio\r\nContent-Type:audio/mpeg\r\n');
  const frame = Buffer.alloc(2 + header.length + 3); frame.writeUInt16BE(header.length); header.copy(frame,2); frame.set([1,2,3], 2+header.length);
  Socket.latest.emit('message',frame,true); Socket.latest.emit('message',Buffer.from('Path:turn.end\r\n'),false);
  assert.deepEqual([...(await pending).bytes],[1,2,3]); assert.equal(Socket.latest.terminated,true);
  Socket.latest = null;
  const failure = synthesizeEdge('test','voice',{Socket});
  const rejected = assert.rejects(failure,{code:'http',status:403});
  for (let i=0; !Socket.latest && i<30; i++) await tick();
  Socket.latest.emit('unexpected-response',{}, { statusCode:403, resume() {} }); await rejected;
});
test('TTS copy has complete Chinese/English pairs and matching placeholders', () => {
  const source = readFileSync(new URL('../src/tts-ui.js', import.meta.url),'utf8');
  const literal = source.slice(source.indexOf('export const TTS_COPY = ') + 'export const TTS_COPY = '.length, source.indexOf('\nexport function ttsText'));
  const copy = vm.runInNewContext(`(${literal.trim().replace(/;$/, '')})`);
  for(const [key,pair] of Object.entries(copy)) {
    assert.equal(pair.length,2,key); assert.ok(pair.every(x=>typeof x==='string'&&x.length),key);
    assert.equal(JSON.stringify(pair[0].match(/\{\d+\}/g)),JSON.stringify(pair[1].match(/\{\d+\}/g)),key);
  }
});

test('model switching updates scoped voices and never guesses for unknown models', async () => {
  const { changeSpeechModel, voiceChoices } = await import('../src/tts-choices.js');
  const sf = { ...ttsProfile({}, 'siliconflow'), voice: 'FunAudioLLM/CosyVoice2-0.5B:claire' };
  const moss = changeSpeechModel(sf, 'fnlp/MOSS-TTSD-v0.5');
  assert.equal(moss.voice, 'fnlp/MOSS-TTSD-v0.5:claire');
  assert.equal(JSON.parse(buildSpeechRequest(moss, 'test', 'key').body).voice, moss.voice);
  const db = changeSpeechModel(ttsProfile({}, 'doubao'), 'seed-tts-1.0');
  assert.equal(db.resourceId, 'seed-tts-1.0'); assert.match(db.voice, /moon_bigtts$/);
  const req = buildSpeechRequest(db, 'test', 'key');
  assert.equal(req.headers['X-Api-Resource-Id'], 'seed-tts-1.0');
  assert.equal(JSON.parse(req.body).req_params.speaker, db.voice);
  assert.equal(changeSpeechModel(sf, 'future-model').voice, '');
  assert.equal(changeSpeechModel(ttsProfile({}, 'openai'), 'tts-1').voice, 'alloy');
  assert.ok(!voiceChoices({ id: 'openai', model: 'tts-1' }).some(v => v.id === 'coral'));
  assert.deepEqual(voiceChoices({ id: 'siliconflow', model: 'custom' }, { voices: [{ id: 'a', model: 'other' }, { id: 'b', model: 'custom' }] }).map(v => v.id), ['b']);
});
test('account catalog adapters validate auth, model applicability and pagination', async () => {
  const { loadVoiceCatalog } = await import('../src/tts-choices.js');
  let requests = [];
  const catalog = await loadVoiceCatalog(ttsProfile({}, 'elevenlabs'), { key: 'private-key', request: async r => {
    requests.push(r);
    return { status: 200, json: requests.length === 1 ? [{ model_id: 'tts', name: 'TTS', can_do_text_to_speech: true }, { model_id: 'stt', can_do_text_to_speech: false }]
      : { voices: [{ voice_id: 'v' + requests.length, name: 'Voice' }], has_more: requests.length === 2, next_page_token: 'a&b' } };
  } });
  assert.equal(catalog.models.length, 1); assert.equal(catalog.voices.length, 2);
  assert.equal(requests[2].url, 'https://api.elevenlabs.io/v2/voices?page_size=100&next_page_token=a%26b');
  assert.equal(requests[0].headers['xi-api-key'], 'private-key'); assert.equal(requests[0].headers.Authorization, undefined);
  await assert.rejects(loadVoiceCatalog(ttsProfile({}, 'minimax'), { key: 'k', request: async () => ({ status: 200, json: { base_resp: { status_code: 1004 } } }) }), { code: 'service' });
  const sf = await loadVoiceCatalog(ttsProfile({}, 'siliconflow'), { key: 'k', request: async r => ({ status: 200, json: r.url.includes('/models?') ? { data: [{ id: 'new-tts' }, { id: 'whisper' }] } : { results: [{ uri: 'speech:custom', customName: 'My voice', model: 'specific-model' }] } }) });
  assert.equal(sf.voices[0].model, 'specific-model'); assert.deepEqual(sf.models.map(m => m.id), ['new-tts']);
});
test('paused session restoration retains segment and rate without synthesis or autoplay', async () => {
  let synthesized = 0, played = 0;
  const controller = new TtsController({ synthesize: async () => { synthesized++; return { bytes: new Uint8Array([1]), mime: 'audio/mpeg' }; },
    makeAudio: () => ({ play: async () => { played++; }, pause() {}, removeAttribute() {}, load() {} }) });
  const owner = {}, items = [{ text: 'first' }, { text: 'second' }];
  controller.start(owner, items, ttsProfile({}, 'openai'), { index: 1, rate: 1.5, paused: true });
  await tick(); assert.equal(synthesized, 0); assert.equal(played, 0);
  assert.equal(controller.index, 1); assert.equal(controller.rate, 1.5); assert.equal(controller.state, 'paused');
  controller.toggle(); await tick(); assert.equal(synthesized, 1); assert.equal(played, 1); controller.dispose();
});

test('primary playback restores exact saved sentence, while explicit from-page and changed files start here', async () => {
  const { rememberSpeechProgress, savedSpeechProgress, restorePdfSpeechPage, speechStartMode } = await import('../src/tts-progress.js');
  const doc = new JSDOM('<body><p>第一页第一句。第一页第二句。第一页第三句。</p></body>').window.document;
  const textNode = doc.querySelector('p').firstChild;
  const pageRange = doc.createRange(); pageRange.selectNodeContents(doc.querySelector('p'));
  const exact = doc.createRange(); exact.setStart(textNode, 7); exact.setEnd(textNode, 14);
  const navigated = [], notices = [], starts = [];
  const controller = { generation: 0, stop() { this.generation++; }, start(...args) { starts.push(args); } };
  const file = { path: 'Book.epub', stat: { mtime: 123 } };
  const settings = { progress: { [file.path]: { cfi: 'epubcfi(saved)', mtime: 123 } } };
  const view = { file, plugin: { settings }, contentEl: doc.body, engine: {
    goTo: async target => { navigated.push(target); }, rangeFromCfi: () => exact,
    contents: () => [{ doc, index: 2 }], currentLocation: () => ({ range: pageRange }),
    cfiFromRange: () => 'epubcfi(saved)', nextReadingSection: () => null,
  } };
  const source = readFileSync(new URL('../src/tts-ui.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('async function navigateSpeech('), source.indexOf('export function openTts(view'));
  const context = { config: () => settings, ensureTts: () => controller, savedSpeechProgress, rememberSpeechProgress, restorePdfSpeechPage, speechStartMode,
    speechDocumentChunks, splitSpeechText, profileFor: () => ({ id: 'system' }), checkTtsSignal: () => {}, highlight() {}, clearHighlight() {}, persist() {},
    Notice: class { constructor(message) { notices.push(message); } }, ttsText: (_, key) => key, errorText: (_, e) => e.code, ttsError: code => ({ code }), view };
  vm.createContext(context); vm.runInContext(code + ';this.startReading = startReading;', context);
  await context.startReading(view);
  assert.deepEqual(navigated, ['epubcfi(saved)']); assert.equal(starts.at(-1)[1][0].text, '第一页第二句。');
  await context.startReading(view, null, false);
  assert.equal(starts.at(-1)[1][0].text, '第一页第一句。');
  file.stat.mtime = 456; await context.startReading(view);
  assert.equal(starts.at(-1)[1][0].text, '第一页第一句。');
  file.stat.mtime = 123; view.engine.rangeFromCfi = () => null;
  const before = starts.length; await context.startReading(view, null, true);
  assert.equal(starts.length, before); assert.equal(notices.at(-1), 'resume');
  // PDF resumes its saved page and segment, independent of the visible page.
  view.engine = null; view.file = { path: 'Book.pdf', stat: { mtime: 123 } };
  doc.body.innerHTML = '<div class="qiaomu-reader-pdf-page-break" data-pdf-page-no="3"></div>';
  view.pager = { flow: doc.body, currentPdfPageNumber: () => 1, sw: 500, cols: 1, jumpTo() {} };
  view._pdfLazy = { textFor: page => page === 3 ? '第一句。第二句。第三句。' : '错误页。' };
  rememberSpeechProgress(settings, view.file, { page: 3, offset: 4 });
  await context.startReading(view, null, true);
  assert.equal(starts.at(-1)[1][0].text, '第二句。'); assert.equal(starts.at(-1)[1][0].page, 3);
  starts.at(-1)[0].onSegment(starts.at(-1)[1][1]);
  assert.equal(settings.progress['Book.pdf'].offset, 8);
});
test('speech bookmarks retain recently reused books within the bounded persistent history', async () => {
  const { rememberSpeechProgress, savedSpeechProgress } = await import('../src/tts-progress.js');
  const settings = {};
  for (let i=0;i<100;i++) rememberSpeechProgress(settings, {path:String(i),stat:{mtime:1}}, {cfi:'epubcfi(saved)'});
  rememberSpeechProgress(settings, {path:'0',stat:{mtime:1}}, {cfi:'epubcfi(new)'});
  rememberSpeechProgress(settings, {path:'book101',stat:{mtime:1}}, {page:2,offset:4});
  assert.equal(Object.keys(settings.progress).length,100);
  assert.ok(savedSpeechProgress(JSON.parse(JSON.stringify(settings)),{path:'book101',stat:{mtime:1}}));
  assert.equal(savedSpeechProgress(settings,{path:'book101',stat:{mtime:2}}),null);
});

test('start intent distinguishes a saved sentence on this page from a user-navigated page', async () => {
  const { speechStartMode } = await import('../src/tts-progress.js');
  const doc = new JSDOM('<p>甲。乙。丙。丁。</p>').window.document, node = doc.querySelector('p').firstChild;
  const spoken=doc.createRange();spoken.setStart(node,2);spoken.setEnd(node,4);
  const visible=doc.createRange();visible.setStart(node,0);visible.setEnd(node,4);
  const file={path:'book',stat:{mtime:1}},settings={progress:{book:{cfi:'epubcfi(saved)',mtime:1}}};
  const view={file,engine:{rangeFromCfi:()=>spoken,currentLocation:()=>({range:visible})}};
  assert.equal(speechStartMode(view,settings),'resume');
  visible.setStart(node,4);visible.setEnd(node,8);assert.equal(speechStartMode(view,settings),'page');
  view.engine.rangeFromCfi=()=>null;assert.equal(speechStartMode(view,settings),'page');
  view.engine=null;view.pager={currentPdfPageNumber:()=>4};settings.progress.book={page:3,offset:2,mtime:1};
  assert.equal(speechStartMode(view,settings),'page');view.pager.currentPdfPageNumber=()=>3;assert.equal(speechStartMode(view,settings),'resume');
});
test('browsing away never navigates to the next chapter until Continue is explicit', async () => {
  let navigations=0;
  const controller=new TtsController({speech:{getVoices:()=>[],speak(){},cancel(){}},makeUtterance:text=>({text})});
  controller.start({follow:false},[{text:'last sentence'}],{id:'system',voice:''},{nextSection:async()=>{navigations++;return [{text:'next chapter'}];}});
  await controller.advance(controller.generation);
  assert.equal(navigations,0);assert.equal(controller.waitingSection,true);assert.equal(controller.state,'paused');
  controller.toggle();await tick();assert.equal(navigations,1);assert.equal(controller.items[0].text,'next chapter');assert.equal(controller.state,'playing');controller.dispose();
});
