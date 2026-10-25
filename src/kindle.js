import { Platform } from "obsidian";
import { isKindleBook, kindleConnection, kindleError, kindleMode, KINDLE_NATIVE_PORT, KINDLE_PORT } from "./kindle-config.js";

export function createKindleController(plugin) {
  const aborters = new Set(), modals = new Set();
  let disposed = false, upload = null, loadedTransport;
  const transport = () => { if (!Platform.isDesktopApp) throw kindleError("key"); return loadedTransport ||= import("./kindle-transport.js").then(module => module.loadKindleTransport()); };
  const alive = () => { if (disposed || plugin._unloading) throw kindleError("cancelled"); };
  const config = () => ({ ...(plugin.settings.kindle || {}) });
  const save = async next => {
    alive(); const previous = plugin.settings.kindle;
    plugin.settings.kindle = next;
    if (await plugin._saveLocalData() === false) {
      plugin.settings.kindle = previous; throw kindleError("save");
    }
    alive();
  };
  const run = async (fn, signal) => {
    alive();
    const controller = new AbortController(); aborters.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    try { return await fn(controller.signal); }
    finally { signal?.removeEventListener("abort", abort); aborters.delete(controller); }
  };
  const secret = async () => {
    const id = config().secretId;
    const value = id && plugin.app.secretStorage?.getSecret(id);
    if (!value) throw kindleError("key");
    return value;
  };
  const controller = {
    config, isBook: isKindleBook,
    isPaired: () => !!config().paired && !!config().secretId,
    async setMode(mode) {
      alive();
      if (!["native", "koreader"].includes(mode)) throw kindleError("format");
      if (upload || aborters.size) throw kindleError("busy");
      const previous = config(), oldMode = kindleMode(previous.mode);
      if (mode === oldMode) return;
      const profiles = { ...previous.profiles, [oldMode]: { host: previous.host || "", port: previous.port || (oldMode === "native" ? KINDLE_NATIVE_PORT : KINDLE_PORT), fingerprint: previous.fingerprint || "", paired: !!previous.paired } };
      const target = profiles[mode] || { host: previous.host || "", port: mode === "native" ? KINDLE_NATIVE_PORT : KINDLE_PORT, paired: false, fingerprint: "" };
      await save({ ...previous, ...target, mode, profiles });
    },
    trackModal(modal, open) { if (open) modals.add(modal); else modals.delete(modal); },
    async ensureKey() {
      alive();
      if (!Platform.isDesktopApp || !plugin.app.secretStorage) throw kindleError("key");
      const { createKindleKey, kindlePublicKey } = await transport(); alive();
      const previous = config();
      const existing = previous.secretId && plugin.app.secretStorage.getSecret(previous.secretId);
      if (existing) {
        try { return kindlePublicKey(existing); } catch { /* Explicit USB repair can replace a missing or invalid local key. */ }
      }
      const pair = createKindleKey();
      const id = `qiaomu-reader-kindle-${window.crypto.randomUUID()}`;
      plugin.app.secretStorage.setSecret(id, pair.private);
      if (plugin.app.secretStorage.getSecret(id) !== pair.private) throw kindleError("key");
      try { await save({ ...previous, secretId: id, paired: false, fingerprint: "", profiles: {} }); }
      catch (error) { plugin.app.secretStorage.setSecret(id, ""); throw error; }
      return pair.public;
    },
    async pairUsb(candidate, signal) {
      const key = await controller.ensureKey();
      const { pairKindleUsb } = await transport();
      return run(async abortSignal => {
        const previous = config();
        const mode = kindleMode(previous.mode);
        const result = await pairKindleUsb(candidate, key, { signal: abortSignal, port: previous.port || (mode === "native" ? KINDLE_NATIVE_PORT : KINDLE_PORT), mode });
        await save({ ...previous, paired: true, fingerprint: "", installPending: !!result?.installPending });
        return { paired: true, ...result };
      }, signal);
    },
    async findUsb() { alive(); return (await transport()).findKindleUsb({ mode: kindleMode(config().mode) }); },
    async discover(signal) {
      const key = await secret(), { discoverKindle } = await transport();
      return run(abortSignal => discoverKindle(config(), key, { signal: abortSignal }), signal);
    },
    async test(raw, signal) {
      const connection = kindleConnection(raw);
      const key = await secret(), { checkKindleConnection } = await transport();
      return run(async abortSignal => {
        const current = config();
        // A previously paired host always retains its trusted fingerprint.
        const fingerprint = current.fingerprint || "";
        const result = await checkKindleConnection({ ...connection, fingerprint }, key, { signal: abortSignal });
        await save({ ...current, ...connection, paired: true, installPending: false, fingerprint: result.fingerprint });
        return result;
      }, signal);
    },
    async send(file, onProgress, signal) {
      alive();
      if (!isKindleBook(file)) throw kindleError("format");
      if (upload) { if (upload.path === file.path) return upload.promise; throw kindleError("busy"); }
      const snapshot = { path: file.path, name: file.name };
      const job = { path: snapshot.path }; upload = job;
      job.promise = run(async abortSignal => {
        let current = config();
        if (!current.paired || !current.host) throw kindleError("key");
        const { checkKindleConnection, sendKindleFile, prepareKindleFile, refreshKindleLibrary } = await transport(), key = await secret();
        const connection = kindleConnection(current);
        const checked = await checkKindleConnection(connection, key, { signal: abortSignal });
        if (!current.fingerprint) {
          current = { ...current, fingerprint: checked.fingerprint }; await save(current);
        }
        alive();
        const selected = plugin.app.vault.getAbstractFileByPath(snapshot.path);
        if (selected !== file) throw kindleError("changed");
        const adapter = plugin.app.vault.adapter;
        if (!adapter.getFullPath || !adapter.getBasePath) throw kindleError("file");
        let prepared;
        try {
          if (kindleMode(current.mode) === "native") prepared = await prepareKindleFile(adapter.getFullPath(snapshot.path), snapshot.name, { mode: "native", signal: abortSignal, onProgress, vaultRoot: adapter.getBasePath() });
          const receipt = await sendKindleFile(kindleConnection(current), key, prepared?.path || adapter.getFullPath(snapshot.path), prepared?.name || snapshot.name, { signal: abortSignal, onProgress, vaultRoot: prepared?.root || adapter.getBasePath() });
          if (kindleMode(current.mode) === "native") {
            onProgress?.({ phase: "index", sent: receipt.bytes, total: receipt.bytes });
            try { Object.assign(receipt, await refreshKindleLibrary(kindleConnection(current), key, { signal: abortSignal })); }
            catch { receipt.scanRequested = false; }
          }
          return { ...receipt, mode: kindleMode(current.mode), converted: !!prepared?.converted, ...(prepared?.engine ? { conversionEngine: prepared.engine } : {}) };
        } finally { await prepared?.cleanup().catch(() => {}); }
      }, signal).finally(() => { if (upload === job) upload = null; });
      return job.promise;
    },
    dispose() {
      disposed = true;
      for (const a of aborters) a.abort(); aborters.clear();
      for (const m of [...modals]) m.close(); modals.clear();
    },
  };
  return controller;
}
