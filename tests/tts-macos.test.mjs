import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
globalThis.macSpeechPlatform = { isDesktop: true, isMacOS: true };
const bundle = await build({ entryPoints: ['src/tts-macos.js'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'host', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'host', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const Platform=globalThis.macSpeechPlatform;' }));
} }] });
const { runMacSpeech, macSpeechWav } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function floatWav(samples, rate = 48000) {
  const bytes = new Uint8Array(44 + samples.length * 4), view = new DataView(bytes.buffer);
  const tag = (at, s) => bytes.set([...s].map(c => c.charCodeAt(0)), at);
  tag(0, 'RIFF'); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 32, true); tag(36, 'data');
  samples.forEach((v, i) => view.setFloat32(44 + i * 4, v, true));
  return bytes;
}
test('JXA speech receives untrusted reading text only as stdin JSON without a shell', async () => {
  const payload = { operation: 'synthesize', text: '引号 "\\\n $(touch /tmp/unwanted) `shell` </script>', output: '/tmp/speech.wav' };
  let input, command, args;
  const result = await runMacSpeech(payload, { execute: (file, parameters, options, callback) => {
    command = file; args = parameters;
    assert.equal(options.shell, undefined); assert.equal(options.timeout, 30000);
    const stdin = new EventEmitter(); stdin.end = text => { input = text; queueMicrotask(() => callback(null, '{"frames":2}')); };
    return { stdin, kill() {} };
  } });
  assert.equal(command, '/usr/bin/osascript'); assert.equal(args.includes(payload.text), false);
  assert.equal(args.join('').includes(payload.text), false); assert.deepEqual(JSON.parse(input), payload); assert.equal(result.frames, 2);
});
test('cancel kills only the synthesis child and ignores its late callback', async () => {
  const signal = new AbortController(); let killed = 0, callback;
  const promise = runMacSpeech({}, { signal: signal.signal, execute: (_f, _a, _o, cb) => {
    callback = cb; const stdin = new EventEmitter(); stdin.end = () => {};
    return { stdin, kill: () => killed++ };
  } });
  signal.abort(); await assert.rejects(promise, { name: 'AbortError' });
  callback(null, '{"frames":10}'); assert.equal(killed, 1);
});
test('missing voice, process failure and malformed native replies are specific errors', async () => {
  for (const [error, stdout, code] of [[null, '{"error":"voice"}', 'voice'], [new Error('failed'), '', 'native'], [null, 'not json', 'response']]) {
    await assert.rejects(runMacSpeech({}, { execute: (_f, _a, _o, cb) => {
      const stdin = new EventEmitter(); stdin.end = () => queueMicrotask(() => cb(error, stdout)); return { stdin, kill() {} };
    } }), { code });
  }
});
test('unfinished float WAV is validated and becomes a complete playable PCM16 WAV', () => {
  const result = macSpeechWav(floatWav([0, 0.5, -0.5, 2, -2]), { frames: 5, sampleRate: 48000 });
  const v = new DataView(result.bytes.buffer);
  assert.equal(result.mime, 'audio/wav'); assert.equal(v.getUint32(4, true), result.bytes.length - 8);
  assert.equal(v.getUint32(40, true), 10); assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getInt16(46, true), 16384); assert.equal(v.getInt16(48, true), -16384);
  assert.equal(v.getInt16(50, true), 32767); assert.equal(v.getInt16(52, true), -32768);
});
test('silent, truncated, nonfinite and mismatched audio never reaches the player', () => {
  assert.throws(() => macSpeechWav(floatWav([0, 0]), { frames: 2, sampleRate: 48000 }), { code: 'empty' });
  assert.throws(() => macSpeechWav(floatWav([NaN]), { frames: 1, sampleRate: 48000 }), { code: 'response' });
  assert.throws(() => macSpeechWav(floatWav([0.5]), { frames: 2, sampleRate: 48000 }), { code: 'response' });
  assert.throws(() => macSpeechWav(floatWav([0.5]), { frames: 1, sampleRate: 22050 }), { code: 'response' });
});
test('mobile and Windows cannot execute or initialize the Mac native process', async () => {
  const execute = () => { throw new Error('process must not start'); };
  macSpeechPlatform.isDesktop = false;
  await assert.rejects(runMacSpeech({}, { execute }), { code: 'macPlatform' });
  macSpeechPlatform.isDesktop = true; macSpeechPlatform.isMacOS = false;
  await assert.rejects(runMacSpeech({}, { execute }), { code: 'macPlatform' });
  macSpeechPlatform.isMacOS = true;
});
test('the shipped CommonJS host loads native builtins lazily without browser import()', async () => {
  const built = await build({ entryPoints: ['src/tts-macos.js'], bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['obsidian', 'node:*'] });
  const platform = { isDesktop: false, isMacOS: true }, module = { exports: {} }, loads = [];
  runInNewContext(built.outputFiles[0].text, { module, queueMicrotask, require(id) {
    if (id === 'obsidian') return { Platform: platform };
    loads.push(id); assert.equal(id, 'node:child_process');
    return { execFile(_file, _args, _options, callback) {
      const stdin = new EventEmitter(); stdin.end = () => queueMicrotask(() => callback(null, '{"voices":[{"id":"v","name":"声音","lang":"zh-CN","quality":2}]}'));
      return { stdin, kill() {} };
    } };
  } });
  assert.equal(loads.length, 0);
  await assert.rejects(module.exports.macSpeechVoices(), { code: 'macPlatform' });
  assert.equal(loads.length, 0);
  platform.isDesktop = true;
  const voices = await module.exports.macSpeechVoices();
  assert.equal(voices[0].name, '声音'); assert.deepEqual(loads, ['node:child_process']);
});
