import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

function replaceRequired(code, before, after) {
  if (!code.includes(before)) throw new Error(`Foliate compatibility patch no longer matches: ${before.slice(0, 80)}`);
  return code.replace(before, after);
}

const frameModule = fileURLToPath(new URL("../src/engine-frame.js", import.meta.url));

export function patchFoliateFrames(code, name) {
  const imports = [];
  if (["epub.js", "fb2.js", "mobi.js", "comic-book.js"].includes(name)) {
    code = replaceRequired(code, "URL.createObjectURL", "createEngineObjectURL");
    code = code.replaceAll("URL.createObjectURL", "createEngineObjectURL");
    code = replaceRequired(code, "URL.revokeObjectURL", "revokeEngineObjectURL");
    code = code.replaceAll("URL.revokeObjectURL", "revokeEngineObjectURL");
    imports.push("createEngineObjectURL", "revokeEngineObjectURL");
  } else if (name === "paginator.js") {
    code = replaceRequired(code, `return new Promise(resolve => {
            this.#iframe.addEventListener('load', () => {
                const doc = this.document`,
    "return loadEngineFrame(this.#iframe, src, doc => {");
    code = replaceRequired(code, `                resolve()
            }, { once: true })
            this.#iframe.src = src`, "");
    imports.push("loadEngineFrame");
  } else if (name === "fixed-layout.js") {
    code = replaceRequired(code, `return new Promise(resolve => {
            iframe.addEventListener('load', () => {
                const doc = iframe.contentDocument`,
    "return loadEngineFrame(iframe, src, doc => {");
    code = replaceRequired(code, `                resolve({
                    element, iframe,`, `                return {
                    element, iframe,`);
    code = replaceRequired(code, `                    onZoom,
                })
            }, { once: true })
            iframe.src = src`, `                    onZoom,
                }`);
    imports.push("loadEngineFrame");
  }
  return imports.length ? `import { ${imports.join(", ")} } from ${JSON.stringify(frameModule)}\n${code}` : code;
}

export function patchFoliatePaginator(code) {
  // ResizeObserver callbacks run during layout. Defer geometry writes to the
  // next frame so expanding a section cannot trigger an observer feedback loop.
  for (const method of ["expand", "render"]) {
    code = replaceRequired(code, `#observer = new ResizeObserver(() => this.${method}())`,
      `#resizeFrame = null
    #observer = new ResizeObserver(() => {
        if (this.#resizeFrame !== null) return
        this.#resizeFrame = requestAnimationFrame(() => {
            this.#resizeFrame = null
            this.${method}()
        })
    })`);
  }
  code = replaceRequired(code, "this.#observer.unobserve(this)", "this.#observer.disconnect()");
  code = replaceRequired(code, "if (this.document) this.#observer.unobserve(this.document.body)", "this.#observer.disconnect()");
  code = replaceRequired(code, "this.#view.destroy()\n        this.#view = null", "this.#view?.destroy()\n        this.#view = null");
  code = replaceRequired(code, "render() {\n        if (!this.#view) return", "render() {\n        if (!this.#view || !this.#container.clientWidth || !this.#container.clientHeight) return");
  code = replaceRequired(code, "expand() {\n        const { documentElement } = this.document",
    "expand() {\n        if (!this.#element.parentElement?.clientWidth || !this.#element.parentElement?.clientHeight) return\n        const { documentElement } = this.document");
  code = replaceRequired(code, "--_max-column-count-portrait: 1;", "--_max-column-count-portrait: var(--_max-column-count);");
  // An exception must not leave all later navigation permanently locked.
  code = replaceRequired(code, "async #turnPage(dir, distance) {\n        if (this.#locked) return\n        this.#locked = true",
    "async #turnPage(dir, distance) {\n        if (this.#locked || !this.#container.clientWidth || !this.#container.clientHeight) return\n        this.#locked = true\n        try {");
  code = replaceRequired(code, "        this.#locked = false\n    }\n    async prev(distance)",
    "        } finally { this.#locked = false }\n    }\n    async prev(distance)");
  // Font/layout callbacks can arrive after close; they must not retain or use
  // the detached document through another observer/render cycle.
  code = replaceRequired(code, "this.#replaceBackground(this.#view.docBackground, this.columnCount)\n        })",
    "if (this.#view) this.#replaceBackground(this.#view.docBackground, this.columnCount)\n        })");
  code = code.replaceAll("this.#view?.document?.fonts?.ready?.then(() => this.#view.expand())",
    "this.#view?.document?.fonts?.ready?.then(() => this.#view?.expand())");
  code = code.replaceAll("this.#observer.disconnect()",
    "this.#observer.disconnect(); cancelAnimationFrame(this.#resizeFrame); this.#resizeFrame = null");
  return code;
}

