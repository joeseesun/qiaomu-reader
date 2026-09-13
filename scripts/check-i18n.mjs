import { HL_COLOR_SWATCHES } from "../src/highlight-colors.js";
import fs from "node:fs/promises";
import { parse } from "acorn";
import { QIAOMU_READER_EN } from "../src/i18n-en.js";
import { UI_LANGUAGES, UI_TRANSLATIONS } from "../src/i18n-languages.js";
import { AI_PROVIDER_CATEGORIES, AI_PROVIDERS } from "../src/ai-providers.js";
import { QIAOMU_READER_ZH_CN } from "../src/i18n-zh.js";

const source = await fs.readFile(new URL("../src/main.js", import.meta.url), "utf8");
const calibreModalSource = await fs.readFile(new URL("../src/calibre-modal.js", import.meta.url), "utf8");
const readingNoteSource = await fs.readFile(new URL("../src/reading-note.js", import.meta.url), "utf8");
const manifest = JSON.parse(await fs.readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));

function placeholders(value) {
  return [...String(value).matchAll(/\{[^{}\n]+\}/g)].map((match) => match[0]).sort();
}

function translatedLiterals(code) {
  const ast = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  const values = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" && node.callee?.type === "Identifier" && (node.callee.name === "qiaomuReaderTranslate" || node.callee.name === "tx")) {
      const arg = node.callee.name === "tx" ? node.arguments?.[1] : node.arguments?.[0];
      if (arg?.type === "Literal" && typeof arg.value === "string") values.add(arg.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
    }
  };
  visit(ast);
  return [...values];
}

const english = QIAOMU_READER_EN;
const isChineseSource = (key) => /[\u3400-\u9fff]/.test(key);
const chineseValue = (key) => isChineseSource(key) ? key : QIAOMU_READER_ZH_CN[key];
const missing = Object.keys(english).filter((key) => !isChineseSource(key) && (QIAOMU_READER_ZH_CN[key] == null || QIAOMU_READER_ZH_CN[key] === ""));
const usedLiterals = [...new Set([...translatedLiterals(source), ...translatedLiterals(calibreModalSource), ...AI_PROVIDER_CATEGORIES.map((c) => c.label),
  ...Object.values(AI_PROVIDERS).flatMap((p) => [p.label, p.description]).filter((value) => /[\u3400-\u9fffА-Яа-яЁё]/.test(value))])];
const missingUsedEnglish = usedLiterals.filter((key) => english[key] == null);
const missingUsedChinese = usedLiterals.filter((key) => !isChineseSource(key) && (QIAOMU_READER_ZH_CN[key] == null || QIAOMU_READER_ZH_CN[key] === ""));
const placeholderErrors = Object.keys(english).filter((key) =>
  JSON.stringify(placeholders(english[key])) !== JSON.stringify(placeholders(chineseValue(key))),
);
const bannedChineseCopy = [
  "报价", "报价单", "图书笔记", "读书笔记", "选择的新笔记", "选择的笔记",
  "书本笔记中的文字", "天气晴朗", "请先登录再添加翻译", "没有导出选择",
  "开放图书馆", "表示欢迎（入职）", "＃＃ 引号", "开发{0}", "移除背光",
];
const bannedCopyErrors = Object.entries(QIAOMU_READER_ZH_CN)
  .filter(([, value]) => bannedChineseCopy.some((phrase) => String(value).includes(phrase)))
  .map(([key, value]) => `${key} → ${value}`);
const cyrillicCopyErrors = Object.entries(QIAOMU_READER_ZH_CN)
  .filter(([, value]) => /[А-Яа-яЁё]/.test(String(value)))
  .map(([key, value]) => `${key} → ${value}`);

