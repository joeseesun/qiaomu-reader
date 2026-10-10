import { accessToken } from "./services/provider-auth.js";
import { apiBaseUrl, apiProtocol, permitsEmptyKey } from "./services/api-providers.js";
import { apiFetch, apiStatusError } from "./services/api-transport.js";
import { accountObject as object } from "./services/account-json.js";
import { chatgptBody, completeChatGPTStream } from "./services/chatgpt-transport.js";
function listedModels(raw, chatgpt = false) {
  const body = object(raw), entries = chatgpt ? body.models ?? body.data : body.data;
  if (!Array.isArray(entries)) throw new Error("Invalid model list");
  const found = /* @__PURE__ */ new Map();
  for (const value of entries) {
    if (!value || typeof value !== "object") continue;
    const item = object(value), id = chatgpt ? item.slug ?? item.id : item.id;
    if (typeof id !== "string" || !id.trim() || chatgpt && item.visibility !== "list") continue;
    const name = item.display_name ?? item.name;
    const levels = item.supported_reasoning_levels ?? item.reasoning_efforts;
    const efforts = Array.isArray(levels) ? levels.map((v) => typeof v === "string" ? v : v && typeof v === "object" ? object(v).effort : null).filter((v) => typeof v === "string" && /^[a-z0-9_-]{1,32}$/i.test(v)) : [];
    found.set(id, { id, name: typeof name === "string" ? name : void 0, efforts });
  }
  return [...found.values()];
}
async function connectionToken(connection, raw, store) {
  const key = await accessToken(connection, raw, store);
  if (!key && !permitsEmptyKey(connection) && connection.provider !== "custom") throw new Error("API key required");
  return key;
}
async function discoverModels(connection, raw, store, signal) {
  const key = await connectionToken(connection, raw, store);
  const response = await apiFetch(`${apiBaseUrl(connection)}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2e4)]) : AbortSignal.timeout(2e4) });
  if (!response.ok) throw apiStatusError(response.status);
  return listedModels(await response.json(), connection.provider === "chatgpt");
}
async function completeChatGPT(connection, store, messages, options = {}) {
  if (connection.provider !== "chatgpt" || apiProtocol(connection) !== "openai-responses") throw new Error("Invalid ChatGPT connection");
  const key = await connectionToken(connection, "", store);
  const response = await apiFetch(`${apiBaseUrl(connection)}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: options.signal,
    body: chatgptBody(JSON.stringify({ model: connection.model, input: messages, ...options.effort ? { reasoning: { effort: options.effort } } : {} }))
  });
  if (!response.ok) throw apiStatusError(response.status);
  const reader = completeChatGPTStream(response).body?.getReader();
  if (!reader) throw new Error("Empty response");
  const decoder = new TextDecoder();
  let buffer = "", answer = "";
  const line = (value) => {
    if (!value.startsWith("data:")) return;
    const raw = value.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const event = object(JSON.parse(raw));
    if (["error", "response.failed", "response.incomplete"].includes(String(event.type))) throw new Error("Response failed or incomplete");
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      answer += event.delta;
      options.onDelta?.(event.delta, answer);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const item of lines) line(item);
      if (done) {
        if (buffer) line(buffer);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
  if (!answer.trim()) throw new Error("No text returned");
  return answer;
}
export {
  completeChatGPT,
  connectionToken,
  discoverModels,
  listedModels
};
