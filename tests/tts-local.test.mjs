import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { macVoiceChoices } from '../src/tts-mac-voices.js';
const built = await build({ entryPoints: ['src/tts-local.js'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  external: ['obsidian', 'node:*'], loader: { '.py': 'text' } });
const platform = { isDesktop: true }, loads = [], module = { exports: {} }, require = createRequire(import.meta.url);
runInNewContext(built.outputFiles[0].text, { module, Buffer, process, window: {setTimeout, clearTimeout}, setTimeout, clearTimeout, URL, AbortController, Uint8Array,
  require(id) { if (id === 'obsidian') return { Platform: platform }; loads.push(id); return require(id); } });
const api = module.exports;
test('desktop modules remain unloaded on mobile, even with a synced local provider', () => {
  assert.equal(loads.length, 0); platform.isDesktop = false;
  assert.throws(() => api.createLocalTtsManager(), { code: 'localPlatform' }); assert.equal(loads.length, 0); platform.isDesktop = true;
});
test('all supported desktop architectures choose a fixed managed runtime asset', () => {
  assert.equal(api.uvAssetName('darwin', 'arm64'), 'uv-aarch64-apple-darwin.tar.gz');
  assert.equal(api.uvAssetName('win32', 'x64'), 'uv-x86_64-pc-windows-msvc.zip');
  assert.equal(api.uvAssetName('linux', 'x64'), 'uv-x86_64-unknown-linux-gnu.tar.gz');
  assert.throws(() => api.uvAssetName('linux', 'ia32'), { code: 'localPlatform' });
});
test('native voices retain stable system IDs, gain distinct display names and recommendations', () => {
  const ids = ['com.apple.siri.natural.Linfei', 'com.apple.siri.natural.zh-CN-D', 'com.apple.ttsbundle.gryphon-neural_zh-CN-D_zh-CN_premium'];
  const choices = macVoiceChoices(ids.map((id, i) => ({ id, name: i ? '声音 4' : '声音 2', lang: 'zh-CN', quality: 2 })), key => key === 'recommended' ? '推荐' : '阅读器显示名', true);
  assert.equal(new Set(choices.map(v => v.label)).size, 3); assert.deepEqual(choices.map(v => v.id), ids);
  assert.ok(choices.every(v => v.recommended && v.label.includes('推荐') && v.sourceName.includes('声音')));
});
test('model storage rejects a vault and symlink into a vault before creating files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qbr-tts-'));
  try {
    const vault = join(root, 'vault'), link = join(root, 'linked'); await mkdir(vault); await symlink(vault, link);
    for (const destination of [join(vault, 'models'), join(link, 'models')]) {
      const manager = api.createLocalTtsManager({ root: destination, cacheRoot: join(root, 'cache'), vaultPaths: [vault] });
      await assert.rejects(manager.initialize(), { code: 'localPath' });
    }
    const manager = api.createLocalTtsManager({ root: join(root, 'application-data'), cacheRoot: join(root, 'cache'), vaultPaths: [vault] });
    await manager.initialize(); assert.equal((await manager.status('kokoro')).phase, 'missing');
    assert.equal((await manager.voices('melo')).length, 1); manager.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('malformed uv archives cannot produce an executable', () => {
  assert.throws(() => api.uvTarBinary(Buffer.alloc(512)), { code: 'localArchive' });
  const invalid = Buffer.alloc(512); invalid.write('uv'); invalid.write('77777777777', 124);
  assert.throws(() => api.uvTarBinary(invalid), { code: 'localArchive' });
});

test('local catalog contains only the two reading models and migrates obsolete selections', () => {
  assert.deepEqual(Array.from(api.LOCAL_MODELS, m => m.id), ['kokoro', 'melo']);
  for (const model of ['f5', 'spark', 'indextts2']) {
    const next = api.normalizeLocalProfile({ model, voice: 'old-reference', custom: 'preserved' });
    assert.equal(next.model, 'kokoro'); assert.equal(next.voice, 'zf_001'); assert.equal(next.custom, 'preserved');
  }
  assert.equal(api.normalizeLocalProfile({model:'melo',voice:'zf_001'}).voice, 'zh_en');
  assert.equal(api.normalizeLocalProfile({model:'kokoro',voice:'zm_009'}).voice, 'zm_009');
  assert.equal(api.localVoiceChoices('kokoro').length, 11);
  assert.equal(api.localVoiceChoices('melo')[0].id, 'zh_en');
  assert.equal(api.localVoiceChoices('indextts2').length, 0);
});
