/* global require -- Obsidian's desktop CommonJS loader supplies this function. */
import { Platform } from 'obsidian';
import { checkTtsSignal, ttsError } from './tts-providers.js';

// Fixed source only. Reading text and paths travel as JSON on stdin, never as
// executable source, shell arguments or Apple Events to another application.
export const MAC_SPEECH_SCRIPT = String.raw`
ObjC.import('Foundation'); ObjC.import('AVFoundation');
function run() {
 const input=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
 const request=JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input,$.NSUTF8StringEncoding)));
 const all=$.AVSpeechSynthesisVoice.speechVoices;
 if(request.operation==='voices') {
  const voices=[];
  for(let i=0;i<Number(all.count);i++) {
   const v=all.objectAtIndex(i);
   voices.push({id:ObjC.unwrap(v.identifier),name:ObjC.unwrap(v.name),lang:ObjC.unwrap(v.language),quality:Number(v.quality)});
  }
  return JSON.stringify({voices:voices});
 }
 if(request.operation!=='synthesize') throw new Error('operation');
 const voice=request.voice ? $.AVSpeechSynthesisVoice.voiceWithIdentifier(request.voice) : $.AVSpeechSynthesisVoice.voiceWithLanguage(request.language);
 if(!voice) return JSON.stringify({error:'voice'});
 const synth=$.AVSpeechSynthesizer.alloc.init;
 const utterance=$.AVSpeechUtterance.speechUtteranceWithString(request.text);
 utterance.voice=voice; utterance.rate=0.5;
 let done=false,frames=0,sampleRate=0,file=null,failure=null;
 synth.writeUtteranceToBufferCallback(utterance,function(pcm) {
  if(done) return;
  const count=Number(pcm.frameLength);
  if(!count) {done=true;return;}
  try {
   if(!file) {
    file=$.AVAudioFile.alloc.initForWritingSettingsError($.NSURL.fileURLWithPath(request.output),pcm.format.settings,null);
    sampleRate=Number(pcm.format.sampleRate);
   }
   if(!file.writeFromBufferError(pcm,null)) throw new Error('write');
   frames+=count;
  } catch(e) {failure='native';done=true;}
 });
 const start=Date.now();
 while(!done&&Date.now()-start<25000) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01));
 if(!done) {synth.stopSpeakingAtBoundary(0);failure='timeout';}
 return JSON.stringify({frames:frames,sampleRate:sampleRate,voice:ObjC.unwrap(voice.identifier),error:failure});
}`;

export async function runMacSpeech(payload, { signal, execute } = {}) {
  if (!Platform.isDesktop) throw ttsError('macPlatform');
  if (!Platform.isMacOS) throw ttsError('macPlatform');
  checkTtsSignal(signal);
  // Obsidian's renderer evaluates a CommonJS plugin: native dynamic imports
  // use the browser loader, so load builtins through its desktop require.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Desktop guarded CommonJS host; browser import() cannot load node: modules.
  if (!execute) ({ execFile: execute } = require('node:child_process'));
  checkTtsSignal(signal);
  return new Promise((resolve, reject) => {
    let child, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { child?.kill(); finish(Object.assign(new Error('Cancelled'), { name: 'AbortError' })); };
    try {
      child = execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_SPEECH_SCRIPT], { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) { finish(ttsError(error.killed ? 'timeout' : 'native')); return; }
        try {
          const result = JSON.parse(stdout);
          finish(result.error ? ttsError(result.error) : null, result);
        } catch { finish(ttsError('response')); }
      });
      signal?.addEventListener('abort', abort, { once: true });
      child.stdin.on('error', () => { child.kill(); finish(ttsError('native')); });
      child.stdin.end(JSON.stringify(payload));
      if (signal?.aborted) abort();
    } catch { child?.kill(); finish(ttsError('native')); }
  });
}

