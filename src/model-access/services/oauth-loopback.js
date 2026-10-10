import { getRuntimeRequire } from "./runtime-require.js";
import { accountText as t } from "../i18n/accounts.js";
async function listenOAuth(state, signal, tokenDance = false) {
  const require2 = getRuntimeRequire();
  if (!require2) throw new Error(t("desktop"));
  const http = require2("node:http");
  signal.throwIfAborted();
  let resolve, reject;
  const result = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  void result.catch(() => {
  });
  let redirect = "", settled = false;
  const close = () => {
    server?.close();
    server?.closeAllConnections();
    signal.removeEventListener("abort", abort);
  };
  const fail = (error) => {
    if (!settled) {
      settled = true;
      reject(error);
    }
    close();
  };
  const abort = () => fail(signal.reason);
  const server = http.createServer((req, res) => {
    const invalid = () => {
      res.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end("Invalid callback");
    };
    if (!redirect) {
      invalid();
      return;
    }
    const expected = new URL(redirect);
    let url;
    try {
      url = new URL(req.url ?? "/", expected.origin);
    } catch {
      invalid();
      return;
    }
    if (req.method !== "GET" || req.headers.host !== expected.host || url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== state || settled) {
      invalid();
      return;
    }
    settled = true;
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'" });
    res.end(t("complete"));
    res.once("finish", close);
    if (url.searchParams.has("error") || url.searchParams.getAll("code").length !== 1) reject(new Error(t("failed")));
    else resolve(url);
  });
  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", rej);
      res();
    });
  }).catch((error) => {
    fail(error);
    throw error;
  });
  const port = server.address().port;
  redirect = `http://127.0.0.1:${port}/auth/callback${tokenDance ? `?state=${encodeURIComponent(state)}` : ""}`;
  server.on("error", fail);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return { redirect, result, close };
}
export {
  listenOAuth
};
