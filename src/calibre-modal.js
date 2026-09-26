import { Modal, Notice, Platform } from "obsidian";
import { QIAOMU_READER_EN } from "./i18n-en.js";
import { QIAOMU_READER_ZH_CN } from "./i18n-zh.js";
import { translateUiText } from "./i18n-runtime.js";
import {
  CALIBRE_BLOCK_BYTES,
  CALIBRE_FORMAT_ORDER,
  CALIBRE_WARN_BYTES,
  detectCalibredbPath,
  detectCalibreLibraryPath,
  findCalibreImportByIsbn,
  findCalibreImportByUuid,
  formatBytes,
  isCalibreSyntaxQuery,
  pickPreferredFormat,
  readCoverDataUrl,
  calibreCoverPath,
  calibreSafeFilename,
  resolveCalibreBookFile,
  searchCalibreLibrary,
} from "./calibre-library.js";

function tx(plugin, key, ...args) {
  const lang = plugin?.settings?.language || "zh";
  let out = translateUiText(lang, key, QIAOMU_READER_EN, QIAOMU_READER_ZH_CN);
  if (args.length) out = String(out).replace(/\{(\d+)\}/g, (m, d) => args[+d] == null ? m : args[+d]);
  return out;
}

export class CalibreSearchModal extends Modal {
  constructor(app, plugin, hooks) {
    super(app);
    this.plugin = plugin;
    this.hooks = hooks || {};
    this._query = "";
    this._syntax = false;
    this._books = [];
    this._selected = new Set();
    this._busy = false;
    this._error = "";
    this._mode = "";
    this._timer = 0;
    this._searchGen = 0;
    this._lastSearched = null;
    this._pendingQuery = "";
  }

  onOpen() {
    this.containerEl.addClass("qiaomu-reader-calibre-modal-container");
    this.modalEl.addClass("qiaomu-reader-calibre-modal");
    if (!Platform.isDesktopApp) {
      this._error = tx(this.plugin, "calibre-desktop-only");
    }
    this._draw();
    if (Platform.isDesktopApp) void this._search("");
  }

  onClose() {
    this._searchGen += 1;
    window.clearTimeout(this._timer);
    this.contentEl.empty();
  }

  _libraryPath() {
    return detectCalibreLibraryPath(this.plugin.settings.calibreLibraryPath);
  }

  _calibredbPath() {
    return detectCalibredbPath(this.plugin.settings.calibreCalibredbPath);
  }

  _allowedFormats() {
    const list = this.hooks.allowedFormats || CALIBRE_FORMAT_ORDER;
    return new Set([...list].map((x) => String(x).toLowerCase()));
  }

  _draw() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("qiaomu-reader-calibre-body");
    const head = contentEl.createDiv({ cls: "qiaomu-reader-calibre-head" });
    head.createEl("h2", { text: tx(this.plugin, "add-from-calibre") });
    const libraryPath = this._libraryPath();
    const status = head.createDiv({ cls: "qiaomu-reader-calibre-status" });
    if (!Platform.isDesktopApp) {
      status.setText(tx(this.plugin, "calibre-desktop-only"));
      return;
    }
    if (!libraryPath) {
      status.setText(tx(this.plugin, "calibre-library-missing"));
      return;
    }
    status.setText(tx(this.plugin, "calibre-library-using", libraryPath));