// JXA retains AVAudioFile until its host exits and may leave zero RIFF/data
// lengths. Validate the completed PCM against its callback frame count, then
// encode a fresh 16-bit WAV rather than handing an unfinished file to Audio.
export function macSpeechWav(bytes, result) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || bytes.length > 32 * 1024 * 1024 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw ttsError('response');
  let format, offset;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true), start = at + 8;
    if (tag(at) === 'data') { offset = start; break; }
    if (start + size > bytes.length) throw ttsError('response');
    if (tag(at) === 'fmt ' && size >= 16) format = { code: view.getUint16(start, true), channels: view.getUint16(start + 2, true), rate: view.getUint32(start + 4, true), block: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
    at = start + size + size % 2;
  }
  const frames = result.frames;
  if (!format || offset === undefined || format.channels !== 1 || format.rate !== result.sampleRate || ![22050, 24000, 44100, 48000].includes(format.rate)
    || !Number.isSafeInteger(frames) || frames <= 0 || frames * format.block !== bytes.length - offset
    || !((format.code === 3 && format.bits === 32 && format.block === 4) || (format.code === 1 && format.bits === 16 && format.block === 2))) throw ttsError('response');
  const wav = new Uint8Array(44 + frames * 2), out = new DataView(wav.buffer);
  const writeTag = (at, value) => wav.set(Array.from(value, c => c.charCodeAt(0)), at);
  writeTag(0, 'RIFF'); out.setUint32(4, wav.length - 8, true); writeTag(8, 'WAVE'); writeTag(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, format.rate, true); out.setUint32(28, format.rate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); writeTag(36, 'data'); out.setUint32(40, frames * 2, true);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const value = format.code === 3 ? view.getFloat32(offset + i * 4, true) : view.getInt16(offset + i * 2, true) / 32768;
    if (!Number.isFinite(value)) throw ttsError('response');
    peak = Math.max(peak, Math.abs(value));
    const sample = Math.max(-1, Math.min(1, value)); out.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  if (peak < 0.001) throw ttsError('empty');
  return { bytes: wav, mime: 'audio/wav' };
}

export async function macSpeechVoices(signal) {
  const result = await runMacSpeech({ operation: 'voices' }, { signal });
  if (!Array.isArray(result.voices)) throw ttsError('response');
  return result.voices.filter(v => typeof v.id === 'string' && typeof v.name === 'string' && typeof v.lang === 'string' && [1, 2, 3].includes(v.quality));
}
let lane = Promise.resolve();
export function synthesizeMacSpeech(text, voice, { signal } = {}) {
  if (!Platform.isDesktop) throw ttsError('macPlatform');
  if (!Platform.isMacOS) throw ttsError('macPlatform');
  checkTtsSignal(signal);
  const task = lane.then(async () => {
    checkTtsSignal(signal);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- This function rejects mobile before entering its native task.
    const { mkdtemp, readFile, rm } = require('node:fs/promises');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Same desktop guarded CommonJS host.
    const { tmpdir } = require('node:os'), { join } = require('node:path');
    checkTtsSignal(signal);
    const directory = await mkdtemp(join(tmpdir(), 'qiaomu-reader-tts-'));
    try {
      const output = join(directory, 'speech.wav');
      const result = await runMacSpeech({ operation: 'synthesize', text, voice, language: /[\u3400-\u9fff]/u.test(text) ? 'zh-CN' : 'en-US', output }, { signal });
      checkTtsSignal(signal);
      if (voice && result.voice !== voice) throw ttsError('voice');
      return macSpeechWav(new Uint8Array(await readFile(output)), result);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  lane = task.catch(() => {});
  return new Promise((resolve, reject) => {
    const abort = () => { signal?.removeEventListener('abort', abort); reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })); };
    signal?.addEventListener('abort', abort, { once: true });
    task.then(value => { signal?.removeEventListener('abort', abort); resolve(value); }, error => { signal?.removeEventListener('abort', abort); reject(error); });
    if (signal?.aborted) abort();
  });
}