const errors = [];
if (missing.length) errors.push(`Missing Chinese translations: ${missing.join(" | ")}`);
if (missingUsedEnglish.length) errors.push(`Used strings missing from English dictionary: ${missingUsedEnglish.join(" | ")}`);
if (missingUsedChinese.length) errors.push(`Used strings missing from Chinese dictionary: ${missingUsedChinese.join(" | ")}`);
if (placeholderErrors.length) errors.push(`Placeholder mismatch: ${placeholderErrors.join(" | ")}`);
if (bannedCopyErrors.length) errors.push(`Literal or misleading Chinese copy: ${bannedCopyErrors.join(" | ")}`);
if (cyrillicCopyErrors.length) errors.push(`Russian text left in Chinese copy: ${cyrillicCopyErrors.join(" | ")}`);
if (!source.includes('let qiaomuReaderLanguage = "zh"') || !source.includes('language: "zh"')) {
  errors.push("Simplified Chinese is not the runtime and settings default");
}
if (source.includes("getLanguage")) {
  errors.push("The plugin still derives its default language from Obsidian instead of defaulting to Chinese");
}
if (!source.includes('import { translateUiText } from "./i18n-runtime.js"')
  || !source.includes("translateUiText(lang, s, QIAOMU_READER_EN, QIAOMU_READER_ZH_CN)")) {
  errors.push("Russian UI does not use the safe fallback for Chinese-first source strings");
}
if (!manifest.description || /[\u3400-\u9fff]|obsidian/i.test(manifest.description) || !/[.!?]$/.test(manifest.description)) {
  errors.push("manifest.json needs a concise English directory description without the redundant host name");
}
if (!/[\u3400-\u9fff]/.test(packageJson.description || "")) {
  errors.push("package.json description is not Chinese");
}
if (!source.includes('"book-reader-updated-to-0": "Qiaomu Reader has been updated to {0}"') && !QIAOMU_READER_ZH_CN["book-reader-updated-to-0"].startsWith("Qiaomu Reader")) {
  errors.push("The update notice is not branded and translated for Chinese users");
}
if (!source.includes("of UI_LANGUAGES") || !UI_LANGUAGES.some((language) => language.id === "zh")) {
  errors.push("Missing Simplified Chinese language option");
}
if (!source.includes("Object.values(READER_FONTS)")) errors.push("Font controls do not use the unified font registry");
if (!source.includes('id: "sourceHanSerif"') || !source.includes('id: "sourceHanSans"')) {
  errors.push("Source Han Serif and Source Han Sans are missing from the reader font registry");
}
if (!source.includes("BUNDLED_FONT_FAMILIES.zhuque")) {
  errors.push("The offline Zhuque Fangsong font is missing");
}

