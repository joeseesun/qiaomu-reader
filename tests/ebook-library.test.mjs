import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createEbookLibrary, verifyEbook, EBOOK_API } from '../src/ebook-library.js';
import { mountEbookDiscovery } from '../src/ebook-library-ui.js';

const id = 'a'.repeat(32), code = 'QM-' + 'A'.repeat(32);
const tokens = n => ({ accessToken: 'access-' + n.repeat(40), refreshToken: 'refresh-' + n.repeat(50), expiresAt: Date.now()/1000 + 900 });
function fixture(handler = async () => ({ status: 200, json: {} })) {
  const secrets = new Map(); let state = null, calls = [];
  const plugin = { settings: {}, app: { vault: { getName: () => 'Test vault' }, loadLocalStorage: () => structuredClone(state), saveLocalStorage: (_, value) => { state = structuredClone(value); }, secretStorage: { getSecret: key => secrets.get(key), setSecret: (key, value) => secrets.set(key, value) } } };
  const service = createEbookLibrary(plugin, async options => { calls.push(options); return handler(options); }, { cryptoApi: webcrypto, delay: async () => {} });
  plugin.ebookLibrary = service;
  return { plugin, service, secrets, calls, state: () => state };
}
async function activated(handler) {
  const f = fixture(async o => o.url.endsWith('/activate') ? { status: 200, json: tokens('a') } : o.url.endsWith('/me') ? { status: 200, json: { expiresAt: 1800000000, dailyLimit: 10, usedToday: 0 } } : handler(o));
  await f.service.activate(code); return f;
}
test('public discovery remains selected with zero service or credential requests', () => {
  const f = fixture(), dom = new JSDOM('<main></main>');
  let reads = 0; f.plugin.app.secretStorage.getSecret = () => { reads++; return ''; };
  const ui = mountEbookDiscovery(dom.window.document.querySelector('main'), f.plugin, {}, key => key);
  assert.equal(ui.publicRoot.hidden, false); assert.equal(f.calls.length, 0); assert.equal(reads, 0);
  dom.window.document.querySelectorAll('button')[1].click();
  assert.equal(ui.publicRoot.hidden, true); assert.equal(f.calls.length, 0);
  dom.window.document.querySelector('button').click(); assert.equal(ui.publicRoot.hidden, false); ui.dispose();
});
test('activation secrets stay out of settings and local state; no shared MCP key exists', async () => {
  const f = await activated();
  assert.ok(f.service.isActivated()); assert.ok(f.state().installationId);
  assert.ok(!JSON.stringify(f.plugin.settings).includes('refresh-'));
  assert.ok(!JSON.stringify(f.state()).includes('refresh-')); assert.ok(!JSON.stringify(f.state()).includes(code));
  assert.ok([...f.secrets.values()][0].includes('refresh-'));
  assert.ok(f.calls.every(o => o.url.startsWith(EBOOK_API + '/')));
});
test('redemption retries reuse installation ID after a failed credential save', async () => {
  let installed;
  const f = fixture(async o => { if(o.url.endsWith('/activate')) { const value = JSON.parse(o.body).installationId; if (installed) assert.equal(value, installed); installed = value; return { status: 200, json: tokens('a') }; } return { status: 200, json: {} }; });
  const setter = f.plugin.app.secretStorage.setSecret; f.plugin.app.secretStorage.setSecret = () => { throw Error('storage'); };
  await assert.rejects(f.service.activate(code), { code: 'save' });
  f.plugin.app.secretStorage.setSecret = setter; await f.service.activate(code); assert.ok(f.service.isActivated());
});
test('local storage failure prevents redemption and slot consumption', async () => {
  const f = fixture(); f.plugin.app.saveLocalStorage = () => { throw Error('disk'); };
  await assert.rejects(f.service.activate(code), { code: 'save' }); assert.equal(f.calls.length, 0);
});
test('access expiry shares a single rotating refresh across concurrent requests', async () => {
  let refreshes = 0;
  const f = await activated(async o => {
    if (o.url.endsWith('/refresh')) { refreshes++; return { status: 200, json: tokens('b') }; }
    if (o.headers.Authorization.includes('access-a')) return { status: 401, json: { error: 'unauthorized' } };
    return { status: 200, json: { results: [] } };
  });
  await Promise.all([f.service.search('Book A'), f.service.search('Book B')]);
  assert.equal(refreshes, 1); assert.ok([...f.secrets.values()][0].includes('refresh-b'));
});
test('late activation after close does not persist a credential', async () => {
  let finish; const f = fixture(() => new Promise(resolve => { finish = resolve; })); const aborter = new AbortController();
  const pending = f.service.activate(code, aborter.signal); while (!finish) await new Promise(resolve => setImmediate(resolve));
  aborter.abort(); finish({ status: 200, json: tokens('a') });
  await assert.rejects(pending, { code: 'cancelled' }); assert.equal(f.secrets.size, 0);
});
test('unload prevents late search results and all future network requests', async () => {
  let finish; const f = await activated(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.service.search('Book'); while (!finish) await new Promise(resolve => setImmediate(resolve));
  f.service.dispose(); finish({ status: 200, json: { results: [] } });
  await assert.rejects(pending, { code: 'cancelled' }); const count = f.calls.length;
  await assert.rejects(f.service.search('Book'), { code: 'cancelled' }); assert.equal(f.calls.length, count);
});
const bytes = new TextEncoder().encode('test text book').buffer;
const result = { filename: 'test.txt', format: 'txt', bytes: bytes.byteLength, sha256: createHash('sha256').update(new Uint8Array(bytes)).digest('hex') };
test('verified private download imports once and records the job receipt without credentials', async () => {
  let imports = 0;
  const f = await activated(async o => o.url.endsWith('/file') ? { status: 200, arrayBuffer: bytes } : { status: 200, json: { id, state: 'complete', result } });
  const importBook = async files => { imports++; assert.equal(files[0].name, 'test.txt'); assert.deepEqual(await files[0].arrayBuffer(), bytes); return 1; };
  await f.service.download({ id }, importBook);
  await assert.rejects(f.service.download(null, importBook, null, null, id), { code: 'already-imported' });
  assert.equal(imports, 1); assert.deepEqual(f.state().importedJobs, [id]);
  const body = JSON.parse(f.calls.find(o => o.url.endsWith('/jobs')).body); assert.equal(body.candidateId, id); assert.ok(body.requestId);
});
test('file verification rejects corruption, HTML and path traversal before import', async () => {
  await assert.rejects(verifyEbook(bytes, { ...result, sha256: '0'.repeat(64) }, webcrypto), { code: 'file' });
  await assert.rejects(verifyEbook(bytes, { ...result, filename: '../test.txt' }, webcrypto), { code: 'file' });
  const html = new TextEncoder().encode('<html>login</html>').buffer;
  await assert.rejects(verifyEbook(html, { ...result, bytes: html.byteLength }, webcrypto), { code: 'file' });
});
test('aborting during a file request never imports into the vault', async () => {
  let finish, imports = 0; const f = await activated(async o => o.url.endsWith('/file') ? new Promise(resolve => { finish = resolve; }) : { status: 200, json: { id, state: 'complete', result } });
  const aborter = new AbortController(), pending = f.service.download({ id }, async () => { imports++; return 1; }, null, aborter.signal);
  while (!finish) await new Promise(resolve => setImmediate(resolve)); aborter.abort(); finish({ status: 200, arrayBuffer: bytes });
  await assert.rejects(pending, { code: 'cancelled' }); assert.equal(imports, 0);
});
test('failed vault import leaves a resumable job instead of claiming success', async () => {
  const f = await activated(async o => o.url.endsWith('/file') ? { status: 200, arrayBuffer: bytes } : { status: 200, json: { id, state: 'complete', result } });
  await assert.rejects(f.service.download({ id }, async () => 0), { code: 'import' }); assert.equal(f.state().importedJobs, undefined);
});
