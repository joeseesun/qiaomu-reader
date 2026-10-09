// Desktop-only local OCR orchestration. Node builtins are resolved lazily so the
// module remains safe to bundle and load on Obsidian mobile.

const OCR_TIMEOUT_MS = 4 * 60 * 60 * 1000;

function ocrError(reason, message, extra = {}) {
  return Object.assign(new Error(message), { qiaomuReaderReason: reason, ...extra });
}

function nodeBuiltin(name) {
  if (typeof window !== "undefined" && window.process?.getBuiltinModule) return window.process.getBuiltinModule(name);
  if (typeof window !== "undefined" && typeof window.require === "function") return window.require(name);
  throw ocrError("desktop", "Local OCR requires the Obsidian desktop app");
}

function runtime() {
  return {
    childProcess: nodeBuiltin("child_process"), fs: nodeBuiltin("fs"),
    os: nodeBuiltin("os"), path: nodeBuiltin("path"), crypto: nodeBuiltin("crypto"),
  };
}

export function shouldAutoOcrPdf(pages) {
  const kinds = Array.from(pages || []);
  const text = kinds.filter((kind) => kind === "text").length;
  const scan = kinds.filter((kind) => kind === "scan").length;
  // Blank-only PDFs have nothing to recognise. A mixed document is handled by
  // --skip-text when at least half of its non-blank pages are image-only.
  return scan > 0 && scan >= text;
}

export function pdfPixelsHaveInk(data) {
  const pixels = data && data.length ? Math.floor(data.length / 4) : 0;
  if (!pixels) return false;
  let nonWhite = 0;
  for (let i = 0; i < pixels; i++) {
    const offset = i * 4;
    if (data[offset + 3] > 8 && Math.min(data[offset], data[offset + 1], data[offset + 2]) < 245) nonWhite++;
  }
  return nonWhite / pixels >= 0.002;
}

export function pdfOcrPageSummary(pages) {
  const kinds = Array.from(pages || []);
  return {
    total: kinds.length,
    text: kinds.filter((kind) => kind === "text").length,
    scan: kinds.filter((kind) => kind === "scan").length,
    blank: kinds.filter((kind) => kind === "blank").length,
  };
}

export function parseOcrProgress(line) {
  const text = String(line || "");
  const explicit = text.match(/(?:OCR|Rasterize|PDF\/A conversion).*?(\d{1,3}(?:\.\d+)?)%/i);
  const generic = text.match(/(?:^|\s)(\d{1,3}(?:\.\d+)?)%(?:\s|$)/);
  const value = Number((explicit || generic)?.[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

export function sameFileSnapshot(before, after) {
  return !!before && !!after && before.size === after.size
    && Math.round(before.mtimeMs) === Math.round(after.mtimeMs)
    && (!before.digest || before.digest === after.digest);
}


async function fileSnapshot(file, rt) {
  const [stat, bytes] = await Promise.all([rt.fs.promises.stat(file), rt.fs.promises.readFile(file)]);
  return { size: stat.size, mtimeMs: stat.mtimeMs, mode: stat.mode, digest: rt.crypto.createHash("sha256").update(bytes).digest("hex") };
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw ocrError("cancelled", "OCR was cancelled");
}

function executableCandidates(name, platform, envPath, path) {
  const ext = platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const fromPath = String(envPath || "").split(path.delimiter).filter(Boolean)
    .flatMap((dir) => ext.map((suffix) => path.join(dir, name + suffix)));
  const common = platform === "darwin"
    ? [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]
    : platform === "win32"
      ? ext.flatMap((suffix) => [
        `C:\\Program Files\\OCRmyPDF\\${name}${suffix}`,
        `C:\\Program Files\\Tesseract-OCR\\${name}${suffix}`,
      ])
      : [`/usr/local/bin/${name}`, `/usr/bin/${name}`, `/snap/bin/${name}`];
  return [...new Set([...fromPath, ...common])];
}

async function firstExecutable(name, rt) {
  const env = window.process?.env || {};
  for (const candidate of executableCandidates(name, window.process?.platform || "", env.PATH, rt.path)) {
    try { await rt.fs.promises.access(candidate, rt.fs.constants.X_OK); return candidate; }
    catch { /* try the next known location */ }
  }
  return "";
}

function terminate(child, signal = "SIGTERM") {
  if (!child || child.killed) return;
  try {
    if (window.process?.platform !== "win32" && child.pid) window.process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { try { child.kill(signal); } catch { /* already stopped */ } }
}

function spawnChecked(command, args, options = {}) {
  const rt = runtime();
  return new Promise((resolve, reject) => {
    let stderr = "", stdout = "", settled = false;
    const child = rt.childProcess.spawn(command, args, {
      env: options.env || window.process.env, shell: false, windowsHide: true,
      detached: window.process?.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort); fn(value);
    };
    const abort = () => {
      terminate(child); window.setTimeout(() => terminate(child, "SIGKILL"), 1500);
      finish(reject, ocrError("cancelled", "OCR was cancelled"));
    };
    const timer = window.setTimeout(() => {
      terminate(child); window.setTimeout(() => terminate(child, "SIGKILL"), 1500);
      finish(reject, ocrError("timeout", "OCR timed out"));
    }, options.timeoutMs || OCR_TIMEOUT_MS);
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (error) => finish(reject, ocrError(error.code === "ENOENT" ? "missing" : "process", error.message)));
    child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout = (stdout + chunk).slice(-8000); });
    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16000);
      for (const line of String(chunk).split(/[\r\n]+/)) {
        const progress = parseOcrProgress(line);
        if (progress != null) options.onProgress?.(progress, line);
        options.onStderrLine?.(line);
      }
    });
    child.on("close", (code) => code === 0
      ? finish(resolve, { stdout, stderr })
      : finish(reject, ocrError("process", `OCR exited with status ${code}`, { stderr: stderr.slice(-2000) })));
  });
}

