// Provider metadata lives outside the settings UI so endpoints, model aliases
// and help links can be reviewed and updated without touching reader logic.
export const AI_PROVIDER_CATEGORIES = [
  { id: "cli", label: "local-cli-accounts-no-api-key" },
  { id: "china", label: "chinese-model-providers" },
  { id: "aggregator", label: "model-aggregators" },
  { id: "international", label: "international-providers" },
  { id: "local", label: "local-models" },
  { id: "advanced", label: "advanced-2" },
];

export const AI_PROVIDERS = {
  "codex-cli": {
    label: "Codex CLI",
    category: "cli",
    transport: "cli",
    needsKey: false,
    binary: "codex",
    model: "",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4-mini"],
    desktopOnly: true,
    description: "use-the-local-codex-chatgpt-sign-in-without-an-additional-api-ke",
  },
  "claude-cli": {
    label: "Claude Code CLI",
    category: "cli",
    transport: "cli",
    needsKey: false,
    binary: "claude",
    model: "",
    models: ["haiku", "sonnet", "opus"],
    desktopOnly: true,
    description: "use-the-local-claude-code-sign-in-without-an-additional-api-key",
  },
  "grok-cli": {
    label: "Grok CLI",
    category: "cli",
    transport: "cli",
    needsKey: false,
    binary: "grok",
    model: "",
    models: ["grok-4.6", "grok-4.5"],
    desktopOnly: true,
    description: "use-the-local-grok-sign-in-without-an-additional-api-key",
  },
  "kimi-cli": {
    label: "Kimi Code CLI",
    category: "cli",
    transport: "cli",
    needsKey: false,
    binary: "kimi",
    model: "",
    models: [],
    desktopOnly: true,
    description: "use-the-local-sign-in-through-kimi-code-cli-s-built-in-acp",
  },
  "zcode-cli": {
    label: "ZCode CLI",
    category: "cli",
    transport: "cli",
    needsKey: false,
    binary: "zcode-acp",
    model: "",
    models: [],
    desktopOnly: true,
    description: "connect-the-local-zcode-sign-in-through-the-community-zcode-acp",
  },
  deepseek: {
    label: "DeepSeek",
    category: "china",
    needsKey: true,
    base: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    description: "official-deepseek-api-recommended-for-chinese-reading",
    recommended: true,
    supportsThinking: true,
  },
  kimi: {
    label: "Kimi（Moonshot）",
    category: "china",
    needsKey: true,
    base: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
    models: ["kimi-k2.6"],
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    description: "official-moonshot-kimi-api",
    recommended: true,
  },
  qwen: {
    label: "qwen-alibaba-model-studio",
    category: "china",
    needsKey: true,
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
    apiKeyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    description: "alibaba-model-studio-s-openai-compatible-api",
    recommended: true,
  },
  zhipu: {
    label: "zhipu-glm",
    category: "china",
    needsKey: true,
    base: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.3",
    models: ["glm-5.3"],
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
    description: "official-zhipu-ai-open-platform-api",
  },
  minimax: {
    label: "MiniMax",
    category: "china",
    needsKey: true,
    base: "https://api.minimax.cn/v1",
    model: "MiniMax-M3",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.5"],
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    description: "openai-compatible-api-on-minimax-s-china-platform",
  },
  siliconflow: {
    label: "siliconflow",
    category: "aggregator",
    needsKey: true,
    base: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-8B",
    models: ["Qwen/Qwen3-8B", "deepseek-ai/DeepSeek-V3"],
    apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
    description: "a-multi-model-aggregation-service-based-in-china",
    recommended: true,
  },
  doubao: {
    label: "doubao-volcengine-ark",
    category: "aggregator",
    needsKey: true,
    base: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
    models: [],
    apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    description: "enter-the-inference-endpoint-id-you-created-in-volcengine-ark-in",
  },
  openrouter: {
    label: "OpenRouter",
    category: "aggregator",
    needsKey: true,
    base: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-chat",
    models: ["deepseek/deepseek-chat", "openai/gpt-4.1-mini", "google/gemini-2.5-flash"],
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    description: "an-international-multi-model-aggregation-service",
  },
  openai: {
    label: "OpenAI",
    category: "international",
    needsKey: true,
    base: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1"],
    apiKeyUrl: "https://platform.openai.com/api-keys",
    description: "official-openai-api",
  },
  ollama: {
    label: "Ollama",
    category: "local",
    needsKey: false,
    base: "http://localhost:11434/v1",
    model: "qwen3:8b",
    models: ["qwen3:8b", "qwen3:4b", "deepseek-r1:8b"],
    description: "run-models-locally-on-port-11434-by-default",
    local: true,
  },
  lmstudio: {
    label: "LM Studio",
    category: "local",
    needsKey: false,
    base: "http://localhost:1234/v1",
    model: "",
    models: [],
    description: "run-models-locally-on-port-1234-by-default",
    local: true,
  },
  custom: {
    label: "custom-openai-compatible-api",
    category: "advanced",
    needsKey: false,
    base: "",
    model: "",
    models: [],
    description: "enter-your-base-url-model-name-and-optional-api-key",
  },
};

export function aiProviderFor(id) {
  return AI_PROVIDERS[id] || null;
}

export function normalizeAiBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  return trimmed;
}

export function classifyAiHttpStatus(status) {
  if (status >= 200 && status < 300) return "";
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 429) return "limit";
  return "http";
}

export function buildAiRequestBody(providerId, model, messages, options = {}) {
  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: options.connectionTest ? 16 : 2400,
  };
  if (options.stream) body.stream = true;
  // A connection check needs one short answer. In real reading conversations
  // DeepSeek may return reasoning_content, which the UI shows separately.
  if (providerId === "deepseek") {
    body.thinking = {
      type: options.connectionTest || options.thinkingEnabled === false
        ? "disabled"
        : "enabled",
    };
  }
  return body;
}

export function buildAiRequestOptions(base, key, body) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  return {
    url: `${base}/chat/completions`,
    method: "POST",
    headers,
    throw: false,
    body: JSON.stringify(body),
  };
}
