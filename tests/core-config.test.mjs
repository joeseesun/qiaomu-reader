import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { AI_PROVIDERS, aiProviderFor, buildAiRequestBody, buildAiRequestOptions, classifyAiHttpStatus, normalizeAiBase } from "../src/ai-providers.js";
import {
  buildCliInvocation,
  buildCliPrompt,
  classifyAcpFailure,
  acpPathCandidates,
  cliAcpSupport,
  cliReasoningEfforts,
  cliPathCandidates,
  createCliStreamParser,
  effectiveCliEffort,
  acpNpmInstallArgs,
  isCliAiProvider,
  retryAcpFailureOnce,
  shouldRetryAcpFailure,
} from "../src/ai-cli.js";
import { READER_THEMES, READER_THEME_CHOICES, migrateReaderTheme } from "../src/reader-themes.js";
import { createOpenAiSseParser } from "../src/ai-stream.js";
import { composeAiAnswerNote } from "../src/ai-note.js";
import { deriveAiSetupState } from "../src/ai-setup-state.js";
import { isChineseSourceText, translateUiText } from "../src/i18n-runtime.js";
import { EmbeddedPdfBinaryDataFactory, PDF_CMAP_OPTIONS } from "../src/pdf-cmaps.js";
import { EMBEDDED_PDF_CMAPS } from "../src/pdf-cmaps-data.js";
import { PDF_AI_CONTEXT_MAX_CHARS, READER_BLOCK_SELECTOR, packPdfDocumentContext, pdfPageKind, pdfPageShell, pdfPageTextFallback, pdfPageTextForAi } from "../src/pdf-page-mode.js";
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN, clampPdfZoom, pdfZoomFromWheel, pdfZoomPercent, pdfZoomShortcut, stepPdfZoom } from "../src/pdf-zoom.js";
import { appendReadingNoteExcerpts, migrateAndReplaceReadingHighlights, replaceManagedReadingHighlights } from "../src/reading-note.js";
import { corruptBackupPath, createSerialTaskQueue, parseJsonRecord, readJsonRecordStore } from "../src/storage.js";
import { createReaderLoadCoordinator, isReaderLoadAbort, throwIfReaderLoadAborted } from "../src/reader-load.js";

test("reader loads cancel stale work and only let the latest result commit", () => {
  const coordinator = createReaderLoadCoordinator();
  const first = coordinator.begin();
  assert.equal(coordinator.isCurrent(first), true);

  const second = coordinator.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(coordinator.isCurrent(first), false);
  assert.equal(coordinator.isCurrent(second), true);
  assert.throws(() => throwIfReaderLoadAborted(first.signal), { name: "AbortError" });
  assert.equal(isReaderLoadAbort(new Error("irrelevant"), first.signal), true);

  coordinator.finish(second);
  assert.equal(coordinator.isCurrent(second), false);

  const third = coordinator.begin();
  coordinator.cancel();
  assert.equal(third.signal.aborted, true);
  assert.equal(coordinator.isCurrent(third), false);
});

