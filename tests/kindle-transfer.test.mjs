import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import ssh2 from "ssh2";
import { appendKindleKey, kindleBookName, kindleConnection, kindleLuaSettings, kindleDiscoveryHosts } from "../src/kindle-config.js";
const bundle = await build({ entryPoints: ["src/kindle-transport.js"], bundle: true, platform: "node", format: "cjs", write: false, define: { __KINDLE_CONVERTER_ARCHIVE__: '""' }, external: ["ssh2", "node:*"], plugins: [{ name: "obsidian-desktop", setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "host" }));
  b.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: "export const Platform = { isDesktop: true };" }));
} }] });
const mod = { exports: {} };
globalThis.window = { require: createRequire(import.meta.url), setTimeout, clearTimeout };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { createKindleKey, kindlePublicKey, pairKindleUsb, verifyKindleUsb, checkKindleConnection, sendKindleFile, refreshKindleLibrary } = await mod.exports.loadKindleTransport();

const { Server, utils } = ssh2;
const fixtureConfig = { host: "127.0.0.1" };
const fixtureOptions = { allowLoopback: true, timeout: 2000, idleTimeout: 3000 };

test("discovery stays inside attached private subnets with bounded work", () => {
  const entry = (address, netmask = "255.255.255.0") => ({ family: "IPv4", internal: false, address, netmask });
  const hosts = kindleDiscoveryHosts({ wifi: [entry("192.168.50.9", "255.255.255.248")], public: [entry("8.8.8.8")], local: [{ ...entry("127.0.0.1"), internal: true }] });
  assert.deepEqual(hosts, ["192.168.50.10", "192.168.50.11", "192.168.50.12", "192.168.50.13", "192.168.50.14"]);
  const large = kindleDiscoveryHosts({ a: [entry("10.1.2.3", "255.0.0.0")], b: [entry("192.168.1.1")], c: [entry("172.16.1.1")] });
  assert.ok(large.length <= 512);
  assert.ok(!large.includes("10.1.2.3") && !large.includes("10.1.3.1"));
  assert.deepEqual(kindleDiscoveryHosts({ a: [entry("192.168.1.3", "255.0.255.0")] }), []);
});

