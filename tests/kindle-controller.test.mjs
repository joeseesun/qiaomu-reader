import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";

const bundle = await build({ entryPoints: ["src/kindle.js"], bundle: true, platform: "node", format: "cjs", write: false, plugins: [{ name: "kindle-host-fixture", setup(b) {
  b.onResolve({ filter: /^obsidian$|kindle-transport\.js$/ }, a => ({ path: a.path, namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "obsidian" ? "export const Platform=globalThis.__kindlePlatform;" : "export async function loadKindleTransport(){ globalThis.__kindleLoads++; return globalThis.__kindleTransport; }" }));
} }] });
function fixture(settings = {}) {
  globalThis.window = { crypto: webcrypto };
  globalThis.__kindlePlatform = { isDesktopApp: true };
  globalThis.__kindleLoads = 0;
  const store = new Map(), files = new Map(); let saves = 0;
  const plugin = { settings: { kindle: settings }, app: { secretStorage: { getSecret: id => store.get(id), setSecret: (id, value) => store.set(id, value) }, vault: { getAbstractFileByPath: p => files.get(p), adapter: { getFullPath: p => `/vault/${p}`, getBasePath: () => "/vault" } } }, _saveLocalData: async () => { saves++; return true; } };
  globalThis.__kindleTransport = { createKindleKey: () => ({ private: "private-fixture", public: "public-fixture" }), kindlePublicKey: key => { if (key === "invalid") throw Error("invalid"); return "public-fixture"; }, pairKindleUsb: async () => ({}), checkKindleConnection: async () => ({ fingerprint: "a".repeat(64) }), sendKindleFile: async () => ({ bytes: 12 }) };
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  return { plugin, store, files, controller: mod.exports.createKindleController(plugin), transport: globalThis.__kindleTransport, saves: () => saves };
}
test("USB repair recovers missing local secrets without putting private keys in settings", async () => {
  const f = fixture({ secretId: "lost-on-another-computer", paired: true, host: "192.168.1.4", fingerprint: "b".repeat(64) });
  await f.controller.pairUsb("/usb");
  assert.equal(f.store.get(f.plugin.settings.kindle.secretId), "private-fixture");
  assert.equal(f.plugin.settings.kindle.paired, true);
  assert.equal(f.plugin.settings.kindle.fingerprint, "");
  assert.ok(!JSON.stringify(f.plugin.settings).includes("private-fixture"));
});
test("failed key persistence rolls settings back and clears the new secret", async () => {
  const original = { host: "192.168.1.4" }, f = fixture(original);
  f.plugin._saveLocalData = async () => false;
  await assert.rejects(f.controller.pairUsb("/usb"), { code: "save" });
  assert.deepEqual(f.plugin.settings.kindle, original);
  assert.ok([...f.store.values()].every(value => value === ""));
});
test("unload blocks late connection completion from saving device state", async () => {
  const f = fixture({ secretId: "existing", paired: true }); f.store.set("existing", "private-fixture");
  let finish;
  f.transport.checkKindleConnection = () => new Promise(resolve => { finish = resolve; });
  const pending = f.controller.test({ host: "192.168.1.4" });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  f.controller.dispose(); finish({ fingerprint: "a".repeat(64) });
  await assert.rejects(pending, { code: "cancelled" }); assert.equal(f.saves(), 0);
});
test("repeated sends share one upload while different books are rejected as busy", async () => {
  const f = fixture({ secretId: "existing", host: "192.168.1.4", paired: true, fingerprint: "a".repeat(64) }); f.store.set("existing", "private-fixture");
  const file = { path: "book.epub", name: "book.epub", extension: "epub" }; f.files.set(file.path, file);
  let finish, uploads = 0;
  f.transport.sendKindleFile = () => { uploads++; return new Promise(resolve => { finish = resolve; }); };
  const one = f.controller.send(file), two = f.controller.send(file);
  await assert.rejects(f.controller.send({ path: "other.pdf", name: "other.pdf", extension: "pdf" }), { code: "busy" });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  finish({ bytes: 12 }); await Promise.all([one, two]); assert.equal(uploads, 1);
});
test("mobile entry does not initialize desktop SSH dependencies", async () => {
  const f = fixture(); globalThis.__kindlePlatform.isDesktopApp = false;
  await assert.rejects(f.controller.pairUsb("/usb"), { code: "key" });
  assert.equal(globalThis.__kindleLoads, 0);
});

test("switching reading modes preserves each receiver identity and pairing, including legacy settings", async () => {
  const original = { secretId: "existing", host: "192.168.1.4", port: 2222, paired: true, fingerprint: "a".repeat(64) };
  const f = fixture(original); f.store.set("existing", "private-fixture");
  await f.controller.setMode("native");
  assert.equal(f.controller.config().paired, false); assert.equal(f.controller.config().port, 2223);
  await f.controller.test({ host: "192.168.1.5", mode: "native" });
  await f.controller.setMode("koreader");
  assert.equal(f.controller.config().host, original.host); assert.equal(f.controller.config().fingerprint, original.fingerprint);
  assert.equal(f.controller.isPaired(), true);
  await f.controller.setMode("native");
  assert.equal(f.controller.config().host, "192.168.1.5"); assert.equal(f.controller.config().port, 2223);
});
test("native delivery converts before transfer and reports index failure as delivered, with no blind retry", async () => {
  const f = fixture({ mode: "native", secretId: "existing", host: "192.168.1.4", paired: true, port: 2223, fingerprint: "a".repeat(64) });
  f.store.set("existing", "private-fixture");
  const file = { path: "中文.epub", name: "中文.epub" }; f.files.set(file.path, file);
  let cleaned = false, sent = 0;
  f.transport.prepareKindleFile = async () => ({ path: "/tmp/output.azw3", name: "中文.azw3", root: "/tmp", converted: true, cleanup: async () => { cleaned = true; } });
  f.transport.sendKindleFile = async (_c, _k, p, name) => { assert.equal(p, "/tmp/output.azw3"); assert.equal(name, "中文.azw3"); sent++; return { bytes: 123, sha256: "verified" }; };
  f.transport.refreshKindleLibrary = async () => { throw Error("scanner stopped"); };
  const receipt = await f.controller.send(file);
  assert.equal(receipt.scanRequested, false); assert.equal(receipt.converted, true); assert.equal(sent, 1); assert.equal(cleaned, true);
});
