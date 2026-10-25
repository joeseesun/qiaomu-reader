import path from "node:path";
import { pathToFileURL } from "node:url";
import pako from "pako";

// Keep editable dictionaries and source-language checks unchanged. Only the
// distributed bundle shares keys and compresses their static string values.
export async function compactTranslations(root = process.cwd()) {
  const modules = [
    ["en", "src/i18n-en.js", "QIAOMU_READER_EN"],
    ["zh", "src/i18n-zh.js", "QIAOMU_READER_ZH_CN"],
    ...["ja", "es", "fr", "de", "ko", "pt", "ru"].map(id => [id, `src/locales/${id}.js`, "default"]),
  ];
  const dictionaries = Object.fromEntries(await Promise.all(modules.map(async ([id, file, name]) => {
    const dictionary = (await import(pathToFileURL(path.join(root, file)).href))[name];
    if (!dictionary || Object.values(dictionary).some(value => typeof value !== "string")) {
      throw new Error(`Translation dictionary must contain only strings: ${file}`);
    }
    return [id, dictionary];
  })));
  const keys = [...new Set(Object.values(dictionaries).flatMap(Object.keys))].sort();
  const locales = Object.fromEntries(Object.entries(dictionaries).map(([id, dictionary]) =>
    [id, keys.map(key => Object.hasOwn(dictionary, key) ? dictionary[key] : null)]));
  // Use the already-locked pure JS codec used by JSZip. This avoids differing
  // host zlib versions changing the committed bundle during official rebuilds.
  const data = Buffer.from(pako.deflateRaw(JSON.stringify({ keys, locales }), { level: 9 })).toString("base64");
  const sources = new Map(modules.map(([id, file, name]) => [path.join(root, file),
    `import { translations } from "qbr:translations";\n${name === "default" ? "export default" : `export const ${name} =`} translations[${JSON.stringify(id)}];\n`]));
  return {
    name: "compact-reader-translations",
    setup(build) {
      build.onResolve({ filter: /^qbr:translations$/ }, () => ({ path: "data", namespace: "qbr-translations" }));
      build.onLoad({ filter: /.*/, namespace: "qbr-translations" }, () => ({
        resolveDir: root,
        contents: `import { decodeTranslationData } from ${JSON.stringify(path.join(root, "src/compact-translations.js"))};
export const translations = decodeTranslationData(${JSON.stringify(data)});\n`,
      }));
      build.onLoad({ filter: /[\\/]src[\\/](i18n-(en|zh)|locales[\\/](ja|es|fr|de|ko|pt|ru))\.js$/ }, ({ path: file }) => {
        const contents = sources.get(file);
        return contents === undefined ? undefined : { contents, loader: "js" };
      });
    },
  };
}
