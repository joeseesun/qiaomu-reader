import assert from "node:assert/strict";
import test from "node:test";
import * as providers from "../src/ai-providers.js";

const messages = [{ role: "user", content: "Explain this paragraph." }];

test("DeepSeek defaults to the current Flash alias and explicit high reasoning", () => {
  assert.equal(providers.AI_PROVIDERS.deepseek.model, "deepseek-flash");
  assert.ok(providers.AI_PROVIDERS.deepseek.models.includes("deepseek-flash"));
  assert.ok(!providers.AI_PROVIDERS.deepseek.models.includes("deepseek-v4-flash"));
  for (const stream of [false, true]) {
    const body = providers.buildAiRequestBody("deepseek", "deepseek-flash", messages, { stream });
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.reasoning_effort, "high");
    assert.deepEqual(body.thinking, { type: "enabled" });
    assert.equal("max_tokens" in body, false);
  }
});

test("DeepSeek connection checks and disabled thinking never send a reasoning effort", () => {
  for (const options of [{ connectionTest: true }, { thinkingEnabled: false }]) {
    const body = providers.buildAiRequestBody("deepseek", "deepseek-flash", messages, { ...options, effort: "high" });
    assert.equal("reasoning_effort" in body, false);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.max_tokens, options.connectionTest ? 16 : 2400);
  }
  const openai = providers.buildAiRequestBody("openai", "gpt-4.1-mini", messages);
  assert.equal("reasoning_effort" in openai, false);
  assert.equal(providers.buildAiRequestBody("magpie", "custom-model", messages, { effort: "low" }).reasoning_effort, "low");
});

test("explicit supported DeepSeek effort choices still override the high default", () => {
  for (const effort of ["low", "high", "max"]) {
    assert.equal(providers.buildAiRequestBody("deepseek", "deepseek-flash", messages, { effort }).reasoning_effort, effort);
  }
});

test("official DeepSeek upgrade migrates selected aliases and deduplicates the saved catalog", () => {
  const settings = {
    aiProvider: "deepseek", aiModel: "deepseek-v4-flash",
    aiModels: { deepseek: "deepseek-v4-flash", openai: "my-model" },
    aiBases: { deepseek: "https://api.deepseek.com/v1" },
    aiSecrets: { deepseek: "existing-secret" }, aiThinking: { deepseek: false },
    aiCatalogs: { deepseek: [
      { id: "deepseek-v4-flash", name: "Old Flash" },
      { id: "deepseek-flash", name: "Current Flash", efforts: ["low", "high", "max"] },
      { id: "deepseek-v4-flash-vision-exp" }, { id: "deepseek-v4-pro" },
    ], openai: [{ id: "my-model" }] },
    fontSize: 19, bookNoteLinks: { "book.epub": "My notes" },
  };
  const before = structuredClone(settings);
  assert.equal(providers.migrateDeepSeekFlashSettings(settings), true);
  assert.equal(settings.aiModel, "deepseek-flash");
  assert.equal(settings.aiModels.deepseek, "deepseek-flash");
  assert.deepEqual(settings.aiCatalogs.deepseek, [before.aiCatalogs.deepseek[1], { id: "deepseek-v4-pro" }]);
  for (const key of ["aiBases", "aiSecrets", "aiThinking", "fontSize", "bookNoteLinks"]) assert.deepEqual(settings[key], before[key]);
  assert.equal(settings.aiModels.openai, before.aiModels.openai);
  assert.deepEqual(settings.aiCatalogs.openai, before.aiCatalogs.openai);
  const migrated = structuredClone(settings);
  assert.equal(providers.migrateDeepSeekFlashSettings(settings), false);
  assert.deepEqual(settings, migrated);
});

test("migration also handles inactive DeepSeek, the vision alias and missing catalogs", () => {
  const settings = { aiProvider: "openai", aiModel: "my-model", aiModels: { deepseek: "deepseek-v4-flash-vision-exp" } };
  assert.equal(providers.migrateDeepSeekFlashSettings(settings), true);
  assert.equal(settings.aiModel, "my-model");
  assert.equal(settings.aiModels.deepseek, "deepseek-flash");
  assert.equal(providers.migrateDeepSeekFlashSettings({}), false);
});

test("migration preserves relay endpoints, custom model IDs and explicit Pro selections", () => {
  for (const base of ["https://proxy.example/v1", "not a URL", "https://api.deepseek.com.proxy.example/v1"]) {
    const settings = { aiProvider: "deepseek", aiModel: "deepseek-v4-flash", aiModels: { deepseek: "deepseek-v4-flash" }, aiBase: base };
    const before = structuredClone(settings);
    assert.equal(providers.migrateDeepSeekFlashSettings(settings), false);
    assert.deepEqual(settings, before);
  }
  for (const model of ["custom-flash", "deepseek-v4-pro", "deepseek-flash"]) {
    const settings = { aiProvider: "deepseek", aiModel: model, aiModels: { deepseek: model } };
    assert.equal(providers.migrateDeepSeekFlashSettings(settings), false);
    assert.equal(settings.aiModel, model);
  }
});