test("Traditional Chinese PDF CMaps are embedded for offline extraction", async () => {
  assert.ok(Object.keys(EMBEDDED_PDF_CMAPS).length >= 40);
  assert.ok(EMBEDDED_PDF_CMAPS["Adobe-CNS1-UCS2.bcmap"]);
  assert.equal(PDF_CMAP_OPTIONS.cMapPacked, true);
  assert.equal(PDF_CMAP_OPTIONS.useWorkerFetch, false);
  const bytes = await new EmbeddedPdfBinaryDataFactory().fetch({
    kind: "cMapUrl",
    filename: "Adobe-CNS1-UCS2.bcmap",
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 40_000);
});

test("PDF pages keep their fixed layout and expose text capabilities per page", () => {
  assert.equal(pdfPageKind(120, false), "text");
  assert.equal(pdfPageKind(0, false), "scan");
  assert.equal(pdfPageKind(120, true), "scan");
  assert.match(READER_BLOCK_SELECTOR, /\.qiaomu-reader-pdf-text-layer/);

  const textPage = pdfPageShell({
    pageNumber: 5,
    width: 595,
    height: 842,
    kind: "text",
    isLast: true,
    textLayerHtml: '<div class="qiaomu-reader-pdf-text-layer">正文</div>',
  });
  assert.match(textPage, /qiaomu-reader-pdf-text-page/);
  assert.match(textPage, /qiaomu-reader-pdf-last-page/);
  assert.match(textPage, /qiaomu-reader-pdf-page-img qiaomu-reader-pdf-lazy/);
  assert.match(textPage, /qiaomu-reader-pdf-text-layer/);
  assert.match(textPage, /data-pdf-page-no="5"/);
  assert.doesNotMatch(textPage, /qiaomu-reader-pdf-note-btn/);

  const scanPage = pdfPageShell({
    pageNumber: 1,
    width: 472,
    height: 692,
    kind: "scan",
    textLayerHtml: '<div class="qiaomu-reader-pdf-text-layer">must not leak</div>',
  });
  assert.match(scanPage, /qiaomu-reader-pdf-scan-page/);
  assert.doesNotMatch(scanPage, /must not leak/);
});

test("large PDF shells keep one inert text node per page instead of eager positioned spans", () => {
  const fallback = pdfPageTextFallback([
    { str: "第一段 <安全>", hasEOL: true },
    { str: "第二段 & 结尾", hasEOL: false },
  ]);
  assert.equal(fallback, "第一段 <安全>\n第二段 & 结尾");
  const shell = pdfPageShell({
    pageNumber: 1, width: 612, height: 792, kind: "text", textFallback: fallback,
  });
  assert.match(shell, /qiaomu-reader-pdf-text-layer qiaomu-reader-pdf-text-placeholder/);
  assert.match(shell, /第一段 &lt;安全&gt;\n第二段 &amp; 结尾/);
  assert.doesNotMatch(shell, /<span/);
  assert.doesNotMatch(shell, /<安全>/);
});

test("PDF AI context keeps page boundaries and represents the whole document", () => {
  assert.equal(PDF_AI_CONTEXT_MAX_CHARS, 180_000);
  assert.equal(pdfPageTextForAi([
    { str: "第一行", hasEOL: true },
    { str: "第二", hasEOL: false },
    { str: "行", hasEOL: true },
  ]), "第一行\n第二 行");

  const complete = packPdfDocumentContext([
    { page: 1, text: "第一页正文" },
    { page: 3, text: "第三页正文" },
  ], 2_000);
  assert.deepEqual(complete, {
    text: "[第 1 页]\n第一页正文\n\n[第 3 页]\n第三页正文",
    pageCount: 2,
    sourceChars: 10,
    truncated: false,
  });

  const condensed = packPdfDocumentContext([
    { page: 1, text: "甲".repeat(800) },
    { page: 2, text: "乙".repeat(800) },
    { page: 3, text: "丙".repeat(800) },
  ], 1_200);
  assert.equal(condensed.truncated, true);
  assert.equal(condensed.pageCount, 3);
  assert.equal(condensed.sourceChars, 2_400);
  assert.ok(condensed.text.length <= 1_200);
  assert.match(condensed.text, /\[第 1 页\]/);
  assert.match(condensed.text, /\[第 2 页\]/);
  assert.match(condensed.text, /\[第 3 页\]/);
});

test("PDF zoom stays bounded and supports buttons, gestures, and shortcuts", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.equal(clampPdfZoom(0.1), PDF_ZOOM_MIN);
  assert.equal(clampPdfZoom(8), PDF_ZOOM_MAX);
  assert.equal(clampPdfZoom("bad"), 1);
  assert.equal(stepPdfZoom(1, 1), 1.25);
  assert.equal(stepPdfZoom(1, -1), 0.75);
  assert.equal(pdfZoomPercent(1.254), "125%");
  assert.ok(pdfZoomFromWheel(1, -100) > 1);
  assert.ok(pdfZoomFromWheel(1, 100) < 1);
  assert.equal(pdfZoomShortcut({ metaKey: true, ctrlKey: false, altKey: false, key: "=" }), "in");
  assert.equal(pdfZoomShortcut({ metaKey: false, ctrlKey: true, altKey: false, key: "-" }), "out");
  assert.equal(pdfZoomShortcut({ metaKey: true, ctrlKey: false, altKey: false, key: "0" }), "reset");
  assert.equal(pdfZoomShortcut({ metaKey: false, ctrlKey: false, altKey: false, key: "+" }), null);
  assert.match(source, /"minus": `<svg[^`]+<line x1="5" y1="12" x2="19" y2="12"\/><\/svg>`/);
  assert.match(source, /svgIcon\(out, "minus"\)/);
});

test("saving an AI response keeps the answer as the note body", () => {
  const note = composeAiAnswerNote({
    answer: "## AI 的结论\n\n- 第一点\n- 第二点",
    sourceText: "用户选中的原文",
    attribution: "— 来自 [[测试书籍]]",
    sourceHeading: "原文",
    tagLine: "#阅读\n\n",
  });
  assert.ok(note.startsWith("#阅读\n\n## AI 的结论"));
  assert.match(note, /- 第一点\n- 第二点/);
  assert.match(note, /## 原文\n\n> 用户选中的原文/);
  assert.ok(note.indexOf("AI 的结论") < note.indexOf("用户选中的原文"));
});

test("PDF extraction renders every page image and overlays PDF.js text instead of reflowing it", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(source, /new pdfjsLib\.TextLayer/);
  assert.match(source, /page\.cleanup\?\.\(\)/);
  assert.match(source, /qiaomu-reader-pdf-text-placeholder/);
  assert.match(source, /const pdfBlock = pdfPage\.querySelector\(READER_BLOCK_SELECTOR\)/);
  assert.match(source, /parts\.push\(pdfPageShell/);
  assert.match(source, /\.qiaomu-reader-pdf-page-break\{[\s\S]*break-after:column/);
  assert.match(source, /\.qiaomu-reader-pdf-text-layer\{/);
  assert.match(source, /currentPdfPageElement\(\)/);
  assert.match(source, /data-pdf-page-kind"\) !== "text"\) return -1/);
  assert.match(source, /readerSupportsAiContext\(view\)/);
  assert.match(source, /function setupPdfZoomInteractions\(view\)/);
  assert.match(source, /wireReaderChrome\(view, root\)[\s\S]{0,120}setupPdfZoomInteractions\(view\)/);
  assert.match(source, /--qiaomu-reader-pdf-zoom/);
  assert.match(source, /data-pdf-page-kind"\) !== "text"\) return null/);
  assert.match(source, /resolveHighlightAnchor\(blocks, hl, this\.file\.extension === "pdf"\)/);
  assert.doesNotMatch(source, /const alsoFigOnText/);
  assert.doesNotMatch(source, /setName\(qiaomuReaderTranslate\("show-pictures-from-the-book"\)\)/);
});

test("manual reading-note excerpts survive later highlight synchronisation", () => {
  const original = "# 阅读笔记\n\n## 划线与批注\n\n> 已有划线\n";
  const appended = appendReadingNoteExcerpts(original, "## 手动摘录", "> 手动追加内容");
  const synced = replaceManagedReadingHighlights(
    appended,
    "## 划线与批注\n\n> 已有划线\n\n> 新增划线",
    "旧版摘录",
  );

  assert.match(synced, /## 划线与批注[\s\S]*> 新增划线/);
  assert.match(synced, /## 手动摘录\n\n> 手动追加内容/);
  assert.equal((synced.match(/手动追加内容/g) || []).length, 1);
});

test("existing untracked excerpts are rescued from the old managed section", () => {
  const oldNote = [
    "# 阅读笔记",
    "",
    "## 划线与批注",
    "",
    "> <mark style=\"background:#fff2a8\">已有划线</mark> *(第1页)*",
    "",
    "> 手动追加内容 *(第2页)*",
    "",
  ].join("\n");
  const migrated = migrateAndReplaceReadingHighlights(
    oldNote,
    "## 划线与批注\n\n> <mark style=\"background:#fff2a8\">已有划线</mark> *(第1页)*",
    "旧版摘录",
    "## 手动摘录",
  );

  assert.match(migrated, /## 手动摘录\n\n> 手动追加内容/);
  assert.equal((migrated.match(/已有划线/g) || []).length, 1);
  assert.equal((migrated.match(/手动追加内容/g) || []).length, 1);
});

test("JSON stores reject arrays and invalid content instead of treating them as empty data", () => {
  assert.deepEqual(parseJsonRecord('{"book": {"pct": 0.5}}'), { book: { pct: 0.5 } });
  assert.throws(() => parseJsonRecord("[]"), /must contain a JSON object/);
  assert.throws(() => parseJsonRecord("not-json"), SyntaxError);
});

test("serial task queue preserves order and recovers after a failed save", async () => {
  const queue = createSerialTaskQueue();
  const calls = [];
  const first = queue.run(async () => { calls.push("first"); throw new Error("disk full"); });
  const second = queue.run(async () => { calls.push("second"); return 2; });
  await assert.rejects(first, /disk full/);
  assert.equal(await second, 2);
  assert.deepEqual(calls, ["first", "second"]);
});

test("unreadable JSON stores preserve raw content without overwriting the source", async () => {
  const files = new Map([["reading-progress.json", "{broken"]]);
  const writes = [];
  const adapter = {
    async exists(file) { return files.has(file); },
    async read(file) { return files.get(file); },
    async write(file, value) { writes.push([file, value]); files.set(file, value); },
  };
  const now = new Date("2026-09-02T10:20:30.456Z");
  const expectedBackup = corruptBackupPath("reading-progress.json", now);
  const result = await readJsonRecordStore(adapter, "reading-progress.json", "progress", now);
  assert.equal(result.status, "unreadable");
  assert.equal(result.value, null);
  assert.equal(result.backupPath, expectedBackup);
  assert.equal(files.get("reading-progress.json"), "{broken");
  assert.deepEqual(writes, [[expectedBackup, "{broken"]]);
});

test("read failures block the store without inventing a backup that was never written", async () => {
  const adapter = {
    async exists() { return true; },
    async read() { throw new Error("sync placeholder unavailable"); },
    async write() { throw new Error("must not write without raw content"); },
  };
  const result = await readJsonRecordStore(adapter, "reading-highlights.json", "highlights");
  assert.equal(result.status, "unreadable");
  assert.equal(result.value, null);
  assert.equal(result.backupPath, "");
  assert.match(result.error.message, /sync placeholder unavailable/);
});

test("empty synced JSON placeholders stay blocked until the user restores or removes them", async () => {
  const files = new Map([["reading-progress.json", ""]]);
  const writes = [];
  const adapter = {
    async exists(file) { return files.has(file); },
    async read(file) { return files.get(file); },
    async write(file, value) { writes.push([file, value]); },
  };
  const result = await readJsonRecordStore(adapter, "reading-progress.json", "progress");
  assert.equal(result.status, "unreadable");
  assert.equal(result.value, null);
  assert.equal(result.backupPath, "");
  assert.deepEqual(writes, []);
});

test("reader persistence refuses to overwrite unreadable stores and reports real save failures", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /this\._blockedStores\.add\(path5\)/);
  assert.match(source, /this\._unreadableStores\.set\(path5/);
  assert.match(source, /async retryUnreadableStore\(path5\)/);
  assert.match(source, /to-avoid-overwriting-recoverable-data/);
  assert.match(source, /if \(this\._blockedStores\.has\(path5\)\) return false/);
  assert.match(source, /stores\.some\(\(store\) => store === false\)/);
  assert.match(source, /const saved = await this\._persistHighlights/);
  assert.match(source, /if \(!saved\) \{[\s\S]*could-not-save-the-comment/);
  assert.match(source, /function renderReaderLoadError/);
  assert.match(source, /try-again/);
});

test("fixed-layout PDF pages show a reserved loading state instead of a blank sheet", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(source, /const FIGURE_RENDERING_CLASS = "qiaomu-reader-pdf-rendering"/);
  assert.match(source, /surface\) surface\.addClass\(FIGURE_RENDERING_CLASS\)/);
  assert.match(source, /surface\.removeClass\(FIGURE_RENDERING_CLASS\)/);
  assert.match(styles, /\.qiaomu-reader-pdf-page-surface\.qiaomu-reader-pdf-rendering::after/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(source, /function qiaomuReaderMarkSlowLayout\(view, delay = 3000\)/);
  assert.match(source, /async function qiaomuReaderPaintVeil\(view\)/);
  assert.match(source, /await qiaomuReaderPaintVeil\(this\);/);
  assert.match(source, /function readerPaginationMappingCollapsed\(pager\)/);
  assert.match(source, /if \(readerPaginationMappingCollapsed\(pager\)\)/);
  assert.match(source, /this-document-has-many-pages-layout-is-still-in-progress/);
  assert.doesNotMatch(source, /if \(this\.areaEl\) this\.areaEl\.removeClass\("qiaomu-reader-booting"\);\s*qiaomuReaderHideVeil\(this\);/);
});

test("runtime diagnostics use the maintained plugin identity", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.(?:error|warn|log)\("Book Reader:/);
  assert.match(source, /const VIEW_TYPE = "qiaomu-reader"/);
  assert.match(source, /const LIB_VIEW_TYPE = "qiaomu-reader-library"/);
  assert.match(source, /const QiaomuBookReader = class extends Plugin/);
  assert.match(source, /export default QiaomuBookReader/);
});

test("Russian UI never leaks Chinese-first source keys", () => {
  const english = {
    "AI 解读": "AI reading",
    "Плагин поддерживается 向阳乔木": "The plugin is maintained by Qiaomu",
  };
  assert.equal(isChineseSourceText("AI 解读"), true);
  assert.equal(isChineseSourceText("Плагин поддерживается 向阳乔木"), false);
  assert.equal(translateUiText("zh", "AI 解读", english, {}), "AI 解读");
  assert.equal(translateUiText("en", "AI 解读", english, {}), "AI reading");
  assert.equal(translateUiText("ru", "AI 解读", english, {}), "AI reading");
  assert.equal(
    translateUiText("ru", "Плагин поддерживается 向阳乔木", english, {}),
    "Плагин поддерживается 向阳乔木",
  );
});

test("translation target labels follow the plugin interface language", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /const TRANSLATION_LANGUAGE_CHOICES = Object\.freeze/);
  assert.match(source, /\["zh-CN", "simplified-chinese"\]/);
  assert.match(source, /TRANSLATION_LANGUAGE_CHOICES\.forEach\(\(\[value, label\]\) => dropdown\.addOption\(value, qiaomuReaderTranslate\(label\)\)\)/);
  assert.doesNotMatch(source, /\.addOption\("zh-CN", "简体中文"\)/);
});

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.03928
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("AI presets contain supported providers and reject unknown services", () => {
  assert.equal(aiProviderFor("unknown-provider"), null);
  for (const id of ["codex-cli", "claude-cli", "grok-cli", "kimi-cli", "zcode-cli", "deepseek", "kimi", "qwen", "zhipu", "minimax", "siliconflow", "doubao", "openrouter", "openai", "ollama", "lmstudio", "custom"]) {
    assert.ok(AI_PROVIDERS[id], `missing provider: ${id}`);
  }
  for (const id of ["codex-cli", "claude-cli", "grok-cli", "kimi-cli", "zcode-cli"]) {
    assert.equal(AI_PROVIDERS[id].transport, "cli");
    assert.equal(AI_PROVIDERS[id].needsKey, false);
    assert.equal(AI_PROVIDERS[id].desktopOnly, true);
    assert.equal(isCliAiProvider(id), true);
  }
  assert.equal(AI_PROVIDERS.ollama.base, "http://localhost:11434/v1");
  assert.equal(AI_PROVIDERS.lmstudio.base, "http://localhost:1234/v1");
  assert.equal(normalizeAiBase(" https://example.com/v1/// "), "https://example.com/v1");
});

test("AI HTTP failures distinguish a rejected key from a refused request", () => {
  assert.equal(classifyAiHttpStatus(200), "");
  assert.equal(classifyAiHttpStatus(401), "auth");
  assert.equal(classifyAiHttpStatus(403), "forbidden");
  assert.equal(classifyAiHttpStatus(429), "limit");
  assert.equal(classifyAiHttpStatus(500), "http");
});

test("AI setup state separates configuration readiness from toolbar visibility", () => {
  assert.deepEqual(deriveAiSetupState(), {
    kind: "unconfigured", ready: false, enabled: false, reason: "provider",
  });
  assert.equal(deriveAiSetupState({ provider: {}, base: "https://api.example.com", model: "m", needsKey: true }).reason, "key");
  assert.equal(deriveAiSetupState({ provider: {}, base: "https://api.example.com", needsKey: false }).reason, "model");
  assert.equal(deriveAiSetupState({ provider: {}, transport: "cli", desktop: false }).reason, "desktop");
  assert.equal(deriveAiSetupState({
    provider: {}, base: "https://api.example.com", model: "m", needsVerification: true,
  }).reason, "verify");
  assert.deepEqual(deriveAiSetupState({
    provider: {}, base: "https://api.example.com", model: "m", needsKey: true, key: "secret", enabled: false,
  }), { kind: "disabled", ready: true, enabled: false, reason: "" });
  assert.deepEqual(deriveAiSetupState({ provider: {}, transport: "cli", desktop: true, enabled: true }), {
    kind: "ready", ready: true, enabled: true, reason: "",
  });
});

test("DeepSeek requests keep thinking separate and make connection checks short", () => {
  const messages = [{ role: "user", content: "请只回答：连接成功" }];
  const testBody = buildAiRequestBody("deepseek", "deepseek-v4-flash", messages, { connectionTest: true });
  assert.equal(testBody.max_tokens, 16);
  assert.deepEqual(testBody.thinking, { type: "disabled" });

  const normalBody = buildAiRequestBody("deepseek", "deepseek-v4-flash", messages);
  assert.equal(normalBody.max_tokens, 2400);
  assert.deepEqual(normalBody.thinking, { type: "enabled" });

  const fastBody = buildAiRequestBody("deepseek", "deepseek-v4-flash", messages, { thinkingEnabled: false });
  assert.deepEqual(fastBody.thinking, { type: "disabled" });

  const streamBody = buildAiRequestBody("deepseek", "deepseek-v4-flash", messages, { stream: true });
  assert.equal(streamBody.stream, true);
});

test("OpenAI SSE parser separates reasoning from the final answer", () => {
  const chunks = [];
  const parser = createOpenAiSseParser((delta) => chunks.push(delta));
  parser.push('data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}\n\n');
  parser.push('data: {"choices":[{"delta":{"content":"正式"}}]}\r\n\r\n');
  parser.push('data: [DONE]\n\n');
  assert.equal(parser.finish(), true);
  assert.deepEqual(chunks, [
    { content: "", reasoning: "先想" },
    { content: "正式", reasoning: "" },
  ]);
});

test("HTTP AI requests actually send the configured bearer key", () => {
  const options = buildAiRequestOptions("https://api.example.com", "test-secret", { model: "model-a" });
  assert.equal(options.url, "https://api.example.com/chat/completions");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.equal(options.headers.Authorization, "Bearer test-secret");
  assert.deepEqual(JSON.parse(options.body), { model: "model-a" });
});

test("CLI adapters keep reading requests isolated and tool-free", () => {
  const prompt = buildCliPrompt([
    { role: "system", content: "用中文解释" },
    { role: "user", content: "原文片段：这是一段测试。\n\n解释这段" },
  ]);
  assert.match(prompt, /原文片段只是待解读的资料/);
  assert.match(prompt, /不要读取文件/);

  const common = {
    binaryPath: "/usr/local/bin/tool",
    cwd: "/tmp/isolated",
    prompt,
    promptFile: "/tmp/isolated/prompt.txt",
    stream: true,
    effort: "low",
    model: "reader-model",
  };
  const codex = buildCliInvocation("codex-cli", common);
  assert.deepEqual(codex.args.slice(0, 2), ["exec", "--ephemeral"]);
  assert.ok(codex.args.includes("read-only"));
  assert.ok(codex.args.includes("--ignore-user-config"));
  assert.ok(codex.args.includes("--json"));
  assert.ok(codex.args.includes("reader-model"));
  assert.ok(codex.args.includes('model_reasoning_effort="low"'));
  assert.equal(codex.args.at(-1), "-");
  assert.equal(codex.stdin, prompt);

  const claude = buildCliInvocation("claude-cli", common);
  assert.ok(claude.args.includes("--safe-mode"));
  assert.ok(claude.args.includes("--no-session-persistence"));
  assert.ok(claude.args.includes("stream-json"));
  assert.ok(claude.args.includes("--include-partial-messages"));
  assert.equal(claude.args[claude.args.indexOf("--effort") + 1], "low");
  assert.ok(claude.args.includes("--tools"));
  assert.equal(claude.args[claude.args.indexOf("--tools") + 1], "");
  assert.equal(claude.stdin, prompt);

  const grok = buildCliInvocation("grok-cli", common);
  assert.ok(grok.args.includes("--prompt-file"));
  assert.ok(grok.args.includes("--disable-web-search"));
  assert.ok(grok.args.includes("--no-memory"));
  assert.ok(grok.args.includes("streaming-json"));
  assert.equal(grok.args[grok.args.indexOf("--reasoning-effort") + 1], "low");
  assert.equal(grok.stdin, "");
  for (const spec of [codex, claude, grok]) {
    assert.equal(spec.cwd, "/tmp/isolated");
    assert.ok(!spec.args.includes("bypassPermissions"));
    assert.ok(!spec.args.includes("danger-full-access"));
  }
});

test("CLI reasoning options are provider-specific", () => {
  assert.deepEqual(cliReasoningEfforts("codex-cli"), ["", "minimal", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(cliReasoningEfforts("claude-cli"), ["", "low", "medium", "high", "xhigh", "max"]);
  assert.ok(!cliReasoningEfforts("grok-cli").includes("max"));
  assert.equal(effectiveCliEffort("grok-cli", ""), "low");
  assert.equal(effectiveCliEffort("grok-cli", "high"), "high");
  assert.equal(effectiveCliEffort("codex-cli", ""), "");
});

test("CLI chat uses persistent, tool-free ACP sessions", () => {
  const source = fs.readFileSync(new URL("../src/ai-cli.js", import.meta.url), "utf8");
  assert.match(source, /args\.push\("--no-auto-update", "agent", "--no-leader"\)/);
  assert.match(source, /\["--no-auto-update", "--version"\]/);
  assert.match(source, /args: \["--no-auto-update", "models"\]/);
  assert.match(source, /args\.push\("stdio"\)/);
  assert.match(source, /protocolVersion: 1/);
  assert.match(source, /clientCapabilities: \{ fs: \{ readTextFile: false, writeTextFile: false \}, terminal: false \}/);
  assert.match(source, /"session\/new", \{ cwd: this\.cwd, mcpServers: \[\] \}/);
  assert.match(source, /"session\/prompt"/);
  assert.match(source, /"session\/cancel"/);
  assert.match(source, /env\.HOME = paths\.fakeHome/);
  assert.match(source, /env\.GROK_HOME = paths\.grokHome/);
  assert.match(source, /const CLI_PATH_CACHE = new Map\(\)/);
  assert.equal(cliAcpSupport("grok-cli").mode, "native");
  assert.equal(cliAcpSupport("grok-cli").binary, "grok");
  assert.equal(cliAcpSupport("kimi-cli").mode, "native");
  assert.equal(cliAcpSupport("codex-cli").mode, "adapter");
  assert.equal(cliAcpSupport("claude-cli").mode, "adapter");
  assert.equal(cliAcpSupport("zcode-cli").mode, "adapter");
  assert.equal(cliAcpSupport("codex-cli").installCommand, "npm install -g @agentclientprotocol/codex-acp");
  assert.equal(cliAcpSupport("claude-cli").installCommand, "npm install -g @agentclientprotocol/claude-agent-acp");
  assert.equal(cliAcpSupport("zcode-cli").installCommand, "npm install -g zcode-acp-server");
  assert.equal(cliAcpSupport("grok-cli").installCommand, "");
  assert.equal(cliAcpSupport("kimi-cli").installCommand, "");
  assert.equal(cliAcpSupport("zcode-cli").community, true);
  assert.equal(cliAcpSupport("claude-cli").autoInstall, false);
  assert.equal(cliAcpSupport("zcode-cli").autoInstall, false);
  assert.equal(cliAcpSupport("codex-cli").autoInstall, false);
  assert.deepEqual(acpNpmInstallArgs("claude-cli", "/plugin/acp/claude"), [
    "install", "--prefix", "/plugin/acp/claude", "--omit", "dev", "--ignore-scripts",
    "--no-package-lock", "--no-save", "--no-audit", "--no-fund", "--loglevel", "error",
    "@agentclientprotocol/claude-agent-acp@0.73.0",
  ]);
  assert.deepEqual(acpNpmInstallArgs("zcode-cli", "/plugin/acp/zcode"), [
    "install", "--prefix", "/plugin/acp/zcode", "--omit", "dev", "--ignore-scripts",
    "--no-package-lock", "--no-save", "--no-audit", "--no-fund", "--loglevel", "error",
    "zcode-acp-server@0.21.0",
  ]);
  assert.deepEqual(acpNpmInstallArgs("codex-cli", "/plugin/acp/codex"), []);
  assert.ok(acpPathCandidates("codex-cli", { home: "/Users/test", envPath: "" }).includes("/opt/homebrew/bin/codex-acp"));
  assert.match(source, /export async function probeCliAcp/);
  assert.match(source, /export async function warmCliAiSession/);
  assert.match(source, /this\.sessionPending = new Map\(\)/);
  assert.match(source, /async probe\(sessionKey/);
  assert.match(source, /this\.forgetSession\(sessionKey\)/);
  assert.match(source, /evictCliAcpManager\(manager\)/);
  const runCliSource = source.slice(source.indexOf("export async function runCliAi"));
  assert.ok(runCliSource.indexOf("if (options.sessionKey") < runCliSource.indexOf("const prompt = buildCliPrompt"));
});

test("ACP failures distinguish login, stale sessions, and stopped transports", () => {
  assert.equal(classifyAcpFailure({ message: "Authentication required" }), "cliauth");
  assert.equal(classifyAcpFailure({ message: "Unknown session: abc" }), "acpsession");
  assert.equal(classifyAcpFailure({ message: "Session id does not exist" }), "acpsession");
  assert.equal(classifyAcpFailure({ message: "transport closed" }), "acpstopped");
  assert.equal(classifyAcpFailure({ message: "broken pipe" }), "acpstopped");
  assert.equal(classifyAcpFailure({ message: "provider returned an internal error" }), "cli");
  assert.equal(shouldRetryAcpFailure({ qiaomuReaderReason: "acpsession" }), true);
  assert.equal(shouldRetryAcpFailure({ qiaomuReaderReason: "acpstopped" }), true);
  assert.equal(shouldRetryAcpFailure({ qiaomuReaderReason: "acpstopped", qiaomuReaderHadOutput: true }), false);
  assert.equal(shouldRetryAcpFailure({ qiaomuReaderReason: "cli" }), false);
});

test("ACP recovery retries exactly once and never repeats partial output", async () => {
  let attempts = 0;
  let recoveries = 0;
  const recovered = await retryAcpFailureOnce(
    async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("session expired"), { qiaomuReaderReason: "acpsession" });
      return "ok";
    },
    async () => { recoveries += 1; },
    "acpsession",
  );
  assert.equal(recovered, "ok");
  assert.equal(attempts, 2);
  assert.equal(recoveries, 1);

  attempts = 0;
  await assert.rejects(
    retryAcpFailureOnce(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("transport closed"), { qiaomuReaderReason: "acpstopped", qiaomuReaderHadOutput: true });
      },
      async () => { recoveries += 1; },
      "acpstopped",
    ),
    /transport closed/,
  );
  assert.equal(attempts, 1);
  assert.equal(recoveries, 1);
});

test("CLI stream parsers separate thoughts from the visible answer", () => {
  const cases = [
    {
      id: "codex-cli",
      chunks: [
        '{"type":"item.completed","item":{"type":"reasoning","text":"先想"}}\n',
        '{"type":"item.completed","item":{"type":"agent_message","text":"正式回答"}}\n',
      ],
    },
    {
      id: "claude-cli",
      chunks: [
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"先想"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"正式"}}}\n',
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"回答"}}}\n',
      ],
    },
    {
      id: "grok-cli",
      chunks: [
        '{"type":"thought","data":"先想"}\n',
        '{"type":"text","data":"正式"}\n{"type":"text","data":"回答"}\n',
      ],
    },
  ];
  for (const sample of cases) {
    const deltas = [];
    const parser = createCliStreamParser(sample.id, (delta) => deltas.push(delta));
    sample.chunks.forEach((chunk) => parser.push(chunk));
    parser.finish();
    assert.deepEqual(parser.result(), { answer: "正式回答", reasoning: "先想", error: "" });
    assert.ok(deltas.some((delta) => delta.reasoning));
    assert.ok(deltas.some((delta) => delta.content));
  }
});

test("CLI detection includes GUI-safe common install locations", () => {
  const candidates = cliPathCandidates("codex-cli", {
    platform: "darwin",
    home: "/Users/reader",
    envPath: "/custom/bin:/usr/bin",
    pathApi: { join: (...parts) => parts.join("/").replace(/\/{2,}/g, "/") },
  });
  assert.ok(candidates.includes("/custom/bin/codex"));
  assert.ok(candidates.includes("/Users/reader/.local/bin/codex"));
  assert.ok(candidates.includes("/opt/homebrew/bin/codex"));
  assert.ok(candidates.indexOf("/Users/reader/.local/bin/codex") < candidates.indexOf("/custom/bin/codex"));
});

test("reading themes migrate legacy names and meet WCAG AA contrast", () => {
  assert.equal(migrateReaderTheme("light"), "paper");
  assert.equal(migrateReaderTheme("sepia"), "warm");
  assert.equal(migrateReaderTheme("dark"), "night");
  assert.equal(migrateReaderTheme("eink"), "moon");
  assert.deepEqual(READER_THEME_CHOICES, ["auto", "paper", "warm", "celadon", "moon", "night"]);
  assert.ok(READER_THEMES.eink, "e-ink device mode keeps its internal high-contrast palette");
  for (const id of READER_THEME_CHOICES.filter((name) => name !== "auto")) {
    const theme = READER_THEMES[id];
    assert.ok(contrast(theme.bg, theme.text) >= 4.5, `${id} contrast is too low`);
  }
});

test("public README uses Qiaomu branding and links to preserved third-party notices", () => {
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /fork 上架授权/i);
  assert.match(readme, /DeepSeek/);
  assert.match(readme, /Codex CLI/);
  assert.match(readme, /Claude Code CLI/);
  assert.match(readme, /Grok CLI/);
  assert.match(readme, /CLI 模式仅支持桌面版 Obsidian/);
  assert.match(readme, /Obsidian 的密钥库/);
});

test("AI prompt and context are Chinese-first", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const start = source.indexOf("function aiSystemChat");
  const end = source.indexOf("const TranslateModal", start);
  const aiSource = source.slice(start, end);
  assert.match(aiSource, /你是一名克制、准确的阅读助手/);
  assert.match(aiSource, /书名：《/);
  assert.doesNotMatch(aiSource, /Из книги|Фрагмент|Перевод|По словам/);
});

test("selection popup keeps primary actions compact and moves note tools into More", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const start = source.indexOf("function selectionActions");
  const end = source.indexOf("const AiExplainModal", start);
  const popupSource = source.slice(start, end);
  assert.match(popupSource, /void view\.plugin\.openAiChat\(context\)/); // Unconfigured users reach inline setup.
  assert.match(popupSource, /ai: \["qiaomu-reader-hl-ai", "sparkles"/); // AI entry in the button descriptor table
  assert.match(popupSource, /kind: "selection"[\s\S]*text: cur\.text[\s\S]*bookFile: view\.file/);
  assert.match(popupSource, /button\(row, "qiaomu-reader-hl-menu", "ellipsis"/); // More entry in the button table
  assert.match(popupSource, /add\(qiaomuReaderTranslate\("create-note"\)/);
  assert.match(popupSource, /"delete-highlight-and-comment" : "delete-highlight"/);
  assert.doesNotMatch(popupSource, /act\("qiaomu-reader-hl-note"/);
  assert.match(source, /hlCommentQuoteBlock\(editor, current\.text\)/); // quote text comes from the active highlight
  assert.match(source, /const quote = editor\.createDiv\(\{ cls: "qiaomu-reader-hl-comment-quote", text \}\)/);
  assert.match(source, /event\.key === "Enter" && \(event\.metaKey \|\| event\.ctrlKey\) && !event\.isComposing/);
  assert.match(source, /event\.key === "Escape"[\s\S]*view\._hideHlPopup\(\)/);
  assert.match(css, /\.qiaomu-reader-hl-popup-commenting \.qiaomu-reader-hl-actions \{ display:none; \}/);
  assert.match(css, /-webkit-line-clamp:3/);
  assert.doesNotMatch(source, /brain-circuit/);
});

test("AI dialog uses built-in quick prompts and keeps reasoning separate", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const chinese = fs.readFileSync(new URL("../src/i18n-zh.js", import.meta.url), "utf8");
  for (const label of ["解释一下", "举个例子", "总结要点", "对我有什么用", "换个角度看", "出题考考我"]) {
    assert.match(chinese, new RegExp(label));
  }
  assert.match(source, /const DEFAULT_AI_QUICK_PROMPTS/);
  assert.doesNotMatch(source, /AiPromptLibraryModal/);
  assert.match(source, /function aiQuickPrompts\(\) \{\s+return defaultAiQuickPrompts\(\);/);
  assert.match(source, /button\.addEventListener\("click", \(\) => \{[\s\S]*chat\._send\(item\.prompt\)/);
  assert.match(source, /createEl\("details", \{ cls: "qiaomu-reader-ai-reason" \}\)/);
  assert.match(source, /reasoningBox\.open = false/);
  assert.match(source, /onDelta/);
  assert.match(source, /createAiStreamingMarkdownRenderer/);
  assert.match(source, /markdownRenderer\.update\(answer\)/);
  assert.match(source, /await markdownRenderer\.finish\(answer\)/);
  assert.doesNotMatch(source, /bubble\.setText\(answer\)/);
});

test("desktop AI chat keeps per-book threads and structured document or selection context", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(source, /const AI_CHAT_VIEW_TYPE = "qiaomu-book-reader-ai-chat"/);
  assert.match(source, /\[AI_CHAT_VIEW_TYPE, AiChatView\]/); // view registrations are table-driven in _registerReaderViews
  assert.match(source, /registerView\(viewType, \(leaf\) => new ViewClass\(leaf, this\)\)/);
  assert.match(source, /getRightLeaf\(false\)/);
  assert.match(source, /const AiChatView = class extends ItemView/);
  assert.match(source, /setContext\(value(?:, options = \{\})?\)/);
  assert.match(source, /find\(\(item\) => item\.bookPath && item\.bookPath === bookPath\)/);
  assert.match(source, /loadSession\(recent, \{[\s\S]*readerView,[\s\S]*bookFile,[\s\S]*pendingContext,[\s\S]*draft,[\s\S]*\}\)/);
  assert.doesNotMatch(source, /buildAiChatModelPicker\(footer, this\)/);
  assert.match(source, /function renderAiHeadMeta\(host, chat\)/);
  assert.doesNotMatch(source, /qiaomu-reader-ai-active-model/);
  assert.match(source, /AI_MARKDOWN_RENDER_INTERVAL_MS = 50/);
  assert.match(source, /enhanceAiMarkdown/);
  assert.match(source, /qiaomu-reader-ai-table-scroll/);
  assert.match(source, /checkbox\.disabled = true/);
  assert.match(source, /createNoteFromAiAnswer\(this\.app, this\.plugin, answer, source\.question, source\.context/);
  assert.match(source, /noteKind: "ai-answer"/);
  assert.match(source, /return composeAiAnswerNote\(\{\s*answer:/); // composed via the extracted excerpt composer
  assert.match(source, /act\("note", qiaomuReaderTranslate\("save-ai-response"\)/);
  assert.match(source, /createNoteFromAiAnswer[\s\S]*?open: false/);
  assert.match(source, /savedNote = note/);
  assert.doesNotMatch(source, /if \(note && typeof this\.close === "function"\) this\.close\(\)/);
  assert.match(source, /qiaomuReaderTranslate\(asAnswer \? "save-to-note" : "create-note"\)/);
  assert.match(source, /bookLinkHeading: qiaomuReaderTranslate\("ai-reading-notes"\)/);
  assert.doesNotMatch(source, /extra: "\\n\\n" \+ answer/);
  assert.match(source, /new ReadSettingsModal\(this\.app, this\.readerView, "ai"\)\.open\(\)/);
  assert.match(source, /aiMessages\(text, settings, turns, book\)/);
  assert.match(css, /\.qiaomu-reader-ai-sidebar \{[^}]*height: 100%;[^}]*display: flex;[^}]*overflow: hidden/s);
  assert.match(css, /\.qiaomu-reader-ai-sidebar \.qiaomu-reader-ai-log \{ min-height: 0; max-height: none; \}/);
  assert.match(source, /const AiChatHistoryModal = class extends Modal/);
  assert.match(source, /createEl\("textarea", \{ cls: "qiaomu-reader-ai-input" \}\)/);
  assert.match(source, /this\.inputController = bindReaderAiComposer\(this, input, send, footer\)/);
  assert.match(source, /items\.slice\(0, 3\)/);
  assert.match(source, /new AiChatHistoryModal\(this\.app, this\)\.open\(\)/);
  assert.match(source, /normalizeAiChatHistory\(this\.plugin\.settings\.aiChatHistory\)/);
  assert.match(source, /function readerPageContext\(view\)/);
  assert.match(source, /function readerDefaultAiContext\(view\)/);
  assert.match(source, /function readerAiPanelContext\(view\)/);
  assert.match(source, /unavailable: true,[\s\S]*bookFile: view\.file,[\s\S]*readerView: view/);
  assert.match(source, /kind: "document"/);
  assert.match(source, /pdfDocumentContext: packPdfDocumentContext/);
  assert.match(source, /getClientRects/);
  assert.match(source, /kind: "page"/);
  assert.match(source, /turn\.context/);
  assert.match(source, /renderAiUserTurn/);
  assert.match(source, /function renderAiContextQuote\(host, value, options = \{\}\)/);
  assert.match(source, /!isDocument && \(context\.text\.length > 120 \|\| context\.text\.includes\("\\n"\)\)/);
  assert.match(source, /cls: "qiaomu-reader-ai-context-preview", text: previewText/);
  assert.match(source, /!this\.pendingContext && !this\.turns\.length && this\.readerView/);
  assert.match(source, /function syncOpenAiReaderContext\(view\)/);
  assert.match(source, /if \(!readerIsPdf\(view\)\) \{\s*return \{\s*bookFile: view\.file/);
  assert.match(source, /nextContext\?\.text \|\| \(sameBook \? this\.text : ""\)/);
  assert.match(source, /getLeavesOfType\(AI_CHAT_VIEW_TYPE\)\[0\]/);
  assert.match(source, /readerAiPanelContext\(target\)/);
  assert.match(source, /syncOpenAiReaderContext\(this\);/);
  assert.match(source, /contextUnavailable/);
  assert.match(source, /function renderAiComposerPrompts\(host, chat\)/);
  assert.equal((source.match(/renderAiComposerPrompts\(c, this\);/g) || []).length, 2);
  assert.match(source, /function bindAiSlashPrompts\(menu, input, chat\)/);
  assert.match(source, /raw\.startsWith\("\/"\)/);
  assert.match(source, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(source, /event\.key === "Enter" && matches\.length/);
  assert.match(source, /event\.key === "Escape"/);
  assert.doesNotMatch(source, /createEl\("button", \{ cls: "qiaomu-reader-ai-context-refresh"/);
  assert.match(source, /remove-context-for-this-message/);
  assert.match(source, /trayButton\(null, "ai-reading"/);
  assert.match(source, /readerAiPanelContext\(this\)/);
  assert.doesNotMatch(source, /qiaomu-reader-pdf-note-btn|createNoteFromPdfPage|pdfNoteBtn/);
  assert.doesNotMatch(source, /bar\.createDiv\(\{ cls: "qiaomu-reader-ai-composer-hint"/);
  assert.match(source, /\[\["book", qiaomuReaderTranslate\("this-book"\)\], \["all", qiaomuReaderTranslate\("all-2"\)\]\]/);
  assert.match(source, /clear-all-chat-history/);
  assert.match(source, /this\.chat\._removeHistory\(\(item\) => !clearBook \|\| item\.bookPath === bookPath\)/);
  assert.match(source, /new ConfirmModal\(this\.app, \{/);
  assert.doesNotMatch(source, /window\.confirm\(/);
  assert.match(css, /\.qiaomu-reader-ai-composer \{/);
  assert.match(css, /\.qiaomu-reader-ai-composer:focus-within \{/);
  assert.match(css, /\.qiaomu-reader-ai-context \{/);
  assert.match(css, /-webkit-line-clamp:3/);
  assert.match(css, /\.qiaomu-reader-ai-context-text \{[^}]*max-height:180px;[^}]*overflow-y:auto/s);
  assert.match(css, /\.qiaomu-reader-ai-composer-prompts \{[^}]*overflow-x:auto/s);
  assert.match(css, /\.qiaomu-reader-ai-slash-menu \{[^}]*position:absolute;[^}]*max-height:min\(44vh,260px\)/s);
  assert.match(css, /\.qiaomu-reader-ai-modal \.qiaomu-reader-ai-slash-item \{[^}]*display:grid;[^}]*height:auto;[^}]*min-height:40px/s);
  assert.match(css, /\.qiaomu-reader-ai-modal \.qiaomu-reader-ai-slash-item\.is-active \{[^}]*box-shadow:inset 0 0 0 1px/s);
  assert.doesNotMatch(css, /\.qiaomu-reader-ai-modal \.qiaomu-reader-ai-slash-item\.is-active \{[^}]*inset 2px 0/s);
  assert.doesNotMatch(css, /\.qiaomu-reader-ai-context-refresh/);
  assert.match(css, /\.qiaomu-reader-ai-modal \.qiaomu-reader-ai-send:disabled:not\(\.is-stop\)/);
  assert.match(css, /\.qiaomu-reader-ai-msg-context \{/);
  assert.match(css, /\.qiaomu-reader-ai-history-scopes \{/);
  assert.match(css, /\.qiaomu-reader-ai-msg-streaming::after \{/);
  assert.match(css, /\.qiaomu-reader-ai-table-scroll \{/);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai \.qiaomu-reader-ai-table-scroll table \{/);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai blockquote \{/);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai \.task-list-item \{/);
  assert.match(css, /\.qiaomu-reader-ai-msg-me \{[^}]*background: var\(--background-secondary\)[^}]*color: var\(--text-normal\)/s);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai \{[^}]*border: 0;[^}]*background: transparent;/s);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai \.task-list-item \{[^}]*padding-left:1\.55em/s);
  assert.match(css, /\.qiaomu-reader-ai-msg-ai \.task-list-item > input\[type="checkbox"\] \{[^}]*position:absolute;[^}]*left:0;/s);
  assert.doesNotMatch(css, /\.qiaomu-reader-ai-msg-ai \.task-list-item \{[^}]*margin-left:-/s);
});

test("reader lifecycle cancels stale loads and releases PDF resources", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /async function extractPdf\(file, app, _settings = \{\}, onProgress, options = \{\}\)/);
  assert.match(source, /const signal = options\.signal/);
  assert.match(source, /throwIfReaderLoadAborted\(signal\)/);
  assert.match(source, /async function loadReaderDocument\(file, app, settings, onProgress, options = \{\}\)/);
  assert.match(source, /extractPdf\(file, app, settings, onProgress, options\)/);
  assert.match(source, /const loadToken = this\._loadCoordinator\.begin\(\)/);
  assert.match(source, /loadReaderDocument\(this\.file, this\.app, this\.plugin\.settings,[\s\S]*signal: loadToken\.signal/);
  assert.match(source, /if \(!this\._loadCoordinator\.isCurrent\(loadToken\)\) \{[\s\S]*lazy\?\.destroy\?\.\(\)/);
  assert.equal((source.match(/this\._loadCoordinator\.cancel\(\);/g) || []).length, 2);
  assert.match(source, /this\._pdfLazy\?\.destroy\?\.\(\)/);
  assert.match(source, /_loadingTask: loadingTask/);
  assert.match(source, /try \{ void loadingTask\.destroy\(\); \} catch/);
  assert.match(source, /async makePdfThumb\(pdfFile\)[\s\S]*return this\._renderPdfCover\(bytes\)/); // thumbnail delegates to the shared PDF cover renderer
  assert.match(source, /async _renderPdfCover\(bytes\)[\s\S]*const loadingTask = pdfjsLib\.getDocument\([\s\S]*finally \{[\s\S]*await loadingTask\.destroy\(\)/);
  assert.doesNotMatch(source, /doc\.destroy\(\)/);
});

test("AI settings explain and verify provider-specific ACP instead of a generic install", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /cliAcpSupport\(s\.aiProvider\)/);
  assert.match(source, /probeCliAcp\(s\.aiProvider/);
  assert.doesNotMatch(source, /warmCliAiSession\(cfg\.id/); // Opening a book must not initialize a model session.
  assert.match(source, /this-cli-includes-acp/);
  assert.match(source, /this-cli-requires-the-separate-0-adapter/);
  assert.match(source, /acp-adapter-path/);
  assert.match(source, /resolveAcpPath\(s\.aiProvider/);
  assert.match(source, /why-acp-matters/);
  assert.match(source, /built-in-acp-no-extra-install/);
  assert.match(source, /community-adapter-one-click-setup/);
  assert.match(source, /copyToClipboard\(acp\.installCommand\)/);
  assert.match(source, /pluginAcpInstallRoot\(plugin, cfg\.id, acp\.installVersion\)/);
  assert.match(source, /set-up-acp/);
  assert.match(source, /installCliAcp\(cfg\.id, \{ installRoot \}\)/);
  assert.match(source, /set-up-acp-checks-for-an-existing-installation/);
});

test("book-note append asks to open only once", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const start = source.indexOf("async function exportHighlightsToBookNote");
  const end = source.indexOf("const HighlightExportModal", start);
  const exportSource = source.slice(start, end);
  assert.match(source, /bookNoteAppendPromptSeen: false/);
  assert.match(exportSource, /bookNoteAppendPromptSeen !== true/);
  assert.match(exportSource, /bookNoteAppendPromptSeen = true/);
  assert.match(exportSource, /await plugin\._saveLocalData\(\)/);
});

test("reader chrome stays white and removes only the reader's redundant host header", () => {
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.qiaomu-reader-top, \.qiaomu-reader-bot \{ background:#fff/);
  assert.match(css, /\.workspace-leaf-content\[data-type="qiaomu-reader"\] > \.view-header \{ display:none; \}/);
  assert.match(css, /\.qiaomu-reader-area \{[^}]*background:var\(--qiaomu-reader-bg/s);
});

test("immersive reader chrome overlays the page and retracts without reserving rows", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const chinese = fs.readFileSync(new URL("../src/i18n-zh.js", import.meta.url), "utf8");
  assert.match(css, /\.qiaomu-reader-top \{[^}]*position:absolute;[^}]*height:40px;[^}]*border-radius:0/s);
  assert.match(css, /\.qiaomu-reader-bot \{[^}]*position:absolute;[^}]*height:40px;[^}]*border-radius:0/s);
  assert.match(css, /\.qiaomu-reader-ibtn \{[^}]*width:36px;[^}]*height:36px;[^}]*border-radius:10px/s);
  assert.match(css, /\.qiaomu-reader-timerbtn \{[^}]*height:36px;[^}]*border-radius:10px/s);
  assert.match(css, /\.qiaomu-reader-area \{[^}]*margin:0;[^}]*border:0;[^}]*box-shadow:none/s);
  assert.match(css, /\.qiaomu-reader-immersive \.qiaomu-reader-top \{[^}]*opacity:0;[^}]*translateY/s);
  assert.match(css, /\.qiaomu-reader-immersive \.qiaomu-reader-bot \{[^}]*opacity:0;[^}]*transform:translateY\(calc\(100% \+ 16px\)\)/s);
  assert.match(css, /\.qiaomu-reader-fullscreen-modal \.qiaomu-reader-pbar \{\s*position:absolute/s);
  assert.match(css, /\.qiaomu-reader-bot-center \{[^}]*flex-direction:row/s);
  assert.match(css, /\.qiaomu-reader-pct::before \{ content:"·"/);
  assert.match(source, /function setupImmersiveChrome\(view, root\)/);
  assert.match(source, /root\.addEventListener\("focusin", reveal\)/);
  assert.doesNotMatch(source, /root\.addEventListener\("pointerdown", reveal\)/);
  assert.doesNotMatch(source, /root\.addEventListener\("touchstart", reveal/);
  assert.match(source, /if \(!handleAreaNavClick\(view, ev\)\) revealReaderChromeFromPage\(view, ev\)/);
  assert.match(source, /event\.clientY <= rect\.top \+ 64/);
  assert.match(source, /\.qiaomu-reader-panel-open,\.qiaomu-reader-overlay-on,\.qiaomu-reader-hl-popup-on/);
  assert.equal((source.match(/wireReaderChrome\(this, root\);/g) || []).length, 2); // both views delegate chrome wiring to the shared helper
  assert.match(source, /function wireReaderChrome\(view, root\)/);
  assert.equal((source.match(/setupImmersiveChrome\(view, root\);/g) || []).length, 1);
  assert.match(source, /function setReaderTitle\(el, value, limit = 18\)/);
  assert.match(source, /glyphs\.slice\(0, limit\)\.join\(""\).*…/);
  assert.match(source, /setReaderTitle\(view\.titleEl, opts\.title\)/); // top-bar factory sets titles for both readers
  assert.equal((source.match(/setReaderTitle\(/g) || []).length, 3); // definition + factory + one direct call
  assert.match(source, /"reading-note": `<svg[^`]+<path[^`]+<path[^`]+<path/s);
  assert.match(source, /trayButton\("reading-note"/); // note button rides the data-driven top-bar tray
  assert.match(source, /trayButton\("sliders"/); // settings button rides the data-driven tray
  assert.equal((source.match(/addBookFileMenu\(this\.app, menu, this\.file\);/g) || []).length, 1);
  assert.match(chinese, /上下控制层会完全收起/);
});

test("settings use task tabs, concise intros, and Chinese-first copy", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const chinese = fs.readFileSync(new URL("../src/i18n-zh.js", import.meta.url), "utf8");
  assert.match(source, /qiaomu-reader-settings-head/);
  assert.match(source, /qiaomu-reader-settings-intro/);
  assert.match(source, /body\.dataset\.tab = this\._tab/);
  assert.match(chinese, /"line-width": "每行字数"/);
  assert.match(chinese, /"data": "存储与同步"/);
  assert.match(chinese, /只改变书页；顶部和底部工具栏始终跟随 Obsidian/);
  assert.match(chinese, /按自己的阅读习惯调整，所有设置都会自动保存/);
  assert.match(chinese, /"confirm": "确定"/);
  assert.match(source, /if \(cfg\.id === "custom"\) this\._aiBaseRow\(c, s, p\)/);
  assert.match(source, /if \(needsSecret \|\| cfg\.id === "custom"\) this\._aiSecretRow\(c, s, p\)/);
  assert.match(source, /aiSecrets: \{\}, aiBases: \{\}/);
  assert.match(source, /settings\.aiSecrets\?\.\[providerId\]/);
  assert.match(source, /settings\.aiBases\?\.\[id\]/);
  assert.match(source, /qiaomuReaderTranslate\(cfg\.provider\.label\)/);
  assert.match(source, /aiModels: \{\}/);
  assert.match(source, /aiThinking: \{\}/);
  assert.match(source, /aiCliEfforts: \{\}/);
  assert.match(source, /setName\(qiaomuReaderTranslate\("reasoning-effort"\)\)/);
  assert.match(source, /_aiThinkingRow\(host, s\)[\s\S]{0,260}"thinking-mode"/); // thinking toggle rides the shared _readingToggle builder via _aiThinkingRow
  assert.match(source, /this\._settingsDisclosure\(advanced, "ai-connection-settings"\)/);
  assert.match(source, /createEl\("details", \{ cls: "qiaomu-reader-settings-disclosure" \}\)/);
  assert.match(source, /_readingDropdown\(host,\s*"body-font"/); // body-font row rides the shared dropdown builder in _groupAppearance
  assert.match(source, /setName\(qiaomuReaderTranslate\("font-size-2"\)\)/);
  assert.match(source, /setName\(qiaomuReaderTranslate\("line-spacing-2"\)\)/);
  assert.match(source, /labels: \{ ru: "Georgia", en: "Georgia", zh: "Georgia" \}/);
  assert.match(source, /labels: \{ ru: "Lora", en: "Lora", zh: "Lora" \}/);
  assert.match(source, /labels: \{ ru: "Inter", en: "Inter", zh: "Inter" \}/);
  assert.match(source, /id: "zhenkai"/);
  assert.match(source, /labels: \{ ru: "LXGW ZhenKai GB", en: "LXGW ZhenKai GB", zh: "霞鹜臻楷 GB" \}/);
  assert.match(source, /BUNDLED_FONT_FAMILIES\.zhuque/);
  assert.match(source, /labels: \{ ru: "Zhuque Fangsong", en: "Zhuque Fangsong", zh: "朱雀仿宋" \}/);
});

test("folder and template settings use searchable vault pickers", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const chinese = fs.readFileSync(new URL("../src/i18n-zh.js", import.meta.url), "utf8");
  assert.match(source, /const FolderPicker = class extends FuzzySuggestModal/);
  assert.match(source, /const CreateFolderModal = class extends Modal/);
  assert.match(source, /file instanceof TFolder && qiaomuReaderPath\(file\.path\)/);
  assert.match(source, /\{ kind: "root", path: "", label: qiaomuReaderTranslate\("vault-root"\) \}/);
  assert.match(source, /\{ kind: "create", path: "", label: qiaomuReaderTranslate\("create-new-folder"\) \}/);
  assert.match(source, /if \(item\.kind === "create"\)/);
  assert.match(source, /\.setIcon\("folder-open"\)/);
  assert.match(source, /\.setIcon\("file-search"\)/);
  assert.equal((source.match(/addFolderPathControl\(new Setting\(c\)/g) || []).length, 2); // two direct rows; the other two ride the pickFolder wrapper
  assert.equal((source.match(/pickFolder\(new Setting\(c\)/g) || []).length, 2);
  assert.equal((source.match(/pickFile\(new Setting\(c\)/g) || []).length, 2); // both note-path rows ride the pickFile wrapper
  assert.match(source, /target instanceof TFolder/);
  assert.match(source, /await this\.app\.vault\.createFolder\(path\)/);
  assert.match(css, /\.qiaomu-reader-folder-setting \.setting-item-control \{[^}]*grid-template-columns:minmax\(180px,1fr\) 32px/s);
  assert.match(css, /\.qiaomu-reader-folder-path-input\[aria-invalid="true"\]/);
  assert.match(css, /@media \(pointer:coarse\) \{[^}]*\.qiaomu-reader-folder-setting \.setting-item-control/s);
  assert.match(chinese, /"choose-folder": "选择文件夹"/);
  assert.match(chinese, /"create-new-folder": "新建文件夹…"/);
});

test("quote template is language-neutral and migrates the old Russian fragment", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /const QUOTE_TEMPLATE_DEFAULT = "> \{text\}\\n\\n— \[\[\{book\}\]\]\{page\}\{link\}"/);
  assert.doesNotMatch(source, /— из \[\[\{book\}\]\]/i);
  assert.match(source, /quoteTemplate\.replace\(\/\u2014\\s\+из/);
});

test("reading settings own their scroll area without horizontal overflow", () => {
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.qiaomu-reader-rs-modal \.modal-content\.qiaomu-reader-rs \{[^}]*overflow-x:hidden;[^}]*overflow-y:auto;[^}]*scrollbar-gutter:stable/s);
  assert.match(css, /\.qiaomu-reader-rs > \*, \.qiaomu-reader-rs-card, \.qiaomu-reader-rs-col, \.qiaomu-reader-rs-grid \{[^}]*min-width:0/s);
  assert.match(css, /\.qiaomu-reader-rs-modal \.modal-content\.qiaomu-reader-rs \{[^}]*padding-right:calc\(var\(--qiaomu-reader-pad\) \+ 8px\)/s);
  assert.match(css, /\.qiaomu-reader-rs \.qiaomu-reader-sz-row \{[^}]*grid-template-columns:44px minmax\(64px, 1fr\) 44px/s);
  assert.match(css, /\.qiaomu-reader-rs \.qiaomu-reader-rs-theme-card \.qiaomu-reader-rs-seg \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
});

test("reading settings split reading and AI assistance without exposing secrets", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const start = source.indexOf("const ReadSettingsModal");
  const end = source.indexOf("function parseNoteTags", start);
  const modalSource = source.slice(start, end);
  assert.match(modalSource, /initialTab = "reading"/);
  assert.match(modalSource, /\[\["reading", qiaomuReaderTranslate\("text-and-background"\)\], \["layout", qiaomuReaderTranslate\("turning-and-layout"\)\], \["ai", qiaomuReaderTranslate\("ai-reading"\)\]\]/);
  assert.match(modalSource, /_drawAi\(c\)/);
  assert.match(modalSource, /ai-assistance-is-not-set-up/);
  assert.match(modalSource, /setName\(qiaomuReaderTranslate\("enable-ai-assistance"\)\)/);
  assert.match(modalSource, /setName\(qiaomuReaderTranslate\("response-language"\)\)/);
  assert.doesNotMatch(modalSource, /AiPromptLibraryModal/);
  assert.match(modalSource, /openPluginAiSettings\(this\.app, plugin, \(\) => this\._draw\(\)\)/);
  assert.doesNotMatch(modalSource, /SecretComponent|api-key|base-url/);
  assert.doesNotMatch(modalSource, /changes-appear-immediately-and-are-saved-automatically/);
  assert.match(modalSource, /reading-is-not-about-remembering-everything-but-about-finding-id/);
  assert.match(modalSource, /qiaomu-reader-rs-card qiaomu-reader-rs-theme-card/);
  assert.match(modalSource, /colA\.createDiv\("qiaomu-reader-pan-sec"\)\.setText\(qiaomuReaderTranslate\("font-size"\)\)/);
  assert.match(modalSource, /createEl\("input", \{[\s\S]*type: "range"[\s\S]*min: "1\.4", max: "2\.2", step: "0\.05"/);
  assert.match(modalSource, /lineRange\.addEventListener\("input"[\s\S]*this\._apply\(true\)/);
  assert.match(modalSource, /lineRange\.addEventListener\("change"[\s\S]*this\._apply\(true\)/);
  assert.doesNotMatch(modalSource, /const quick = c\.createDiv\("qiaomu-reader-rs-quick"\)/);
  assert.match(source, /new ReadSettingsModal\(this\.app, this\.readerView, "ai"\)\.open\(\)/);
  assert.match(css, /\.qiaomu-reader-rs-tabs \{/);
  assert.match(css, /\.qiaomu-reader-rs-ai-card \{/);
});

test("AI setup uses one status-driven flow and enables only after a successful test", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const start = source.indexOf("_tabTranslate(");
  const end = source.indexOf("_tabData(c)", start);
  const tabSource = source.slice(start, end);
  assert.match(tabSource, /const state = aiSetupState\(this\.plugin\)/);
  assert.match(tabSource, /ai-assistance-is-not-set-up/);
  assert.match(tabSource, /enable-ai-assistance/);
  assert.doesNotMatch(tabSource, /setName\(qiaomuReaderTranslate\("ai-assisted-reading"\)\)[\s\S]*addToggle/);
  assert.match(source, /enableOnSuccess: true/);
  assert.match(source, /setButtonText\(options\.enableOnSuccess \? qiaomuReaderTranslate\("test-and-enable"\)/);
  assert.match(source, /s\.aiEnabled = true;[\s\S]*await this\.plugin\.saveAll\(\)/);
  assert.match(source, /s\.aiNeedsVerification = false/);
  assert.match(source, /s\.aiNeedsVerification = true/);
});

test("confirming AI settings automatically prepares, tests, and enables the selected provider", () => {
  const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const modalStart = source.indexOf("const SettingsGroupModal");
  const modalEnd = source.indexOf("const SettingsTab", modalStart);
  const modalSource = source.slice(modalStart, modalEnd);
  assert.match(modalSource, /constructor\(app, title, build, options = \{\}\)/);
  assert.match(modalSource, /typeof this\.options\.onDone === "function"/);
  assert.match(modalSource, /async function ensureAiCliReady\(plugin, onStage = \(\) => \{\}\)/);
  assert.match(modalSource, /installCliAcp\(cfg\.id, \{ installRoot \}\)/);
  assert.match(modalSource, /probeCliAcp\(cfg\.id/);
  assert.match(modalSource, /resolveCliPath\(cfg\.id, s\.aiCliPaths\[cfg\.id\]\)/);
  assert.doesNotMatch(modalSource, /const cliStatus = await probeCliAi/);
  assert.match(modalSource, /async function testAndEnableAi\(plugin, onStage = \(\) => \{\}\)/);
  assert.match(modalSource, /await testAndEnableAi\(plugin, setButtonText\)/);
  assert.match(modalSource, /plugin\.settings\.aiEnabled = true/);
  assert.match(modalSource, /plugin\.settings\.aiNeedsVerification = false/);
  assert.match(modalSource, /return false/);
});

test("recovered Codex transport diagnostics do not become saved answer text", async () => {
  const { stripCodexTransportNotice } = await import('../src/ai-cli.js');
  const warning = 'Warning: Falling back from WebSockets to HTTPS transport. stream disconnected before completion: Connection reset by peer (os error 54)';
  assert.equal(stripCodexTransportNotice(warning + '\n\n正式回答'), '正式回答');
  assert.equal(stripCodexTransportNotice('作者写道：Warning: keep this quotation'), '作者写道：Warning: keep this quotation');
  const parser = createCliStreamParser('codex-cli', () => {});
  for (const text of [warning, '正式回答']) parser.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }) + '\n');
  parser.finish();
  assert.equal(parser.result().answer, '正式回答');
});
