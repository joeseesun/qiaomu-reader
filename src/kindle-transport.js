// Loaded only after a desktop user explicitly starts pairing or a transfer.
import { Platform } from "obsidian";
import ssh2 from "ssh2";
import { KINDLE_FOLDER, KINDLE_MAX_BYTES, kindleBookName, kindleConnection, kindleError, kindleLuaSettings, appendKindleKey, kindleDiscoveryHosts } from "./kindle-config.js";

export async function loadKindleTransport() {
  if (!Platform.isDesktop) throw kindleError("key");
  // Electron's renderer cannot resolve native ESM node: imports. Use the host's
  // guarded Node loader; ssh2 itself remains part of the distributed bundle.
  const fs = window.require("node:fs"), path = window.require("node:path"), os = window.require("node:os"), net = window.require("node:net");
  const { createHash, randomUUID } = window.require("node:crypto");
  const { Client, utils } = ssh2;
  const fsp = fs.promises;
const timing = typeof window === "undefined" ? { setTimeout, clearTimeout } : window;
const aborted = () => Object.assign(kindleError("cancelled"), { name: "AbortError" });
const check = signal => { if (signal?.aborted) throw aborted(); };
function createKindleKey() {
  const pair = utils.generateKeyPairSync("ecdsa", { bits: 256, comment: "qiaomu-reader" });
  if (!pair || pair instanceof Error) throw kindleError("key");
  return pair;
}
function kindlePublicKey(privateKey) {
  const parsed = utils.parseKey(privateKey);
  if (!parsed || parsed instanceof Error || parsed.type !== "ecdsa-sha2-nistp256") throw kindleError("key");
  return `${parsed.type} ${parsed.getPublicSSH().toString("base64")} qiaomu-reader`;
}
async function verifyKindleUsb(candidate) {
  const root = await fsp.realpath(candidate);
  if (root === path.parse(root).root && (os.platform() !== "win32" || /^[cC]:/.test(root))) throw kindleError("usb");
  for (const rel of ["system/version.txt", "koreader/koreader.sh", "koreader/settings.reader.lua"]) {
    const resolved = await fsp.realpath(path.join(root, rel));
    if (!resolved.startsWith(root + path.sep) || !(await fsp.stat(resolved)).isFile()) throw kindleError("usb");
  }
  if (!/^Kindle\s+\d/.test(await fsp.readFile(path.join(root, "system/version.txt"), "utf8"))) throw kindleError("usb");
  return root;
}
async function findKindleUsb() {
  let candidates = [];
  if (os.platform() === "darwin") candidates = (await fsp.readdir("/Volumes").catch(() => [])).map(x => path.join("/Volumes", x));
  else if (os.platform() === "win32") candidates = Array.from({ length: 23 }, (_, i) => `${String.fromCharCode(68 + i)}:\\`);
  else {
    for (const base of [path.join("/media", os.userInfo().username), path.join("/run/media", os.userInfo().username), "/mnt"]) {
      for (const x of await fsp.readdir(base).catch(() => [])) candidates.push(path.join(base, x));
    }
  }
  const found = [];
  for (const p of candidates) { try { found.push(await verifyKindleUsb(p)); } catch { /* Not a KOReader Kindle. */ } }
  return found;
}
async function pairKindleUsb(candidate, publicKey, { signal, port } = {}) {
  check(signal);
  const root = await verifyKindleUsb(candidate);
  const settingsPath = path.join(root, "koreader/settings.reader.lua");
  const settings = await fsp.readFile(settingsPath, "utf8");
  const updated = kindleLuaSettings(settings, port);
  const keyDir = path.join(root, "koreader/settings/SSH");
  const settingsDir = await fsp.realpath(path.dirname(keyDir));
  if (!settingsDir.startsWith(root + path.sep)) throw kindleError("usb");
  await fsp.mkdir(keyDir, { recursive: true });
  // Reject links outside the verified Kindle, including an existing key file.
  const actualDir = await fsp.realpath(keyDir);
  if (!actualDir.startsWith(root + path.sep)) throw kindleError("usb");
  const keyPath = path.join(actualDir, "authorized_keys");
  const keyExists = await fsp.lstat(keyPath).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
  if (keyExists && !(await fsp.realpath(keyPath)).startsWith(root + path.sep)) throw kindleError("usb");
  const previous = keyExists ? await fsp.readFile(keyPath, "utf8") : null;
  const keys = appendKindleKey(previous || "", publicKey);
  const id = randomUUID();
  const tempSettings = `${settingsPath}.qiaomu-${id}.tmp`, tempKeys = `${keyPath}.qiaomu-${id}.tmp`;
  const backup = `${settingsPath}.qiaomu-reader-backup-${Date.now()}-${id}`;
  let keyWritten = false;
  try {
    check(signal);
    await fsp.writeFile(backup, settings, { flag: "wx" });
    await fsp.writeFile(tempKeys, keys, { flag: "wx" });
    await fsp.writeFile(tempSettings, updated, { flag: "wx" });
    check(signal);
    // Do not replace a config which changed after we read it.
    if (await fsp.readFile(settingsPath, "utf8") !== settings) throw kindleError("usb-settings");
    await fsp.rename(tempKeys, keyPath); keyWritten = true;
    await fsp.rename(tempSettings, settingsPath);
    if (await fsp.readFile(settingsPath, "utf8") !== updated || await fsp.readFile(keyPath, "utf8") !== keys) throw kindleError("usb-settings");
    return { paired: true };
  } catch (error) {
    if (keyWritten) {
      if (previous === null) await fsp.unlink(keyPath).catch(() => {});
      else await fsp.writeFile(keyPath, previous);
      await fsp.writeFile(settingsPath, settings);
    }
    throw error;
  } finally {
    await fsp.unlink(tempKeys).catch(() => {}); await fsp.unlink(tempSettings).catch(() => {});
  }
}

function withKindleSession(raw, privateKey, action, { signal, allowLoopback = false, timeout = 10000, idleTimeout = 30000 } = {}) {
  let config;
  try { config = kindleConnection(raw); }
  catch (error) {
    // Only the protocol integration fixture opts into loopback; product calls never do.
    if (!allowLoopback || raw.host !== "127.0.0.1") return Promise.reject(error);
    config = { host: raw.host, port: raw.port, fingerprint: raw.fingerprint || "" };
  }
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false, mismatch = false, fingerprint = "", timer;
    const finish = (error, value) => {
      if (settled) return; settled = true;
      timing.clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
      client.destroy();
      if (error) reject(error); else resolve({ ...value, fingerprint });
    };
    const touch = () => { if (settled) return; timing.clearTimeout(timer); timer = timing.setTimeout(() => finish(kindleError("timeout")), idleTimeout); };
    const onAbort = () => finish(aborted());
    signal?.addEventListener("abort", onAbort, { once: true });
    client.on("error", error => finish(kindleError(mismatch ? "host-key" : error.level === "client-authentication" ? "auth" : "network")));
    client.on("close", () => { if (!settled) finish(kindleError("network")); });
    client.once("ready", () => {
      touch();
      client.sftp(async (error, sftp) => {
        if (error) { finish(kindleError("sftp")); return; }
        try {
          const call = (method, ...args) => new Promise((res, rej) => {
            if (settled) { rej(signal?.aborted ? aborted() : kindleError("network")); return; }
            check(signal); touch();
            sftp[method](...args, (err, value) => { touch(); if (settled) rej(signal?.aborted ? aborted() : kindleError("network")); else if (err) rej(err); else res(value); });
          });
          const value = await action({ sftp, call, touch, fingerprint });
          check(signal); finish(null, value);
        } catch (err) { finish(err); }
      });
    });
    touch();
    try {
      client.connect({ host: config.host, port: config.port, username: "root", privateKey,
        hostHash: "sha256", hostVerifier(hash) { fingerprint = hash; mismatch = !!config.fingerprint && hash !== config.fingerprint; return !mismatch; },
        readyTimeout: timeout, keepaliveInterval: 10000, keepaliveCountMax: 2,
      });
    } catch { finish(kindleError("key")); }
  });
}
async function checkKindleConnection(config, privateKey, options) {
  return withKindleSession(config, privateKey, async ({ call }) => {
    const dir = await call("realpath", KINDLE_FOLDER);
    if (dir !== KINDLE_FOLDER) throw kindleError("folder");
    const stats = await call("stat", dir);
    if (!stats.isDirectory()) throw kindleError("folder");
    return { ready: true };
  }, options);
}
async function discoverKindle(config, privateKey, { signal } = {}) {
  check(signal);
  const hosts = kindleDiscoveryHosts(os.networkInterfaces());
  const aborter = new AbortController();
  const abort = () => aborter.abort(); signal?.addEventListener("abort", abort, { once: true });
  const deadline = timing.setTimeout(abort, 20000);
  let next = 0, result;
  const probe = host => new Promise(resolve => {
    const socket = net.createConnection({ host, port: config.port || 2222 });
    let done = false, banner = "";
    const finish = found => {
      if (done) return; done = true;
      aborter.signal.removeEventListener("abort", stop); socket.destroy(); resolve(found);
    };
    const stop = () => finish(false);
    aborter.signal.addEventListener("abort", stop, { once: true });
    socket.setTimeout(600, stop); socket.on("error", stop); socket.on("close", stop);
    socket.on("data", data => {
      banner += data.toString("ascii");
      if (banner.includes("\n") || banner.length > 512) finish(/^SSH-2\.0-/i.test(banner));
    });
    if (aborter.signal.aborted) stop();
  });
  try {
    await Promise.all(Array.from({ length: 24 }, async () => {
      while (!aborter.signal.aborted && next < hosts.length) {
        const host = hosts[next++];
        if (!await probe(host) || aborter.signal.aborted) continue;
        try {
          const checked = await checkKindleConnection({ ...config, host }, privateKey, { signal: aborter.signal, timeout: 3000, idleTimeout: 4000 });
          if (!result) { result = { host, ...checked }; aborter.abort(); }
        } catch { /* Only a device accepting our paired key and identity is a match. */ }
      }
    }));
    check(signal);
    if (!result) throw kindleError("not-found");
    return result;
  } finally {
    timing.clearTimeout(deadline); signal?.removeEventListener("abort", abort); aborter.abort();
  }
}
async function sendKindleFile(config, privateKey, localPath, name, { signal, onProgress, ...options } = {}) {
  name = kindleBookName(name);
  if (options.vaultRoot) {
    const [base, resolved] = await Promise.all([fsp.realpath(options.vaultRoot), fsp.realpath(localPath)]);
    if (!resolved.startsWith(base + path.sep)) throw kindleError("file");
    localPath = resolved;
  }
  const stat = await fsp.stat(localPath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > KINDLE_MAX_BYTES) throw kindleError("size");
  return withKindleSession(config, privateKey, async ({ sftp, call, touch }) => {
    const folder = await call("realpath", KINDLE_FOLDER);
    if (folder !== KINDLE_FOLDER) throw kindleError("folder");
    const ext = path.extname(name), stem = name.slice(0, -ext.length);
    let target;
    for (let i = 0; i < 1000; i++) {
      const candidate = `${folder}/${i ? `${stem} (${i + 1})${ext}` : name}`;
      try { await call("lstat", candidate); }
      catch (error) { if (error.code === 2) { target = candidate; break; } throw error; }
    }
    if (!target) throw kindleError("conflict");
    const temp = `${folder}/.qiaomu-${randomUUID()}.part`;
    let handle, complete = false;
    try {
      handle = await call("open", temp, "wx");
      const digest = createHash("sha256"); let sent = 0;
      for await (const chunk of fs.createReadStream(localPath, { highWaterMark: 65536 })) {
        check(signal); digest.update(chunk);
        await call("write", handle, chunk, 0, chunk.length, sent);
        sent += chunk.length; onProgress?.({ phase: "send", sent, total: stat.size });
      }
      await call("close", handle); handle = null;
      const after = await fsp.stat(localPath);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw kindleError("changed");
      if ((await call("stat", temp)).size !== stat.size) throw kindleError("verify");
      const localHash = digest.digest("hex"), remoteHash = createHash("sha256");
      const remote = sftp.createReadStream(temp, { highWaterMark: 65536 });
      const stopRead = () => remote.destroy(aborted());
      signal?.addEventListener("abort", stopRead, { once: true });
      try {
        for await (const chunk of remote) {
          check(signal); touch(); remoteHash.update(chunk);
          onProgress?.({ phase: "verify", sent: stat.size, total: stat.size });
        }
      } finally { signal?.removeEventListener("abort", stopRead); }
      if (remoteHash.digest("hex") !== localHash) throw kindleError("verify");
      // SFTP v3 rename fails if a destination appeared meanwhile; never overwrite.
      await call("rename", temp, target); complete = true;
      return { path: target, bytes: stat.size, sha256: localHash };
    } finally {
      if (handle) await call("close", handle).catch(() => {});
      if (!complete && !signal?.aborted) await call("unlink", temp).catch(() => {});
    }
  }, { ...options, signal });
}

return { createKindleKey, kindlePublicKey, verifyKindleUsb, findKindleUsb, pairKindleUsb, withKindleSession, checkKindleConnection, discoverKindle, sendKindleFile };
}
