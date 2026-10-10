import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cliMeta, cliAcpSupport } from "../src/ai-cli.js";
import { AI_PROVIDERS, AI_PROVIDER_CATEGORIES } from "../src/ai-providers.js";
const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
function setup(provider, model = "", key = "", tools = {}) {
  const { window } = new JSDOM("<main></main>"), { document, HTMLElement } = window;
  HTMLElement.prototype.addClass = function (...names) { this.classList.add(...names); };
  HTMLElement.prototype.removeClass = function (...names) { this.classList.remove(...names); };
  HTMLElement.prototype.toggleClass = function (name, value) { this.classList.toggle(name, value); };
  HTMLElement.prototype.empty = function () { this.replaceChildren(); };
  HTMLElement.prototype.createEl = function (tag, options = {}) {
    const el = document.createElement(tag); if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  for (const tag of ["div", "span"]) HTMLElement.prototype[`create${tag[0].toUpperCase() + tag.slice(1)}`] = function (options) { return this.createEl(tag, typeof options === "string" ? { cls: options } : options); };
  class Setting {
    constructor(host) { this.settingEl = host.createDiv("setting-item"); this.controlEl = this.settingEl.createDiv("setting-item-control"); }
    setName(name) { this.settingEl.dataset.name = name; return this; }
    addButton(build) {
      const el = this.controlEl.createEl("button");
      const b = { setButtonText(text) { el.textContent = text; return b; }, onClick(fn) { el.addEventListener("click", fn); return b; } }; build(b); return this;
    }
    addDropdown(build) {
      const selectEl = this.controlEl.createEl("select");
      const c = { selectEl, addOption(value, text) { selectEl.createEl("option", { text, attr: { value } }); return c; }, setValue(value) { selectEl.value = value; return c; }, onChange(fn) { selectEl.addEventListener("change", () => fn(selectEl.value)); return c; } };
      build(c); return this;
    }
    addText(build) {
      const inputEl = this.controlEl.createEl("input");
      const c = { inputEl, setValue(value) { inputEl.value = value; return c; }, setPlaceholder(value) { inputEl.placeholder = value; return c; }, onChange(fn) { inputEl.addEventListener("input", () => fn(inputEl.value)); return c; } };
      build(c); return this;
    }
  }
  const code = source.slice(source.indexOf("const SettingsTab = class"), source.indexOf("export default QiaomuBookReader"));
  const Tab = vm.runInNewContext(`${code}; SettingsTab`, { PluginSettingTab: class {}, Setting, window, AI_PROVIDERS, AI_PROVIDER_CATEGORIES, Platform: { isDesktopApp: true }, setIcon() {}, qiaomuReaderTranslate: key => key,
    aiConfig: p => ({ id: p.settings.aiProvider, provider: AI_PROVIDERS[p.settings.aiProvider], key }),
    aiSetupState: () => ({ enabled: false }), cliMeta, cliAcpSupport,
    resolveCliPath: tools.resolveCliPath || (async () => "/usr/bin/codex"),
    resolveAcpPath: tools.resolveAcpPath || (async () => "/usr/bin/codex-acp"),
    copyToClipboard: tools.copyToClipboard || (async () => true), Notice: class {},
    testAndEnableAi: tools.testAndEnableAi || (async () => ({})),
    aiConnectionErrorMessage: e => e.message,
    buildAiAppearanceSettings() {},

  });
  const settings = { aiProvider: provider, aiModel: model, aiModels: {}, aiSecrets: {}, aiBases: {} };
  let saved = 0, redrawn = 0;
  const tab = new Tab({}, { settings, saveAll: async () => { saved++; } });
  for (const method of ["_aiSecretRow", "_aiCliRows", "_aiBaseRow", "_aiEffortRow", "_aiThinkingRow", "_aiTestRow", "_aiTailRows"]) tab[method] = host => host.createDiv({ cls: method });
  const host = document.querySelector("main");
  tab._groupAi(host, () => { redrawn++; });
  return { host, settings, window, counts: () => ({ saved, redrawn }) };
}
const folded = el => !!el.closest("details:not([open])");

test("CLI setup exposes choices and keeps paths, tests, effort and prompts folded", () => {
  const { host } = setup("codex-cli");
  assert.equal(host.querySelectorAll(":scope > .setting-item select").length, 2);
  for (const name of ["_aiCliRows", "_aiEffortRow", "_aiTailRows"]) assert.ok(folded(host.querySelector(`.${name}`)));
  assert.equal(folded(host.querySelector("._aiTestRow")), true);
  assert.equal(host.querySelectorAll("details[open]").length, 0);
});

test("missing cloud keys are visible; saved keys and built-in endpoints are folded", () => {
  assert.equal(folded(setup("deepseek").host.querySelector("._aiSecretRow")), false);
  const { host } = setup("deepseek", "", "saved-secret");
  assert.equal(folded(host.querySelector("._aiSecretRow")), true);
  assert.equal(folded(host.querySelector("._aiBaseRow")), true);
});

test("custom endpoints and existing custom model values remain directly editable", () => {
  const { host } = setup("custom", "my-model");
  assert.equal(folded(host.querySelector("._aiSecretRow")), false);
  assert.equal(folded(host.querySelector("._aiBaseRow")), false);
  const input = host.querySelector("input");
  assert.equal(input.value, "my-model");
  assert.equal(input.closest(".setting-item").classList.contains("qiaomu-reader-hidden"), false);
});

test("switching providers preserves provider-scoped secrets and endpoint overrides", async () => {
  const x = setup("custom", "my-model");
  x.settings.aiSecrets = { custom: "custom-key", openai: "openai-key" };
  x.settings.aiBases = { custom: "https://example.com/v1" };
  const select = x.host.querySelector("select");
  select.value = "openai";
  select.dispatchEvent(new x.window.Event("change"));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(x.settings.aiSecrets, { custom: "custom-key", openai: "openai-key" });
  assert.deepEqual(x.settings.aiBases, { custom: "https://example.com/v1" });
});

test("choosing a model saves per provider and requires a fresh connection check", async () => {
  const x = setup("codex-cli");
  const select = x.host.querySelectorAll("select")[1];
  select.value = AI_PROVIDERS["codex-cli"].models[0];
  select.dispatchEvent(new x.window.Event("change"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(x.settings.aiModels["codex-cli"], select.value);
  assert.equal(x.settings.aiEnabled, false);
  assert.equal(x.settings.aiNeedsVerification, true);
  assert.deepEqual(x.counts(), { saved: 1, redrawn: 1 });
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test("missing adapter folds installation commands and provides no competing start button", async () => {
  let copied;
  const x = setup("codex-cli", "", "", {
    resolveAcpPath: async () => "",
    copyToClipboard: async text => { copied = text; return true; },
  });
  await settle();
  const help = x.host.querySelector(".qiaomu-reader-ai-install-help");
  assert.equal(help.hidden, false);
  assert.equal(folded(help.querySelector("code")), true);
  assert.equal(help.querySelectorAll("button").length, 2);
  help.querySelector("button").click(); await settle();
  assert.equal(copied, "npm install -g @agentclientprotocol/codex-acp");
});
test("dependency discovery does not enable AI or send a prompt, and ignores stale provider results", async () => {
  let release, prompts = 0;
  const x = setup("codex-cli", "", "", {
    resolveAcpPath: () => new Promise(resolve => { release = resolve; }),
    testAndEnableAi: async () => { prompts++; },
  });
  await settle();
  x.settings.aiProvider = "openai";
  release(""); await settle();
  assert.equal(x.host.querySelector(".qiaomu-reader-ai-install-help").hidden, true);
  assert.equal(prompts, 0);
  assert.equal(x.settings.aiEnabled, undefined);
});
test("already installed components keep installation instructions hidden", async () => {
  const x = setup("codex-cli"); await settle();
  assert.equal(x.host.querySelector(".qiaomu-reader-ai-install-help").hidden, true);
});
test("missing Codex CLI gives installation and login steps before adapter setup", async () => {
  const x = setup("codex-cli", "", "", { resolveCliPath: async () => "" }); await settle();
  assert.match(x.host.querySelector(".qiaomu-reader-ai-install-help code").textContent, /@openai\/codex\ncodex login/);
});

test("switching provider during a live connection test cannot enable the new provider", async () => {
  const code = source.slice(source.indexOf("async function testAndEnableAi("), source.indexOf("function openPluginAiSettings("));
  let finish;
  const run = vm.runInNewContext(`${code}; testAndEnableAi`, {
    aiConfig: p => ({ id: p.settings.aiProvider, model: p.settings.aiModel, provider: {} }),
    ensureAiCliReady: async () => {}, qiaomuReaderTranslate: k => k,
    aiTestConnection: () => new Promise(resolve => { finish = resolve; }),
  });
  const plugin = { settings: { aiProvider: "codex-cli", aiModel: "", aiEnabled: false }, saveAll: async () => {} };
  const promise = run(plugin); await settle();
  plugin.settings.aiProvider = "openai"; finish({});
  await assert.rejects(promise, e => e.qiaomuReaderReason === "notconfigured");
  assert.equal(plugin.settings.aiEnabled, false);
});
