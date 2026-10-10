import { requestUrl } from "obsidian";
import { getRuntimeRequire } from "./runtime-require.js";
import { connectionText as t } from "../i18n/connection.js";
function nativeNet() {
  const require2 = getRuntimeRequire();
  if (!require2) return null;
  try {
    const electron = require2("electron");
    return electron.net ?? electron.remote?.net ?? null;
  } catch {
    return null;
  }
}
function nativeApiFetch(net, url, init) {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const req = net.request({ url, method: init.method ?? "GET", redirect: "manual", useSessionCookies: false });
    let controller;
    let done = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      window.clearTimeout(timer);
    };
    const fail = (error) => {
      if (done) return;
      done = true;
      cleanup();
      controller?.error(error);
      reject(error);
      req.abort();
    };
    const abort = () => fail(signal?.reason ?? new DOMException(t("cancelled"), "AbortError"));
    let timer = window.setTimeout(() => fail(new DOMException(t("timeout"), "TimeoutError")), 6e4);
    const tick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fail(new DOMException(t("timeout"), "TimeoutError")), 6e4);
    };
    signal?.addEventListener("abort", abort, { once: true });
    req.on("redirect", () => fail(new Error(t("redirect"))));
    req.on("error", () => fail(new Error(t("network"))));
    req.on("response", (res) => {
      if (done) return;
      if (res.statusCode >= 300 && res.statusCode < 400) {
        fail(new Error(t("redirect")));
        return;
      }
      try {
        tick();
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const body = new ReadableStream({
          start(c) {
            controller = c;
          },
          cancel() {
            if (!done) {
              done = true;
              cleanup();
              req.abort();
            }
          }
        });
        res.on("end", () => {
          if (!done) {
            done = true;
            cleanup();
            controller.close();
          }
        });
        res.on("error", () => fail(new Error(t("network"))));
        res.on("aborted", () => fail(new Error(t("network"))));
        res.on("close", () => {
          if (!done) fail(new Error(t("network")));
        });
        res.on("data", (chunk) => {
          if (!done) {
            tick();
            controller.enqueue(new Uint8Array(chunk));
          }
        });
        resolve(new Response([204, 205, 304].includes(res.statusCode) ? null : body, { status: res.statusCode, headers }));
      } catch {
        fail(new Error(t("invalidResponse")));
      }
    });
    try {
      new Headers(init.headers).forEach((value, key) => req.setHeader(key, value));
      if (typeof init.body === "string") req.write(init.body);
      else if (init.body) throw new Error("Unsupported API request body");
      req.end();
    } catch (error) {
      fail(error);
    }
  });
}
async function bufferedApiFetch(url, init) {
  const signal = init.signal;
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      settled = true;
      cleanup();
      reject(signal?.reason ?? new DOMException(t("cancelled"), "AbortError"));
    };
    const timer = window.setTimeout(() => {
      settled = true;
      cleanup();
      reject(new DOMException(t("timeout"), "TimeoutError"));
    }, 12e4);
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    signal?.addEventListener("abort", abort, { once: true });
    void Promise.resolve().then(() => {
      signal?.throwIfAborted();
      return requestUrl({
        url,
        method: init.method ?? "GET",
        headers: (() => {
          const result = {};
          new Headers(init.headers).forEach((v, k) => {
            result[k] = v;
          });
          return result;
        })(),
        ...typeof init.body === "string" ? { body: init.body } : {},
        throw: false
      });
    }).then((res) => {
      if (settled) return;
      cleanup();
      resolve(new Response([204, 205, 304].includes(res.status) ? null : res.arrayBuffer, { status: res.status, headers: res.headers }));
    }).catch(() => {
      cleanup();
      if (!settled) reject(signal?.aborted ? signal.reason : new Error(t("network")));
    });
  });
}
async function apiFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input));
  if (url.username || url.password || url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("API requires HTTPS (HTTP is allowed only on localhost)");
  const options = { ...init, method: init.method ?? request?.method, headers: init.headers ?? request?.headers, signal: init.signal ?? request?.signal };
  if (request && init.body === void 0 && !["GET", "HEAD"].includes(options.method ?? "GET")) options.body = await request.text();
  const headers = new Headers(options.headers);
  headers.delete("origin");
  headers.delete("referer");
  headers.delete("cookie");
  if (!headers.has("user-agent")) headers.set("User-Agent", "QiaomuAgent/1.0");
  options.headers = headers;
  const net = nativeNet();
  const response = await (net ? nativeApiFetch(net, url.href, options) : bufferedApiFetch(url.href, options));
  if (response.headers.get("cf-mitigated") === "challenge" || response.headers.get("content-type")?.includes("text/html")) {
    await response.body?.cancel();
    throw new Error(t(response.headers.get("cf-mitigated") === "challenge" || response.headers.get("server")?.toLowerCase().includes("cloudflare") ? "challenge" : "invalidResponse"));
  }
  return response;
}
function apiStatusError(status) {
  const key = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "notFound" : status === 429 ? "rateLimit" : status >= 500 ? "server" : status >= 300 && status < 400 ? "redirect" : "http";
  return new Error(`${t(key)} (HTTP ${status})`);
}
function connectionError(error) {
  if (error instanceof SyntaxError) return t("invalidResponse");
  if (error instanceof Error && error.name === "TimeoutError") return t("timeout");
  if (error instanceof Error && error.name === "AbortError") return t("cancelled");
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed/i.test(message) ? t("network") : message.replace(/\b(?:sk-|Bearer\s+)[^\s"',;]+/gi, "[redacted]");
}
export {
  apiFetch,
  apiStatusError,
  connectionError,
  nativeApiFetch
};
