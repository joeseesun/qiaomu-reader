const API_PROVIDERS = {
  chatgpt: { label: "ChatGPT", baseUrl: "https://api.openai.com/v1", website: "https://chatgpt.com/settings/usage", protocol: "openai-responses", icon: "openai", group: "account" },
  tokendance: { label: "\u8BCD\u5143\u8DF3\u52A8 \xB7 TokenDance", baseUrl: "https://tokendance.space/gateway/v1", website: "https://tokendance.space/keys", group: "relay" },
  magpie: { label: "Magpie \xB7 \u8BA2\u9605\u4E0E\u6A21\u578B\u7F51\u5173", baseUrl: "http://127.0.0.1:3425/v1", website: "https://usemagpie.ai", local: true, group: "local" },
  "glm-coding": { label: "\u667A\u8C31 GLM \xB7 Coding Plan", baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", website: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys", icon: "zhipu", group: "plan" },
  "zai-coding": { label: "Z.ai \xB7 Coding Plan", baseUrl: "https://api.z.ai/api/coding/paas/v4", website: "https://z.ai/manage-apikey/apikey-list", icon: "zai", group: "plan" },
  "kimi-code": { label: "Kimi Code \xB7 \u56FD\u5185\u5957\u9910", baseUrl: "https://api.kimi.com/coding/v1", website: "https://www.kimi.com/code/console", icon: "moonshot", group: "plan" },
  "minimax-plan": { label: "MiniMax \xB7 Token Plan", baseUrl: "https://api.minimaxi.com/v1", website: "https://platform.minimaxi.com/subscribe/coding-plan", icon: "minimax", group: "plan" },
  "bailian-plan": { label: "\u767E\u70BC \xB7 Token Plan", baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", website: "https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal", icon: "qwen", group: "plan" },
  "mimo-plan": { label: "\u5C0F\u7C73 MiMo \xB7 Token Plan", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1", website: "https://platform.xiaomimimo.com/token-plan", icon: "mimo", group: "plan" },
  "doubao-coding": { label: "\u706B\u5C71\u65B9\u821F \xB7 Coding Plan", baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3", website: "https://console.volcengine.com/ark", icon: "doubao", group: "plan" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", website: "https://platform.openai.com/api-keys", icon: "openai", group: "global" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", website: "https://console.anthropic.com", protocol: "anthropic", icon: "anthropic", group: "global" },
  google: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", website: "https://aistudio.google.com/apikey", protocol: "google", icon: "google", group: "global" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", website: "https://openrouter.ai/settings/keys", icon: "openrouter", group: "relay" },
  siliconflow: { label: "\u7845\u57FA\u6D41\u52A8", baseUrl: "https://api.siliconflow.cn/v1", website: "https://cloud.siliconflow.cn", icon: "siliconflow", group: "relay" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", website: "https://platform.deepseek.com/api_keys", icon: "deepseek", group: "cn" },
  moonshot: { label: "Kimi \xB7 Moonshot", baseUrl: "https://api.moonshot.cn/v1", website: "https://platform.kimi.com", icon: "moonshot", group: "cn" },
  stepfun: { label: "\u9636\u8DC3\u661F\u8FB0", baseUrl: "https://api.stepfun.com/v1", website: "https://platform.stepfun.com", icon: "stepfun", group: "cn" },
  mimo: { label: "\u5C0F\u7C73 MiMo", baseUrl: "https://api.xiaomimimo.com/v1", website: "https://platform.xiaomimimo.com", icon: "mimo", group: "cn" },
  minimax: { label: "MiniMax", baseUrl: "https://api.minimaxi.com/v1", website: "https://platform.minimax.cn", icon: "minimax", group: "cn" },
  qwen: { label: "\u901A\u4E49\u5343\u95EE \xB7 \u5317\u4EAC", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", website: "https://bailian.console.aliyun.com", icon: "qwen", group: "cn" },
  "qwen-intl": { label: "\u901A\u4E49\u5343\u95EE \xB7 \u65B0\u52A0\u5761", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", website: "https://modelstudio.console.alibabacloud.com", icon: "qwen", group: "cn" },
  glm: { label: "\u667A\u8C31 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", website: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys", icon: "zhipu", group: "cn" },
  zai: { label: "Z.ai", baseUrl: "https://api.z.ai/api/paas/v4", website: "https://z.ai/manage-apikey/apikey-list", icon: "zai", group: "global" },
  doubao: { label: "\u8C46\u5305 \xB7 \u706B\u5C71\u65B9\u821F", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", website: "https://console.volcengine.com/ark", icon: "doubao", group: "cn" },
  baidu: { label: "\u767E\u5EA6\u5343\u5E06", baseUrl: "https://qianfan.baidubce.com/v2", website: "https://console.bce.baidu.com/qianfan", icon: "wenxin", group: "cn" },
  hunyuan: { label: "\u817E\u8BAF\u6DF7\u5143", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", website: "https://console.cloud.tencent.com/hunyuan", icon: "hunyuan", group: "cn" },
  xai: { label: "xAI \xB7 Grok", baseUrl: "https://api.x.ai/v1", website: "https://console.x.ai", icon: "xai", group: "global" },
  mistral: { label: "Mistral", baseUrl: "https://api.mistral.ai/v1", website: "https://console.mistral.ai", icon: "mistral", group: "global" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", website: "https://console.groq.com/keys", icon: "groq", group: "relay" },
  together: { label: "Together AI", baseUrl: "https://api.together.ai/v1", website: "https://api.together.ai", icon: "together", group: "relay" },
  fireworks: { label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1", website: "https://app.fireworks.ai", icon: "fireworks", group: "relay" },
  cerebras: { label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1", website: "https://cloud.cerebras.ai", icon: "cerebras", group: "relay" },
  perplexity: { label: "Perplexity", baseUrl: "https://api.perplexity.ai", website: "https://www.perplexity.ai/settings/api", icon: "perplexity", group: "global" },
  ollama: { label: "Ollama \xB7 \u672C\u5730", baseUrl: "http://localhost:11434/v1", website: "https://docs.ollama.com/api/openai-compatibility", local: true, icon: "ollama", group: "local" },
  lmstudio: { label: "LM Studio \xB7 \u672C\u5730", baseUrl: "http://localhost:1234/v1", website: "https://lmstudio.ai/docs/developer/openai-compat", local: true, icon: "lmstudio", group: "local" },
  custom: { label: "\u81EA\u5B9A\u4E49\u63A5\u53E3", baseUrl: "", website: "", group: "custom" }
};
function apiProtocol(connection) {
  return connection.protocol ?? API_PROVIDERS[connection.provider]?.protocol ?? "openai-chat";
}
function permitsEmptyKey(connection) {
  if (!API_PROVIDERS[connection.provider]?.local) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(connection.baseUrl).hostname);
  } catch {
    return false;
  }
}
function apiBaseUrl(connection) {
  const base = validateApiUrl(connection.baseUrl).replace(/\/(?:chat\/completions|responses|messages|models)$/, "").replace(/(\/v1)+$/, "/v1");
  const path = new URL(base).pathname.replace(/\/$/, "");
  const versioned = /\/v\d+[a-z0-9]*$/i.test(path);
  if (apiProtocol(connection) === "anthropic") return versioned ? base : `${base}/v1`;
  if (apiProtocol(connection) === "google") return base;
  return !versioned && path === "" ? `${base}/v1` : base;
}
function validateApiUrl(value) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash) throw new Error("API \u5730\u5740\u4E0D\u80FD\u5305\u542B\u8D26\u53F7\u3001\u5BC6\u94A5\u6216\u67E5\u8BE2\u53C2\u6570");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("\u8FDC\u7A0B API \u8BF7\u4F7F\u7528 HTTPS\uFF1BHTTP \u4EC5\u7528\u4E8E\u672C\u673A\u670D\u52A1");
  }
  return url.toString().replace(/\/+$/, "");
}
export {
  API_PROVIDERS,
  apiBaseUrl,
  apiProtocol,
  permitsEmptyKey,
  validateApiUrl
};
