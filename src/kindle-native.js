import { KINDLE_MAX_BYTES, KINDLE_NATIVE_PORT, appendKindleKey, kindleDeliveryFormat, kindleError } from "./kindle-config.js";

// Node objects are injected by the guarded desktop loader. No Node work on import.
export function createKindleNative({ fs, path, os, randomUUID, convertEpub }) {
  const fsp = fs.promises;
  const check = signal => { if (signal?.aborted) throw kindleError("cancelled"); };
  async function inside(root, relative) {
    const resolved = await fsp.realpath(path.join(root, relative));
    if (!resolved.startsWith(root + path.sep)) throw kindleError("usb");
    return resolved;
  }
  async function pairNative(root, publicKey, { signal } = {}) {
    check(signal);
    root = await fsp.realpath(root);
    const marker = await inside(root, "qiaomu-kindle/receiver.json");
    const text = await fsp.readFile(marker, "utf8");
    if (text.length > 4096) throw kindleError("receiver");
    const info = JSON.parse(text);
    if (info.protocol !== 1 || info.port !== KINDLE_NATIVE_PORT || info.prepared !== true) throw kindleError("receiver");
    const dir = await inside(root, "usbnetlite/etc/dropbear");
    const target = path.join(dir, "authorized_keys");
    const exists = await fsp.lstat(target).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; });
    if (exists) await inside(root, "usbnetlite/etc/dropbear/authorized_keys");
    const previous = exists ? await fsp.readFile(target, "utf8") : null;
    const next = appendKindleKey(previous || "", publicKey);
    const temp = `${target}.qiaomu-${randomUUID()}.tmp`;
    try {
      if (previous !== null && next !== previous) await fsp.writeFile(`${target}.qiaomu-backup-${randomUUID()}`, previous, { flag: "wx" });
      await fsp.writeFile(temp, next, { flag: "wx" });
      check(signal);
      const current = await fsp.readFile(target, "utf8").catch(e => { if (e.code === "ENOENT") return null; throw e; });
      if (current !== previous) throw kindleError("usb-settings");
      await fsp.rename(temp, target);
      if (await fsp.readFile(target, "utf8") !== next) throw kindleError("usb-settings");
    } finally { await fsp.unlink(temp).catch(() => {}); }
    return { paired: true, mode: "native", port: KINDLE_NATIVE_PORT, installPending: info.installed !== true };
  }
  async function prepareFile(source, name, { mode, signal, onProgress, vaultRoot } = {}) {
    check(signal);
    const plan = kindleDeliveryFormat(name, mode);
    const root = await fsp.realpath(vaultRoot), real = await fsp.realpath(source);
    if (!real.startsWith(root + path.sep)) throw kindleError("file");
    if (!plan.convert) return { path: real, name, root, cleanup: async () => {} };
    const before = await fsp.stat(real);
    if (!before.isFile() || before.size <= 0 || before.size > KINDLE_MAX_BYTES) throw kindleError("size");
    if (before.size > 64 * 1024 * 1024) throw kindleError("conversion-size");
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "qiaomu-kindle-"));
    const output = path.join(dir, "book.azw3");
    const cleanup = () => fsp.rm(dir, { recursive: true, force: true });
    try {
      onProgress?.({ phase: "convert", sent: 0, total: before.size });
      const converted = await convertEpub(await fsp.readFile(real), { signal });
      check(signal);
      if (!(converted?.bytes instanceof Uint8Array) || converted.bytes.length > KINDLE_MAX_BYTES) throw kindleError("conversion");
      await fsp.writeFile(output, converted.bytes, { flag: "wx" });
      const after = await fsp.stat(real), result = await fsp.stat(output);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw kindleError("changed");
      if (result.size <= 78 || result.size > KINDLE_MAX_BYTES) throw kindleError("conversion");
      const handle = await fsp.open(output, "r");
      try {
        const head = new Uint8Array(78); await handle.read(head, 0, head.length, 0);
        if (String.fromCharCode(...head.subarray(60, 68)) !== "BOOKMOBI") throw kindleError("conversion");
      } finally { await handle.close(); }
      return { path: output, name: plan.name, root: await fsp.realpath(dir), converted: true, engine: "embedded-azw3", stats: converted.stats, cleanup };
    } catch (error) { await cleanup(); throw error; }
  }
  return { pairNative, prepareFile };
}
