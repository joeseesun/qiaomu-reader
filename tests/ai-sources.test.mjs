import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const bundle = await build({ stdin: { contents: "export * from './src/ai-sources.js';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'obsidian-fixture', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getLanguage = () => "zh"; export const Platform = { isDesktopApp: false, isMobile: false }; export class Modal {}; export class Notice {}; export const setIcon = () => {}; export const requestUrl = async () => ({});' }));
} }] });
const mod = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { apiSourceState } = mod.exports;
const plugin = (settings) => ({ settings: { aiProvider: '', aiSecrets: {}, aiCatalogs: {}, aiBases: {}, ...settings } });
const account = (access) => JSON.stringify({ version: 1, clientId: 'c', subject: 's', email: 'reader@example.com', access, refresh: 'r', expires: 1, scopes: [] });

test('services never connected are not listed', () => {
  assert.equal(apiSourceState(plugin({}), 'deepseek', ''), null);
  assert.equal(apiSourceState(plugin({}), 'chatgpt', ''), null);
  assert.equal(apiSourceState(plugin({}), 'codex-cli', ''), null);
});

test('a signed-in ChatGPT account shows its email and model count', () => {
  const state = apiSourceState(plugin({ aiCatalogs: { chatgpt: [{ id: 'a' }, { id: 'b' }] } }), 'chatgpt', account('token'));
  assert.deepEqual(state, { ok: true, sub: 'reader@example.com · 2 个模型' });
  assert.deepEqual(apiSourceState(plugin({}), 'chatgpt', account('')), { ok: false, sub: '需要登录' });
});

test('key services show their host; a missing key needs attention', () => {
  assert.deepEqual(apiSourceState(plugin({ aiCatalogs: { deepseek: [{ id: 'm' }] } }), 'deepseek', 'sk-test'), { ok: true, sub: 'api.deepseek.com · 1 个模型' });
  assert.deepEqual(apiSourceState(plugin({ aiCatalogs: { deepseek: [{ id: 'm' }] } }), 'deepseek', ''), { ok: false, sub: '需要 API Key' });
  assert.equal(apiSourceState(plugin({ aiCatalogs: { ollama: [{ id: 'q' }] } }), 'ollama', '').ok, true);
});