async function sftpFixture(t, { corruptRead = false, disconnectWrite = false, nativeReceiver = false, scanFails = false, scanPending = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-kindle-"));
  const remote = path.join(base, "remote"); await fs.mkdir(remote);
  const clientKey = createKindleKey(), hostKey = createKindleKey();
  const parsed = utils.parseKey(clientKey.public), clients = new Set();
  const virtual = "/mnt/us/documents";
  const resolve = name => {
    assert.ok(name === virtual || name.startsWith(`${virtual}/`));
    const dest = path.resolve(remote, path.posix.relative(virtual, name));
    assert.ok(dest === remote || dest.startsWith(`${remote}${path.sep}`));
    return dest;
  };
  const attrs = s => ({ mode: s.mode, size: s.size, uid: 0, gid: 0, atime: Math.floor(s.atimeMs / 1000), mtime: Math.floor(s.mtimeMs / 1000) });
  const server = new Server({ hostKeys: [hostKey.private] }, client => {
    clients.add(client); client.on("error", () => {}); client.on("close", () => clients.delete(client));
    client.on("authentication", ctx => {
      const valid = ctx.method === "publickey" && ctx.key.data.equals(parsed.getPublicSSH())
        && (!ctx.signature || parsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true);
      if (valid) ctx.accept(); else ctx.reject();
    });
    client.on("ready", () => client.on("session", accept => {
      const session = accept();
      session.on("exec", (acceptExec, rejectExec, request) => {
        if (!nativeReceiver || !["qiaomu-receiver-v1", "qiaomu-scan-v1"].includes(request.command)) { rejectExec(); return; }
        const channel = acceptExec();
        const scan = request.command === "qiaomu-scan-v1";
        if (scan && scanFails) { channel.exit(1); channel.end(); return; }
        channel.write(scan ? (scanPending ? "scan-pending\n" : "scan-requested\n") : '{"protocol":1,"scan":true}\n');
        channel.exit(0); channel.end();
      });
      session.on("sftp", acceptSftp => {
        const stream = acceptSftp(), handles = new Map(); let next = 0;
        const event = (name, fn) => stream.on(name, (...args) => {
          void fn(...args).catch(error => { try { stream.status(args[0], error.code === "ENOENT" ? 2 : error.code === "EACCES" ? 3 : 4); } catch { /* Peer disconnected. */ } });
        });
        stream.on("error", () => {});
        stream.on("close", () => { for (const h of handles.values()) void h.close().catch(() => {}); });
        event("REALPATH", async (req, name) => {
          const dest = resolve(name); const s = await fs.stat(dest);
          stream.name(req, [{ filename: name, longname: name, attrs: attrs(s) }]);
        });
        for (const op of ["STAT", "LSTAT"]) event(op, async (req, name) => stream.attrs(req, attrs(await fs.lstat(resolve(name)))));
        event("OPEN", async (req, name, flags) => {
          const h = await fs.open(resolve(name), utils.sftp.flagsToString(flags));
          const token = Buffer.alloc(4); token.writeUInt32BE(++next); handles.set(token.toString("hex"), h); stream.handle(req, token);
        });
        event("WRITE", async (req, token, offset, data) => {
          if (disconnectWrite) { client.end(); return; }
          await handles.get(token.toString("hex")).write(data, 0, data.length, offset); stream.status(req, 0);
        });
        event("READ", async (req, token, offset, length) => {
          const data = Buffer.alloc(length); const { bytesRead } = await handles.get(token.toString("hex")).read(data, 0, length, offset);
          if (!bytesRead) { stream.status(req, 1); return; }
          if (corruptRead && offset === 0) data[0] ^= 1;
          stream.data(req, data.subarray(0, bytesRead));
        });
        event("CLOSE", async (req, token) => { const id = token.toString("hex"); await handles.get(id).close(); handles.delete(id); stream.status(req, 0); });
        event("REMOVE", async (req, name) => { await fs.unlink(resolve(name)); stream.status(req, 0); });
        event("RENAME", async (req, a, b) => {
          try { await fs.lstat(resolve(b)); stream.status(req, 4); return; } catch (e) { if (e.code !== "ENOENT") throw e; }
          await fs.rename(resolve(a), resolve(b)); stream.status(req, 0);
        });
      });
    }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(async () => {
    for (const client of clients) client.end();
    await new Promise(resolve => server.close(resolve)); await fs.rm(base, { recursive: true, force: true });
  });
  return { base, remote, clientKey, config: { ...fixtureConfig, port: server.address().port } };
}

test("only explicit local destinations and supported safe filenames are accepted", () => {
  assert.equal(kindleConnection({ host: "192.168.031.173" }).host, "192.168.31.173");
  assert.equal(kindleBookName("中文 书名.epub"), "中文 书名.epub");
  for (const host of ["127.0.0.1", "8.8.8.8", "https://192.168.1.2", "192.168.1.256", "192.168.1.1;id"]) assert.throws(() => kindleConnection({ host }));
  for (const name of ["../book.epub", "book\n.epub", "book\\.epub", "payload.sh", "notes.md"]) assert.throws(() => kindleBookName(name));
});

test("native receiver authenticates its capabilities and requests library refresh over real SSH", async t => {
  const { config, clientKey } = await sftpFixture(t, { nativeReceiver: true });
  const connection = { ...config, mode: "native" };
  const checked = await checkKindleConnection(connection, clientKey.private, fixtureOptions);
  assert.equal(checked.ready, true);
  const result = await refreshKindleLibrary(connection, clientKey.private, fixtureOptions);
  assert.equal(result.scanRequested, true);
});
test("an ordinary SFTP server is not misidentified as a native Kindle receiver", async t => {
  const { config, clientKey } = await sftpFixture(t);
  await assert.rejects(checkKindleConnection({ ...config, mode: "native" }, clientKey.private, fixtureOptions), { code: "receiver" });
});
test("a stopped scanner queues refresh without reporting an indexing success", async t => {
  const { config, clientKey } = await sftpFixture(t, { nativeReceiver: true, scanPending: true });
  const result = await refreshKindleLibrary({ ...config, mode: "native" }, clientKey.private, fixtureOptions);
  assert.equal(result.scanRequested, false); assert.equal(result.scanPending, true);
});

test("USB pairing is idempotent and preserves unrelated keys and reading settings", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kindle-usb-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "system")); await fs.mkdir(path.join(root, "koreader/settings/SSH"), { recursive: true });
  await fs.writeFile(path.join(root, "system/version.txt"), "Kindle 5.18.1.1.1");
  await fs.writeFile(path.join(root, "koreader/koreader.sh"), "#!/bin/sh\n");
  const original = '-- settings\nreturn {\n    ["font_size"] = 26,\n    ["nested"] = { ["keep"] = true },\n}\n';
  await fs.writeFile(path.join(root, "koreader/settings.reader.lua"), original);
  const other = "# another device\nssh-ed25519 AAAATEST other\n";
  await fs.writeFile(path.join(root, "koreader/settings/SSH/authorized_keys"), other);
  const key = createKindleKey();
  assert.equal(kindlePublicKey(key.private).split(" ")[1], key.public.split(" ")[1]);
  await pairKindleUsb(root, key.public); await pairKindleUsb(root, key.public);
  const settings = await fs.readFile(path.join(root, "koreader/settings.reader.lua"), "utf8");
  assert.match(settings, /\["font_size"\] = 26/); assert.match(settings, /\["nested"\] = \{ \["keep"\] = true \}/);
  assert.match(settings, /\["SSH_key_only_auth"\] = true/); assert.match(settings, /\["SSH_allow_no_password"\] = false/);
  const keys = await fs.readFile(path.join(root, "koreader/settings/SSH/authorized_keys"), "utf8");
  assert.ok(keys.startsWith(other)); assert.equal(keys.split(key.public.split(" ")[1]).length, 2);
  assert.equal(kindleLuaSettings(settings), settings); assert.equal(appendKindleKey(keys, key.public), keys);
  await fs.rm(path.join(root, "koreader/settings/SSH"), { recursive: true });
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-kindle-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, "koreader/settings/SSH"));
  await assert.rejects(pairKindleUsb(root, key.public), { code: "usb" });
  assert.deepEqual(await fs.readdir(outside), []);
  await assert.rejects(verifyKindleUsb(outside));
});