if (!source.includes('function backlinkLabel() { return "↩"; }')) {
  errors.push("Reading-note backlinks are not rendered as a quiet icon-only link");
}
if (!source.includes('registerObsidianProtocolHandler("qiaomu-book-reader"')) {
  errors.push("Qiaomu reading-note backlinks are missing");
}
if (!source.includes("iconBacklinksMigrated") || !source.includes("await syncHighlightsToReadingNote(this.app, this, bookPath, items)")) {
  errors.push("Existing managed reading notes are not migrated to icon-only backlinks on upgrade");
}
if (source.includes('.setName(qiaomuReaderTranslate("wording-of-that-link"))')) {
  errors.push("The retired text-label setting for reading-note backlinks is still visible");
}
if (!source.includes('svgIcon(mark, "qiaomu-library")') || source.includes('brand.createDiv("qiaomu-reader-lib-logo").setText("\\u{1F4DA}")')) {
  errors.push("The library still uses the old emoji logo instead of the Qiaomu book mark");
}
if (!source.includes("autoBookNote: true") || !source.includes("quotesToBookNote: true")) {
  errors.push("Reading notes and highlight synchronisation are not enabled by default");
}
if (!source.includes("const tplPath = bookNoteTemplatePath(this.app)")) {
  errors.push("Reading-note creation can still reuse the standalone excerpt template");
}
if (!source.includes("if (!isMarkedReadingNote(app, md)) continue")) {
  errors.push("Frontmatter inference can still capture ordinary or template notes");
}
if (!source.includes('fm["book-reader-note"] = true')) {
  errors.push("Created reading notes are not marked explicitly");
}
if (!readingNoteSource.includes("function headingRanges") || !source.includes("syncHighlightsToReadingNote")) {
  errors.push("Highlights and comments are not synchronised through a heading-managed reading-note section");
}
if (source.includes("const READING_HIGHLIGHTS_START") || source.includes("const READING_HIGHLIGHTS_END")) {
  errors.push("Internal reading-note boundary markers are still emitted into user notes");
}
if (source.includes('> **${qiaomuReaderTranslate("comment-on-a-highlight")}')) {
  errors.push("Highlight comments still render inside the quote block");
}
if ((source.match(/await persistCurrentReaderPosition\(this\)/g) || []).length < 2) {
  errors.push("Desktop and mobile readers do not flush the final automatic reading position on close");
}
if (!source.includes("pager.flow.isConnected") || !source.includes("pager.clip.isConnected")) {
  errors.push("Close-time progress can overwrite the paragraph anchor from detached layout geometry");
}
if (source.includes('id: "save-position"') || source.includes('svgIcon(saveBtn, "bookmark-plus")') || source.includes('setTitle(qiaomuReaderTranslate("add-restore-point"))')) {
  errors.push("The redundant manual restore-point action is still visible");
}
const runtimeSource = source.slice(source.indexOf('let qiaomuReaderLanguage = "zh"'));
if (runtimeSource.includes("saveNow(") || runtimeSource.includes("snap.manual")) {
  errors.push("Manual restore-point code or icon styling is still present in the runtime");
}
if (!source.includes('await reader.plugin.saveProgress(reader.file.path, current, total, block)')) {
  errors.push("Automatic reading progress is not flushed when the reader closes");
}
if (!source.includes("openOrCreateBookNoteBeside")
  || !source.includes('trayButton("reading-note", "the-book-note", () => openOrCreateBookNoteBeside(this.plugin, this.file))')
  || !source.includes('add("the-book-note", "file-text", () => openOrCreateBookNoteBeside(this.plugin, this.file))')
  || !source.includes('{ mode: "split" }')) {
  errors.push("The reader chrome does not create or open the reading note beside the book");
}
if (!source.includes('let body = "";') || !source.includes("stripGeneratedReadingNoteTitle") || !source.includes("readingNoteTitlesMigratedV4") || !source.includes("markedInText") || !source.includes("bookNoteFiles(this.app)")) {
  errors.push("Generated reading notes still repeat the filename as an H1 heading");
}
if (!source.includes('const QUICK_HL_COLOR_IDS = ["yellow", "green", "pink"]') || !source.includes('QUICK_HL_COLOR_IDS.includes(entry.id)')) {
  errors.push("Selection popup does not expose the intended three-colour palette");
}
if (!source.includes('comment: ["qiaomu-reader-hl-comment-btn", "message-square"') || !source.includes('createEl("textarea", { cls: "qiaomu-reader-hl-comment-textarea" })')) {
  errors.push("Selection popup does not provide an inline nearby comment editor");
}
if (!source.includes('button(row, "qiaomu-reader-hl-menu", "ellipsis"') || source.includes("qiaomu-reader-hl-note")) {
  errors.push("Selection popup must expose More and keep the separate-note action out of the primary row");
}
if (!source.includes('createDiv({ cls: "qiaomu-reader-hl-comment-quote", text })') || !source.includes('event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing') || !source.includes('event.key === "Escape"')) {
  errors.push("Inline comments must show the selected passage and support Cmd/Ctrl+Enter to save plus Escape to dismiss");
}
if (!source.includes('if (cfg.id === "custom") this._aiBaseRow(c, s, p)') || !source.includes('this._settingsDisclosure(advanced, "ai-connection-settings")')) {
  errors.push("AI connection details must remain behind progressive disclosure except required custom endpoints");
}
if (!source.includes("const DEFAULT_AI_QUICK_PROMPTS")
  || source.includes("const AiPromptLibraryModal = class extends Modal")
  || !source.includes("chat._send(item.prompt)")) {
  errors.push("AI quick prompts must stay built-in and send their full translated prompt");
}
if (!source.includes("bookNoteAppendPromptSeen !== true") || !source.includes("bookNoteAppendPromptSeen = true")) {
  errors.push("Book-note append still asks whether to open the note every time");
}
for (const font of ["Georgia", "Lora", "Inter"]) {
  if (!source.includes(`labels: { ru: "${font}", en: "${font}", zh: "${font}" }`)) {
    errors.push(`English font label has an unnecessary Chinese suffix: ${font}`);
  }
}
if (!source.includes('body.createDiv("qiaomu-reader-rs-card qiaomu-reader-rs-theme-card")')
  || !source.includes('createEl("input", {')
  || !source.includes('type: "range"')
  || !source.includes('label: qiaomuReaderTranslate("more-settings")')) {
  errors.push("Reading settings do not use primary controls with progressive disclosure");
}
if (/\bname:\s*qiaomuReaderTranslate\("(?:yellow|green|blue|pink)"\)/.test(source)) {
  errors.push("Highlight colour labels are translated eagerly before the saved language is loaded");
}
if (!source.includes('import { HL_COLOR_SWATCHES } from "./highlight-colors.js"')
  || !source.includes("HL_COLORS = HL_COLOR_SWATCHES.map(([id, name, css]) => ({ id, label: () => qiaomuReaderTranslate(name), css }))")) {
  errors.push("Highlight colour labels are not translated lazily through the swatch table");
}
for (const label of ["yellow", "green", "blue", "pink"]) {
  if (!HL_COLOR_SWATCHES.some(([id]) => id === label)) {
    errors.push(`Highlight colour label is missing from the lazy swatch table: ${label}`);
  }
}