    const searchRow = head.createDiv({ cls: "qiaomu-reader-calibre-search" });
    const input = searchRow.createEl("input", {
      cls: "qiaomu-reader-calibre-search-input",
      attr: {
        type: "search",
        placeholder: tx(this.plugin, "calibre-search-placeholder"),
        spellcheck: "false",
        autocomplete: "off",
      },
    });
    input.value = this._query;
    this._searchInput = input;
    this._searchBusyEl = searchRow.createDiv({ cls: "qiaomu-reader-calibre-search-busy" });
    this._setSearchBusy(false);
    input.addEventListener("input", () => {
      this._query = input.value;
      this._scheduleSearch();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._flushSearch();
      }
    });
    window.setTimeout(() => input.focus(), 30);

    const syntaxRow = head.createDiv({ cls: "qiaomu-reader-calibre-syntax" });
    const syntax = syntaxRow.createEl("label");
    this._syntaxBox = syntax.createEl("input", { attr: { type: "checkbox" } });
    this._syntaxBox.checked = this._syntax;
    this._syntaxBox.addEventListener("change", () => {
      this._syntax = this._syntaxBox.checked;
      this._flushSearch();
    });
    syntax.createSpan({ text: tx(this.plugin, "calibre-advanced-syntax") });

    this._listEl = contentEl.createDiv({ cls: "qiaomu-reader-calibre-list" });
    this._foot = contentEl.createDiv({ cls: "qiaomu-reader-calibre-foot" });
    this._paintList();
    this._paintFoot();
  }

  _searchDelay(query) {
    return this._syntax || isCalibreSyntaxQuery(query) ? 520 : 320;
  }

  _scheduleSearch() {
    this._pendingQuery = this._query;
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => void this._search(this._pendingQuery), this._searchDelay(this._pendingQuery));
  }

  _flushSearch() {
    this._pendingQuery = this._query;
    window.clearTimeout(this._timer);
    void this._search(this._pendingQuery);
  }

  _setSearchBusy(on) {
    if (!this._searchBusyEl) return;
    this._searchBusyEl.toggleClass("is-on", !!on);
    this._searchBusyEl.setText(on ? tx(this.plugin, "calibre-searching") : "");
  }

  async _search(query) {
    const next = String(query ?? "");
    const syntax = !!(this._syntax || isCalibreSyntaxQuery(next));
    const token = `${syntax ? "s" : "q"}\0${next}`;
    if (token === this._lastSearched && !this._busy) return;
    const gen = ++this._searchGen;
    this._busy = true;
    this._setSearchBusy(true);
    if (this._foot) this._paintFoot();
    try {
      const libraryPath = this._libraryPath();
      if (!libraryPath) throw new Error("missing-library");
      const result = await searchCalibreLibrary({
        libraryPath,
        calibredbPath: this._calibredbPath(),
        query: next,
        limit: 40,
        syntax,
      });
      if (gen !== this._searchGen) return;
      this._lastSearched = token;
      this._books = result.books || [];
      this._mode = result.mode || "";
      this._error = "";
      const keep = new Set(this._books.map((b) => String(b.uuid || b.id)));
      for (const key of [...this._selected]) if (!keep.has(key)) this._selected.delete(key);
    } catch (error) {
      if (gen !== this._searchGen) return;
      console.warn("Qiaomu Reader: Calibre search failed", error);
      this._lastSearched = token;
      this._books = [];
      this._error = error && error.message === "calibredb-missing"
        ? tx(this.plugin, "calibre-calibredb-missing")
        : tx(this.plugin, "calibre-search-failed");
    } finally {
      if (gen === this._searchGen) {
        this._busy = false;
        this._setSearchBusy(false);
        this._paintList();
        this._paintFoot();
      }
    }
  }

  _bookKey(book) {
    return String(book.uuid || book.id);
  }

  _bookState(book) {
    const settings = this.plugin.settings;
    const mapped = findCalibreImportByUuid(settings, book.uuid)
      || findCalibreImportByIsbn(settings, book.isbn);
    if (mapped && this.app.vault.getAbstractFileByPath(mapped.path)) {
      return { kind: "imported", path: mapped.path };
    }
    const fmt = pickPreferredFormat(book.formats, this._allowedFormats());
    if (!fmt) return { kind: "unsupported" };
    const existing = this._matchVaultBook(book, fmt);
    if (existing) return { kind: "vault", path: existing.path, format: fmt };
    return { kind: "new", format: fmt };
  }

  _matchVaultBook(book, format) {
    const isbn = String(book.isbn || "").replace(/[^0-9Xx]/g, "");
    const title = String(book.title || "").trim().toLowerCase();
    const ext = String(format || "").toLowerCase();
    const files = this.hooks.vaultBooks ? this.hooks.vaultBooks() : [];
    for (const file of files) {
      if (ext && file.extension !== ext) continue;
      if (title && file.basename.toLowerCase() === title) return file;
      if (isbn && file.basename.replace(/[^0-9Xx]/g, "") === isbn) return file;
    }
    return null;
  }

  _paintList() {
    const host = this._listEl;
    if (!host) return;
    host.empty();
    if (this._error) {
      host.createDiv({ cls: "qiaomu-reader-calibre-empty", text: this._error });
      return;
    }
    if (!this._books.length) {
      const empty = this._query.trim()
        ? tx(this.plugin, "calibre-no-results")
        : tx(this.plugin, "calibre-recent-empty");
      host.createDiv({ cls: "qiaomu-reader-calibre-empty", text: empty });
      return;
    }
    const inner = host.createDiv({ cls: "qiaomu-reader-calibre-list-inner" });
    if (!this._query.trim() && this._mode === "recent") {
      inner.createDiv({ cls: "qiaomu-reader-calibre-hint", text: tx(this.plugin, "calibre-recent-hint") });
    }
    const libraryPath = this._libraryPath();
    for (const book of this._books) {
      const state = this._bookState(book);
      const key = this._bookKey(book);
      const row = inner.createDiv({ cls: "qiaomu-reader-calibre-row" });
      const check = row.createEl("input", { attr: { type: "checkbox" } });
      check.checked = this._selected.has(key);
      check.disabled = state.kind === "unsupported";
      check.addEventListener("change", () => {
        if (check.checked) this._selected.add(key);
        else this._selected.delete(key);
        this._paintFoot();
      });
      const cover = row.createDiv({ cls: "qiaomu-reader-calibre-cover" });
      const coverFile = calibreCoverPath(libraryPath, book);
      const url = coverFile ? readCoverDataUrl(coverFile) : "";
      if (url) cover.createEl("img", { attr: { src: url, alt: "" } });
      else cover.setText((book.title || "?").slice(0, 1));
      const body = row.createDiv({ cls: "qiaomu-reader-calibre-copy" });
      body.createDiv({ cls: "qiaomu-reader-calibre-title", text: book.title || tx(this.plugin, "untitled") });
      if (book.authors) body.createDiv({ cls: "qiaomu-reader-calibre-authors", text: book.authors });
      const meta = [];
      const formats = (book.formats || []).join(", ");
      if (formats) meta.push(formats);
      const fmt = state.format || pickPreferredFormat(book.formats, this._allowedFormats());
      const bytes = fmt && book.sizes ? book.sizes[fmt.toUpperCase()] : 0;
      if (bytes) meta.push(formatBytes(bytes));
      if (typeof book.posFrac === "number" && book.posFrac > 0.01) {
        meta.push(`${Math.round(book.posFrac * 100)}%`);
      }
      if (state.kind === "imported") meta.push(tx(this.plugin, "calibre-already-added"));
      else if (state.kind === "vault") meta.push(tx(this.plugin, "calibre-already-in-vault"));
      else if (state.kind === "unsupported") meta.push(tx(this.plugin, "calibre-unsupported-format"));
      body.createDiv({ cls: "qiaomu-reader-calibre-meta", text: meta.join(" · ") });
      row.addEventListener("click", (ev) => {
        if (ev.target === check || check.disabled) return;
        check.checked = !check.checked;
        check.dispatchEvent(new Event("change"));
      });
    }
  }

  _selectedBooks() {
    return this._books.filter((book) => this._selected.has(this._bookKey(book)));
  }

  _paintFoot() {
    const host = this._foot;
    if (!host) return;
    host.empty();
    const chosen = this._selectedBooks();
    let total = 0;
    let blocked = 0;
    let warn = 0;
    const allowed = this._allowedFormats();
    for (const book of chosen) {
      const fmt = pickPreferredFormat(book.formats, allowed);
      const bytes = Number(fmt && book.sizes ? book.sizes[fmt.toUpperCase()] : 0) || 0;
      total += bytes;
      if (bytes >= CALIBRE_BLOCK_BYTES) blocked += 1;
      else if (bytes >= CALIBRE_WARN_BYTES) warn += 1;
    }
    const summary = host.createDiv({ cls: "qiaomu-reader-calibre-summary" });
    summary.setText(chosen.length
      ? tx(this.plugin, "calibre-selected-summary", chosen.length, formatBytes(total))
      : tx(this.plugin, "calibre-select-hint"));
    if (warn && !blocked) summary.createDiv({ text: tx(this.plugin, "calibre-large-warning") });
    if (blocked) summary.createDiv({ text: tx(this.plugin, "calibre-too-large") });
    const add = host.createEl("button", { cls: "mod-cta", text: tx(this.plugin, "calibre-add-selected") });
    add.disabled = !chosen.length || this._busy || blocked > 0;
    add.addEventListener("click", () => void this._add());
  }

  async _add() {
    const chosen = this._selectedBooks();
    if (!chosen.length || this._busy) return;
    const libraryPath = this._libraryPath();
    const allowed = this._allowedFormats();
    const jobs = [];
    for (const book of chosen) {
      const state = this._bookState(book);
      if (state.kind === "unsupported") continue;
      const format = state.format || pickPreferredFormat(book.formats, allowed);
      const filePath = state.kind === "new" ? resolveCalibreBookFile(libraryPath, book, format) : "";
      if (state.kind === "new" && !filePath) {
        new Notice(tx(this.plugin, "calibre-file-missing", book.title));
        continue;
      }
      jobs.push({ book, state, format, filePath, libraryPath });
    }
    if (!jobs.length) return;
    this._busy = true;
    this._paintFoot();
    try {
      await this.hooks.addBooks(jobs);
      this.close();
    } catch (error) {
      console.warn("Qiaomu Reader: Calibre import failed", error);
      new Notice(tx(this.plugin, "calibre-import-failed"));
      this._busy = false;
      this._paintFoot();
    }
  }
}

export { calibreSafeFilename };