test("real SFTP sends Chinese filenames, checks content, and keeps existing books", async t => {
  const { base, remote, clientKey, config } = await sftpFixture(t);
  const source = path.join(base, "中文 书名.epub"), bytes = Buffer.from("完整电子书内容\n".repeat(12000));
  await fs.writeFile(source, bytes);
  await fs.writeFile(path.join(remote, "中文 书名.epub"), "existing book");
  const ready = await checkKindleConnection(config, clientKey.private, fixtureOptions);
  assert.match(ready.fingerprint, /^[a-f0-9]{64}$/);
  const result = await sendKindleFile({ ...config, fingerprint: ready.fingerprint }, clientKey.private, source, "中文 书名.epub", fixtureOptions);
  assert.equal(result.path, "/mnt/us/documents/中文 书名 (2).epub");
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(await fs.readFile(path.join(remote, "中文 书名 (2).epub")), bytes);
  assert.equal(await fs.readFile(path.join(remote, "中文 书名.epub"), "utf8"), "existing book");
  assert.ok(!(await fs.readdir(remote)).some(x => x.endsWith(".part")));
  await assert.rejects(checkKindleConnection({ ...config, fingerprint: "0".repeat(64) }, clientKey.private, fixtureOptions), { code: "host-key" });
  await assert.rejects(checkKindleConnection(config, createKindleKey().private, fixtureOptions), { code: "auth" });
});

test("corrupt read-back never publishes a book and removes its temporary file", async t => {
  const { base, remote, clientKey, config } = await sftpFixture(t, { corruptRead: true });
  const source = path.join(base, "book.epub"); await fs.writeFile(source, "book content");
  await assert.rejects(sendKindleFile(config, clientKey.private, source, "book.epub", fixtureOptions), { code: "verify" });
  assert.deepEqual(await fs.readdir(remote), []);
});

test("cancellation and disconnection never expose a partially transmitted book", async t => {
  const { base, remote, clientKey, config } = await sftpFixture(t);
  const source = path.join(base, "book.pdf"); await fs.writeFile(source, Buffer.alloc(256000, 90));
  const abort = new AbortController();
  await assert.rejects(sendKindleFile(config, clientKey.private, source, "book.pdf", {
    ...fixtureOptions, signal: abort.signal, onProgress: () => abort.abort(),
  }), { code: "cancelled" });
  assert.ok(!(await fs.readdir(remote)).includes("book.pdf"));
  const other = await sftpFixture(t, { disconnectWrite: true });
  await assert.rejects(sendKindleFile(other.config, other.clientKey.private, source, "book.pdf", fixtureOptions));
  assert.ok(!(await fs.readdir(other.remote)).includes("book.pdf"));
});

test("vault symlinks cannot send a file outside the selected vault", async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "kindle-source-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const vault = path.join(base, "vault"); await fs.mkdir(vault);
  const outside = path.join(base, "outside.epub"); await fs.writeFile(outside, "private");
  const link = path.join(vault, "book.epub"); await fs.symlink(outside, link);
  await assert.rejects(sendKindleFile({ host: "192.168.1.2" }, "unused", link, "book.epub", { vaultRoot: vault }), { code: "file" });
});
