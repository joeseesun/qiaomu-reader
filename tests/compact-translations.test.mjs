import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import fs from "node:fs";
import pako from "pako";
import { compactTranslations } from "../scripts/compact-translations.mjs";
import { decodeTranslationData } from "../src/compact-translations.js";
import { QIAOMU_READER_EN as en } from "../src/i18n-en.js";
import { QIAOMU_READER_ZH_CN as zh } from "../src/i18n-zh.js";
import { UI_TRANSLATIONS } from "../src/i18n-languages.js";
import { translateUiText } from "../src/i18n-runtime.js";
import { buildProfile } from "../scripts/build-profile.mjs";
import { EMBEDDED_PDF_CMAPS } from "../src/pdf-cmaps-data.js";

const root = path.resolve(import.meta.dirname, "..");
for (const profileName of ["standard", "community"]) {
  test(`${profileName} packed dictionaries retain every translation, legacy key and language fallback without Node`, async () => {
    const profile = buildProfile(profileName, root);
    const result = await build({
      stdin: { resolveDir: root, contents: `export {QIAOMU_READER_EN as en} from "./src/i18n-en.js"; export {QIAOMU_READER_ZH_CN as zh} from "./src/i18n-zh.js"; export {UI_TRANSLATIONS as others} from "./src/i18n-languages.js"; export {translateUiText} from "./src/i18n-runtime.js"; export {EMBEDDED_PDF_CMAPS as cmaps} from "./src/pdf-cmaps-data.js"; export {EmbeddedPdfBinaryDataFactory} from "./src/pdf-cmaps.js";` },
      bundle: true, format: "cjs", target: "es2018", write: false,
      plugins: [...profile.plugins, await compactTranslations(root)],
    });
    const module = { exports: {} };
    // A mobile realm has atob/typed arrays, but no require, Buffer or process.
    vm.runInNewContext(result.outputFiles[0].text, { module, atob });
    const api = module.exports;
    const actual = { en: api.en, zh: api.zh, ...api.others };
    const expected = { en, zh, ...UI_TRANSLATIONS };
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
    assert.deepEqual(JSON.parse(JSON.stringify(api.cmaps)), EMBEDDED_PDF_CMAPS);
    assert.equal(Object.isFrozen(api.cmaps), true);
    const factory = new api.EmbeddedPdfBinaryDataFactory();
    for (const filename of Object.keys(EMBEDDED_PDF_CMAPS)) {
      const bytes = await factory.fetch({ kind: "cMapUrl", filename });
      const original = fs.readFileSync(path.join(root, "node_modules/pdfjs-dist/cmaps", filename));
      assert.deepEqual(Buffer.from(bytes), original, filename);
      bytes[0] ^= 1;
      assert.deepEqual(Buffer.from(await factory.fetch({ kind: "cMapUrl", filename })), original, `${filename}: fresh transfer bytes`);
    }
    for (const [id, dictionary] of Object.entries(expected)) {
      for (const key of Object.keys(dictionary)) {
        assert.equal(api.translateUiText(id, key, api.en, api.zh), translateUiText(id, key, en, zh), `${id}: ${key}`);
      }
      for (const key of ["unknown-key", "查无此项"]) {
        assert.equal(api.translateUiText(id, key, api.en, api.zh), translateUiText(id, key, en, zh));
      }
    }
  });
}

test("packed data preserves Unicode, empty strings, missing entries and own property names", () => {
  const data = { keys: ["emoji", "empty", "missing", "__proto__"], locales: { en: ["中文 🌱 {0}", "", null, "literal property"] } };
  const payload = Buffer.from(pako.deflateRaw(JSON.stringify(data))).toString("base64");
  const { en: dictionary } = decodeTranslationData(payload);
  assert.equal(dictionary.emoji, "中文 🌱 {0}");
  assert.equal(dictionary.empty, "");
  assert.equal(Object.hasOwn(dictionary, "missing"), false);
  assert.equal(Object.hasOwn(dictionary, "__proto__"), true);
  assert.equal(dictionary.__proto__, "literal property");
  assert.equal(Object.getPrototypeOf(dictionary), Object.prototype);
});
