// Desktop Node access for the Calibre bridge. Same rule as ai-cli.js: no static
// Node imports, so the plugin still loads on mobile.

export function calibreNodeBuiltin(name) {
  if (typeof window !== "undefined" && window.process && typeof window.process.getBuiltinModule === "function") {
    return window.process.getBuiltinModule(name);
  }
  if (typeof window !== "undefined" && typeof window.require === "function") {
    return window.require(name);
  }
  return null;
}

export function calibreRuntime() {
  const childProcess = calibreNodeBuiltin("child_process");
  const fs = calibreNodeBuiltin("fs");
  const os = calibreNodeBuiltin("os");
  const path = calibreNodeBuiltin("path");
  if (!childProcess || !fs || !os || !path) return null;
  return { childProcess, fs, os, path };
}

export function execFileUtf8(childProcess, file, args, options = {}) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, {
      encoding: "utf8",
      timeout: options.timeout || 20000,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
      env: options.env,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}