// Foliate's EPUB loader must read UTF-8 names that lack the ZIP UTF-8 flag,
// otherwise non-ASCII chapter files are unreachable and only the TOC renders.
export function patchFoliateZipLoader(code) {
  const options = JSON.stringify(fileURLToPath(new URL("../src/epub-zip.js", import.meta.url)));
  code = replaceRequired(code, "const reader = new ZipReader(new BlobReader(file))",
    "const reader = new ZipReader(new BlobReader(file), EPUB_ZIP_OPTIONS)");
  return `import { EPUB_ZIP_OPTIONS } from ${options}\n${code}`;
}

// esbuild's syntax target does not polyfill Object.groupBy / Map.groupBy.
// EPUB metadata calls both on open; iOS 17.0 lacks these built-ins.
export function patchFoliateEpubGrouping(code) {
  const module = fileURLToPath(new URL("../src/epub-grouping.js", import.meta.url));
  code = replaceRequired(code, "Object.groupBy(", "groupByObject(");
  code = code.replaceAll("Object.groupBy(", "groupByObject(");
  code = replaceRequired(code, "Map.groupBy(", "groupByMap(");
  code = code.replaceAll("Map.groupBy(", "groupByMap(");
  return `import { groupByObject, groupByMap } from ${JSON.stringify(module)}\n${code}`;
}

// Custom elements survive plugin unload. Scope them to this plugin and its
// locked dependency build, so reloads reuse compatible classes and upgrades
// cannot accidentally instantiate an older library's renderer.
export function foliateElements(root = process.cwd()) {
  const revision = createHash("sha256").update(fs.readFileSync(path.join(root, "package-lock.json")))
    .update(fs.readFileSync(fileURLToPath(import.meta.url)))
    .update(fs.readFileSync(frameModule)).digest("hex").slice(0, 12);
  const prefix = `qbr-${revision}-foliate`;
  return {
    define: { __QBR_ENGINE_VIEW_TAG__: JSON.stringify(`${prefix}-view`) },
    plugin: {
      name: "qbr-foliate-elements",
      setup(build) {
        build.onLoad({ filter: /node_modules[\\/]foliate-js[\\/](view|paginator|fixed-layout|epub|fb2|mobi|comic-book)\.js$/ }, async ({ path: file }) => {
          let code = await fs.promises.readFile(file, "utf8");
          if (path.basename(file) === "paginator.js") code = patchFoliatePaginator(code);
          if (path.basename(file) === "view.js") code = patchFoliateZipLoader(code);
          if (path.basename(file) === "epub.js") code = patchFoliateEpubGrouping(code);
          code = patchFoliateFrames(code, path.basename(file));
          code = code.replace(/(['"])foliate-(view|paginator|fxl)\1/g, (_, quote, type) => `${quote}${prefix}-${type}${quote}`);
          code = code.replace(/customElements\.define\(('([^']+)'|"([^"]+)"),/g,
            (_, literal) => `if (!customElements.get(${literal})) customElements.define(${literal},`);
          return { contents: code, loader: "js" };
        });
      },
    },
  };
}
