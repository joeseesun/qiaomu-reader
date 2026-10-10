import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const bundle = await build({ stdin: { contents: `export * from './src/model-access/client'; export * from './src/model-access/services/provider-auth'; export * from './src/model-access/services/oauth-loopback'; export * from './src/model-access/services/magpie'; export * from './src/model-access/services/chatgpt-transport';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'transport-fixture', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'fixture' }));
  b.onResolve({ filter: /api-transport(?:\.js)?$/ }, () => ({ path: 'transport', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'obsidian' ? 'export const getLanguage = () => "en"; export const Platform = { isDesktopApp: true };' : 'export const apiFetch = (...args) => globalThis.__accessFetch(...args); export const apiStatusError = status => Error(`HTTP ${status}`);' }));
} }] });
const mod = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const api = mod.exports;
const store = () => { const values = new Map(); return { getSecret: id => values.get(id) || null, setSecret: (id, value) => values.set(id, value) }; };
const connection = { provider: 'chatgpt', baseUrl: 'https://api.openai.com/v1', model: 'fixture-model', secretId: 'fixture-secret', protocol: 'openai-responses' };
const creds = expires => JSON.stringify({ version: 1, clientId: 'fixture-client', subject: 'fixture-sub', email: '', hostId: '', access: 'fixture-access', refresh: 'fixture-refresh', idToken: '', expires, scopes: ['chatgpt.tokens.use.direct'] });

test('provider callback state, PKCE and application identity are retained', async () => {
  const challenge = await api.pkceChallenge('x'.repeat(64)); assert.equal(challenge.length, 43);
  const url = new URL(api.authorizationUrl('tokendance', 'http://127.0.0.1:1234/auth/callback?state=abc', 'abc', challenge, 'nonce', 'host'));
  assert.equal(new URL(url.searchParams.get('callback_url')).searchParams.get('state'), 'abc');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.notEqual(url.searchParams.get('key_name'), 'Qiaomu Agent');
});
test('real loopback rejects incorrect state then cancels and closes', async () => {
  globalThis.window = { require: createRequire(import.meta.url) };
  const controller = new AbortController(); const listener = await api.listenOAuth('expected', controller.signal);
  try { assert.equal((await fetch(listener.redirect + '?state=wrong&code=fixture')).status, 400); controller.abort(); await assert.rejects(listener.result); await assert.rejects(fetch(listener.redirect)); }
  finally { listener.close(); delete globalThis.window; }
});
test('ChatGPT filters hidden models and preserves Magpie exact IDs and effort names', () => {
  assert.deepEqual(api.listedModels({ models: [{ slug: 'hidden', visibility: 'hide' }, { slug: 'unlisted' }, { slug: 'available', visibility: 'list' }] }, true).map(m => m.id), ['available']);
  assert.deepEqual(api.listedModels({ data: [{ id: 'claude/subscription/opus', supported_reasoning_levels: [{ effort: 'max' }, { effort: 'ultra' }] }] })[0].efforts, ['max', 'ultra']);
});
test('refresh is deduplicated, rotated credentials persisted, and remote URLs rejected', async () => {
  const secrets = store(); secrets.setSecret(connection.secretId, creds(0)); let calls = 0;
  globalThis.__accessFetch = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return Response.json({ access_token: 'next', refresh_token: 'rotated', expires_in: 3600 }); };
  assert.deepEqual(await Promise.all([api.accessToken(connection, '', secrets), api.accessToken(connection, '', secrets)]), ['next', 'next']);
  assert.equal(calls, 1); assert.equal(JSON.parse(secrets.getSecret(connection.secretId)).refresh, 'rotated');
  await assert.rejects(api.accessToken({ ...connection, baseUrl: 'https://unrelated.invalid/v1' }, '', secrets));
});
test('SIWC uses complete Responses stream and strips unsupported parameters', async () => {
  const secrets = store(); secrets.setSecret(connection.secretId, creds(Date.now() + 3600000)); let count = 0;
  globalThis.__accessFetch = async (url, init) => {
    count++; assert.equal(url, 'https://api.openai.com/v1/responses'); const body = JSON.parse(init.body);
    assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.input[0].role, 'developer'); assert.equal(body.temperature, undefined);
    return new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.completed"}\n\n');
  };
  assert.equal(await api.completeChatGPT(connection, secrets, [{ role: 'system', content: 'fixture' }]), 'OK'); assert.equal(count, 1);
  globalThis.__accessFetch = async () => new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n');
  await assert.rejects(api.completeChatGPT(connection, secrets, [{ role: 'user', content: 'fixture' }]));
});
test('remote Magpie requires a key and detection preserves proxy prefixes', async () => {
  let calls = 0;
  globalThis.__accessFetch = async (url, init) => { calls++; assert.equal(url, 'https://gateway.invalid/magpie/api/hello'); assert.equal(init.headers.Authorization, 'Bearer fixture-key'); return Response.json({ name: 'magpie', version: 'fixture' }); };
  await assert.rejects(api.detectMagpie('https://gateway.invalid/magpie/v1', '', new AbortController().signal)); assert.equal(calls, 0);
  assert.equal(await api.detectMagpie('https://gateway.invalid/magpie/v1', 'fixture-key', new AbortController().signal), 'fixture');
});
