import { APP_NAME, APP_ID } from "../identity.js";
import { apiFetch } from "./api-transport.js";
import { accountText as t } from "../i18n/accounts.js";
import { listenOAuth } from "./oauth-loopback.js";
import { permitsEmptyKey } from "./api-providers.js";
import { accountObject as object, accountString as requiredString, accountExpiry } from "./account-json.js";
const issuer = "https://auth.openai.com";
const tokenUrl = `${issuer}/api/accounts/oauth/token`;
const resource = "https://api.openai.com/v1";
const scope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const sessions = /* @__PURE__ */ new Set();
function cancelAccountLogins() {
  for (const c of sessions) c.abort();
  sessions.clear();
}
function loginKind(provider) {
  return ["chatgpt", "openrouter", "tokendance"].includes(provider) ? provider : void 0;
}
const b64 = (bytes2) => btoa(String.fromCharCode(...bytes2)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const randomOAuth = () => b64(crypto.getRandomValues(new Uint8Array(48)));
async function pkceChallenge(verifier) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}
async function json(url, init = {}) {
  const response = await apiFetch(url, { ...init, redirect: "error", signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(3e4)]) : AbortSignal.timeout(3e4) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 400 || response.status === 401 ? t("expired") : t("failed"));
  }
  return object(await response.json());
}
async function token(body, signal) {
  return json(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString(), signal });
}
function readAccount(raw) {
  try {
    const c = object(JSON.parse(raw));
    if (c.version !== 1 || typeof c.access !== "string" || typeof c.refresh !== "string" || typeof c.expires !== "number" || !Number.isFinite(c.expires) || !Array.isArray(c.scopes) || !c.scopes.every((s) => typeof s === "string")) return null;
    return {
      version: 1,
      clientId: requiredString(c.clientId),
      subject: requiredString(c.subject),
      access: c.access,
      refresh: c.refresh,
      expires: c.expires,
      scopes: c.scopes.filter((s) => typeof s === "string"),
      email: typeof c.email === "string" ? c.email : "",
      hostId: typeof c.hostId === "string" ? c.hostId : "",
      idToken: typeof c.idToken === "string" ? c.idToken : ""
    };
  } catch {
    return null;
  }
}
async function validateIdentity(jwt, clientId, nonce, signal) {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) throw new Error();
    const header = object(JSON.parse(new TextDecoder().decode(bytes(parts[0]))));
    const claims = object(JSON.parse(new TextDecoder().decode(bytes(parts[1]))));
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error();
    const discovery = await json(`${issuer}/.well-known/openid-configuration`, { signal });
    const jwksUrl = new URL(requiredString(discovery.jwks_uri));
    if (jwksUrl.origin !== issuer || discovery.issuer !== issuer) throw new Error();
    const jwks = await json(jwksUrl.href, { signal });
    if (!Array.isArray(jwks.keys)) throw new Error();
    const jwk = jwks.keys.map((key2) => object(key2)).find((key2) => key2.kid === header.kid && key2.kty === "RSA" && (!key2.use || key2.use === "sig") && (!key2.alg || key2.alg === "RS256"));
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: requiredString(jwk.n), e: requiredString(jwk.e), alg: "RS256", use: "sig" }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error();
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audience.includes(clientId) || audience.length > 1 && claims.azp !== clientId || claims.nonce !== nonce || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1e3 || typeof claims.sub !== "string" || !claims.sub) throw new Error();
    if (claims.nbf !== void 0 && (typeof claims.nbf !== "number" || claims.nbf > Date.now() / 1e3 + 60)) throw new Error();
    return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  } catch {
    signal.throwIfAborted();
    throw new Error(t("invalid"));
  }
}
function authorizationUrl(kind, redirect, state, challenge, nonce, hostId, existing) {
  if (kind === "chatgpt") return `${issuer}/api/accounts/authorize?${new URLSearchParams({
    client_id: existing?.clientId || "dynamic_agent_client",
    ...existing ? {} : { agent_name_hint: APP_NAME },
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirect,
    scope,
    resource,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256"
  })}`;
  const query = new URLSearchParams({ callback_url: redirect, code_challenge: challenge, code_challenge_method: "S256" });
  if (kind === "openrouter") {
    query.set("state", state);
    query.set("key_label", APP_NAME);
  } else {
    query.set("app_url", `https://github.com/joeseesun/${APP_ID}`);
    query.set("key_name", APP_NAME);
  }
  return `${kind === "openrouter" ? "https://openrouter.ai" : "https://tokendance.space"}/auth?${query}`;
}
async function signInAccount(kind, store, openBrowser, signal, existing) {
  const controller = new AbortController();
  sessions.add(controller);
  const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(10 * 6e4)]);
  let listener;
  try {
    const verifier = randomOAuth(), state = randomOAuth(), nonce = randomOAuth();
    let hostId = store.getSecret(`${APP_ID}-oauth-host`);
    if (!hostId) {
      hostId = `urn:uuid:${crypto.randomUUID()}`;
      store.setSecret(`${APP_ID}-oauth-host`, hostId);
    }
    listener = await listenOAuth(state, combined, kind === "tokendance");
    const challenge = await pkceChallenge(verifier);
    combined.throwIfAborted();
    openBrowser(authorizationUrl(kind, listener.redirect, state, challenge, nonce, hostId, existing));
    const back = await listener.result;
    combined.throwIfAborted();
    const code = back.searchParams.get("code");
    if (!code) throw new Error(t("failed"));
    if (kind !== "chatgpt") {
      const data2 = await json(kind === "openrouter" ? "https://openrouter.ai/api/v1/auth/keys" : "https://tokendance.space/portal/api/v1/auth/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
        signal: combined
      });
      combined.throwIfAborted();
      if (typeof data2.key !== "string" || !data2.key) throw new Error(t("failed"));
      return { secret: data2.key };
    }
    const clientId = back.searchParams.get("client_id") || existing?.clientId;
    if (!clientId || clientId === "dynamic_agent_client" || existing && clientId !== existing.clientId) throw new Error(t("invalid"));
    const data = await token({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: listener.redirect, resource }, combined);
    const identity = await validateIdentity(requiredString(data.id_token), clientId, nonce, combined);
    if (existing && identity.sub !== existing.subject) throw new Error(t("invalid"));
    const scopes = typeof data.scope === "string" ? data.scope.split(/\s+/) : [];
    if (!scopes.includes("chatgpt.tokens.use.direct")) throw new Error(t("unsupported"));
    combined.throwIfAborted();
    const creds = { version: 1, clientId, subject: identity.sub, email: identity.email, hostId, access: requiredString(data.access_token), refresh: requiredString(data.refresh_token), idToken: requiredString(data.id_token), expires: accountExpiry(data.expires_in), scopes };
    return { secret: JSON.stringify(creds), label: identity.email || "ChatGPT" };
  } finally {
    listener?.close();
    sessions.delete(controller);
  }
}
const refreshing = /* @__PURE__ */ new Map();
const pending = /* @__PURE__ */ new Map();
async function accessToken(connection, raw, store) {
  if (connection.provider !== "chatgpt") return raw || (connection.provider === "magpie" && permitsEmptyKey(connection) ? "magpie-qiaomu-agent" : "");
  if (connection.baseUrl !== resource) throw new Error(t("invalid"));
  if (!store) throw new Error(t("expired"));
  const key = connection.secretId;
  const run = async () => {
    let saved = store.getSecret(key) ?? "";
    const unsaved = pending.get(key);
    if (unsaved) {
      if (saved === unsaved.before) {
        store.setSecret(key, unsaved.after);
        saved = unsaved.after;
      }
      pending.delete(key);
    }
    const creds = readAccount(saved);
    if (!creds?.access || !creds.refresh) throw new Error(t("expired"));
    if (creds.expires > Date.now() + 18e4) return creds.access;
    const data = await token({ grant_type: "refresh_token", client_id: creds.clientId, refresh_token: creds.refresh, resource });
    if (typeof data.access_token !== "string" || !data.access_token) throw new Error(t("expired"));
    if (store.getSecret(key) !== saved) throw new Error(t("expired"));
    const scopes = typeof data.scope === "string" ? data.scope.split(/\s+/) : creds.scopes;
    if (!scopes.includes("chatgpt.tokens.use.direct")) throw new Error(t("unsupported"));
    const next = JSON.stringify({ ...creds, access: data.access_token, refresh: data.refresh_token === void 0 ? creds.refresh : requiredString(data.refresh_token), scopes, expires: accountExpiry(data.expires_in) });
    pending.set(key, { before: saved, after: next });
    store.setSecret(key, next);
    pending.delete(key);
    return data.access_token;
  };
  let promise = refreshing.get(key);
  if (!promise) {
    promise = (async () => typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request(`qa-oauth-${key}`, run) : await run())().finally(() => refreshing.delete(key));
    refreshing.set(key, promise);
  }
  return promise;
}
async function signOutAccount(id, store) {
  const saved = store.getSecret(id) ?? "", creds = readAccount(saved);
  store.setSecret(id, creds ? JSON.stringify({ ...creds, access: "", refresh: "", idToken: "", expires: 0 }) : "");
  pending.delete(id);
  let revoked = false;
  try {
    if (creds?.refresh) {
      const discovery = await json(`${issuer}/.well-known/openid-configuration`);
      const url = new URL(requiredString(discovery.revocation_endpoint));
      if (url.origin !== issuer) throw new Error();
      const response = await apiFetch(url.href, { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: creds.refresh, token_type_hint: "refresh_token", client_id: creds.clientId }).toString(), signal: AbortSignal.timeout(15e3) });
      revoked = response.ok;
      await response.body?.cancel();
    } else revoked = true;
  } catch {
    // Keep the documented fallback; callers surface failure where required.
  }
  return revoked;
}
export {
  accessToken,
  authorizationUrl,
  cancelAccountLogins,
  loginKind,
  pkceChallenge,
  randomOAuth,
  readAccount,
  signInAccount,
  signOutAccount,
  validateIdentity
};
