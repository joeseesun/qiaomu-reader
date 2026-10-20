import { apiFetch } from "./api-transport.js";
import { permitsEmptyKey, validateApiUrl } from "./api-providers.js";
import { accountText as t } from "../i18n/accounts.js";
import { getRuntimeRequire } from "./runtime-require.js";
import { accountObject } from "./account-json.js";
const MAGPIE_BASE = "http://127.0.0.1:3425/v1";
async function magpieAddress() {
  const require2 = getRuntimeRequire();
  if (!require2) return MAGPIE_BASE;
  try {
    const fs = require2("node:fs/promises");
    const os = require2("node:os");
    const path = require2("node:path");
    const runtime = require2("node:process");
    const root = runtime.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const config = accountObject(JSON.parse(await fs.readFile(path.join(root, "magpie", "settings.json"), "utf8")));
    if (typeof config.port === "number" && Number.isInteger(config.port) && config.port > 0 && config.port < 65536) return `http://127.0.0.1:${config.port}/v1`;
  } catch {
    // Keep the documented fallback; callers surface failure where required.
  }
  return MAGPIE_BASE;
}
async function detectMagpie(base, key, signal) {
  const url = new URL(validateApiUrl(base));
  const local = permitsEmptyKey({ provider: "magpie", baseUrl: base, model: "", secretId: "" });
  if (!key && !local) throw new Error(t("gatewayKeyRequired"));
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}/api/hello`;
  try {
    const response = await apiFetch(url.href, { headers: { Authorization: `Bearer ${key || "magpie-qiaomu-agent"}` }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(5e3)]) });
    if (!response.ok) throw new Error();
    const data = accountObject(await response.json());
    if (data.name !== "magpie") throw new Error();
    return typeof data.version === "string" ? data.version : "";
  } catch {
    signal.throwIfAborted();
    throw new Error(t("notMagpie"));
  }
}
export {
  MAGPIE_BASE,
  detectMagpie,
  magpieAddress
};