const htmlTags = (value) => [...String(value).matchAll(/<\/?[a-zA-Z][^>]*>/g)].map((match) => match[0]);
const urls = (value) => [...String(value).matchAll(/https?:\/\/[^\s<>\)]+/g)].map((match) => match[0]).sort();
for (const [language, dictionary] of Object.entries(UI_TRANSLATIONS)) {
  for (const [key, value] of Object.entries(english)) {
    const translated = dictionary[key];
    if (typeof translated !== "string" || !translated.trim()) {
      errors.push(`${language}: missing translation for ${key}`);
      continue;
    }
    if (language === "ja" && /reading-3|设置|无法|请先|选择|文件夹|侧边栏|对话|默认|笔记/.test(translated)) {
      errors.push(`ja: Chinese text in Japanese translation for ${key}`);
    }
    if (translated === value && /\b(?:the|this|your|with|from|please|install|current|could)\b/i.test(value)) {
      errors.push(`${language}: untranslated English phrase for ${key}`);
    }
    if (JSON.stringify(placeholders(translated)) !== JSON.stringify(placeholders(value))) {
      errors.push(`${language}: placeholder mismatch for ${key}`);
    }
    if (value.startsWith("## ") && !translated.startsWith("## ")) errors.push(`${language}: Markdown heading differs for ${key}`);
    if (JSON.stringify(htmlTags(translated)) !== JSON.stringify(htmlTags(value))) {
      errors.push(`${language}: HTML tags differ for ${key}`);
    }
    if (JSON.stringify(urls(translated)) !== JSON.stringify(urls(value))) {
      errors.push(`${language}: URLs differ for ${key}`);
    }
  }
  for (const key of Object.keys(dictionary)) {
    if (!(key in english)) errors.push(`${language}: unknown source key ${key}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`i18n OK: ${Object.keys(english).length} keys; Simplified Chinese and ${Object.keys(UI_TRANSLATIONS).length} bundled language packs checked.`);