export async function probePdfOcr() {
  const rt = runtime();
  const ocrmypdf = await firstExecutable("ocrmypdf", rt);
  if (!ocrmypdf) throw ocrError("ocrmypdf-missing", "ocrmypdf was not found");
  let english = null, chinese = null;
  for (const tesseract of executableCandidates("tesseract", window.process?.platform || "", window.process?.env?.PATH, rt.path)) {
    try {
      await rt.fs.promises.access(tesseract, rt.fs.constants.X_OK);
      const env = { ...window.process.env, PATH: [rt.path.dirname(tesseract), rt.path.dirname(ocrmypdf), window.process.env.PATH || ""].join(rt.path.delimiter) };
      const langs = await spawnChecked(tesseract, ["--list-langs"], { env, timeoutMs: 15000 });
      const available = new Set(`${langs.stdout}\n${langs.stderr}`.split(/\s+/));
      if (available.has("eng")) english ||= { tesseract, env };
      if (available.has("eng") && available.has("chi_sim")) { chinese = { tesseract, env }; break; }
    } catch { /* inspect the next installation */ }
  }
  const selected = chinese || english;
  if (!selected) throw ocrError("tesseract-missing", "Tesseract with English language data was not found");
  return { ocrmypdf, ...selected, language: chinese ? "chi_sim+eng" : "eng" };
}

export async function replacePdfAtomically(sourcePath, preparedPath, before, validatePdf, signal) {
  const rt = runtime();
  throwIfAborted(signal);
  const current = await fileSnapshot(sourcePath, rt);
  if (!sameFileSnapshot(before, current)) throw ocrError("source-changed", "The PDF changed while OCR was running");
  const nonce = rt.crypto.randomBytes(8).toString("hex");
  const staged = `${sourcePath}.qiaomu-ocr-${nonce}.tmp`;
  const recovery = `${sourcePath}.qiaomu-ocr-${nonce}.recovery`;
  await rt.fs.promises.copyFile(preparedPath, staged, rt.fs.constants.COPYFILE_EXCL);
  try {
    await validatePdf(staged, { signal });
    throwIfAborted(signal);
    // Re-check immediately before entering the atomic replacement window.
    const finalSource = await fileSnapshot(sourcePath, rt);
    if (!sameFileSnapshot(before, finalSource)) throw ocrError("source-changed", "The PDF changed while OCR was running");
    throwIfAborted(signal);
    // Keep a recovery inode while replacing the destination with one atomic
    // rename. The source path is never deliberately made absent, and a failed
    // rename leaves it untouched.
    try { await rt.fs.promises.link(sourcePath, recovery); }
    catch { await rt.fs.promises.copyFile(sourcePath, recovery, rt.fs.constants.COPYFILE_EXCL); }
    await rt.fs.promises.chmod(staged, finalSource.mode);
    throwIfAborted(signal);
    await rt.fs.promises.rename(staged, sourcePath);
    await rt.fs.promises.unlink(recovery).catch(() => {});
  } catch (error) {
    await rt.fs.promises.unlink(staged).catch(() => {});
    await rt.fs.promises.unlink(recovery).catch(() => {});
    throw error;
  }
}

export async function runPdfOcr({ sourcePath, signal, onProgress, validatePdf, pageCount = 0 }) {
  const rt = runtime();
  const tools = await probePdfOcr();
  const before = await fileSnapshot(sourcePath, rt);
  const tempDir = await rt.fs.promises.mkdtemp(rt.path.join(rt.os.tmpdir(), "qiaomu-reader-ocr-"));
  const outputPath = rt.path.join(tempDir, "output.pdf");
  const pagesSeen = new Set();
  let lastProgress = 0;
  const report = (value, line) => {
    lastProgress = Math.max(lastProgress, Number(value) || 0);
    onProgress?.(lastProgress, line);
  };
  try {
    await spawnChecked(tools.ocrmypdf, [
      "-v", "1", "-l", tools.language, "--skip-text", "--output-type", "pdf", "--optimize", "0",
      "--pdf-renderer", "sandwich", "--jobs", String(Math.max(1, Math.min(8, rt.os.cpus().length || 1))),
      sourcePath, outputPath,
    ], {
      env: tools.env, signal, onProgress: report,
      onStderrLine: (line) => {
        const match = String(line).match(/^\s*(\d+)\s+Rasteriz(?:e|ing)\b/i);
        if (!match || !pageCount) return;
        pagesSeen.add(Number(match[1]));
        report(Math.min(95, Math.round(pagesSeen.size / pageCount * 90)), line);
      },
    });
    if (signal?.aborted) throw ocrError("cancelled", "OCR was cancelled");
    const verified = await validatePdf(outputPath, { signal });
    throwIfAborted(signal);
    if (!verified?.hasText) throw ocrError("no-text", "OCR completed but produced no usable text layer");
    await replacePdfAtomically(sourcePath, outputPath, before, validatePdf, signal);
    return verified;
  } finally {
    await rt.fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function createPdfOcrQueue(run = runPdfOcr) {
  let tail = Promise.resolve();
  const tasks = new Map();
  return {
    subscribe(key, options) {
      let task = tasks.get(key);
      if (!task) {
        const controller = new AbortController();
        task = { controller, subscribers: new Set(), listeners: new Set() };
        const notify = (...args) => { for (const listener of task.listeners) listener(...args); };
        task.promise = tail.then(() => run({ ...options, onProgress: notify, signal: controller.signal }))
          .finally(() => tasks.delete(key));
        tail = task.promise.catch(() => {});
        tasks.set(key, task);
      }
      const token = {};
      task.subscribers.add(token);
      if (options.onProgress) task.listeners.add(options.onProgress);
      let released = false;
      return {
        promise: task.promise,
        release() {
          if (released) return;
          released = true; task.subscribers.delete(token); task.listeners.delete(options.onProgress);
          if (!task.subscribers.size && tasks.get(key) === task) task.controller.abort();
        },
      };
    },
    enqueue(key, options) {
      if (tasks.has(key)) return tasks.get(key).promise;
      const controller = new AbortController();
      const relay = () => controller.abort();
      options.signal?.addEventListener("abort", relay, { once: true });
      const task = { subscribers: new Set() };
      task.promise = tail.then(() => run({ ...options, signal: controller.signal }))
        .finally(() => { options.signal?.removeEventListener("abort", relay); tasks.delete(key); });
      tail = task.promise.catch(() => {});
      task.controller = controller; tasks.set(key, task);
      return task.promise;
    },
    cancel(key) { tasks.get(key)?.controller.abort(); },
    cancelAll() { for (const task of tasks.values()) task.controller.abort(); },
    has(key) { return tasks.has(key); },
    drain() { return tail; },
  };
}
