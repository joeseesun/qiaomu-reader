import { requestUrl, setIcon } from "obsidian";
import { SHELF_VIEWS, SHELF_MARKS, shelfDataUrl, shelfBookUrl, shelfPageUrl, shelfCoverUrl, normalizeShelfBooks, normalizeShelfTopics, normalizeShelfDetail, shelfOrder, searchShelf, shelfText, shelfSearchQuery, chineseStoreLinks, pickShelfComments, hackerNewsItemUrl, matchLibraryBooks, recommendShelf, toggleShelfMark, markedShelf, externalBookSearchUrls } from "./book-discovery.js";

const ANNA_NAME = "Anna’s Archive";
const HN_SOURCE_NAME = "Hacker News";
const SHELF_SOURCE_NAME = "Hacker Books";
const SHELF_PAGE = 24;

// One shelf per plugin session: the 3.5 MB list and opened details are fetched
// once and reused when the dialog is reopened.
function bookShelfCache(plugin) {
  plugin._bookShelf ??= { books: null, byId: new Map(), topics: [], full: false, pending: null, listeners: new Set(), details: new Map() };
  return plugin._bookShelf;
}
async function shelfJson(url) {
  const response = await requestUrl({ url, method: "GET", throw: false });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response.json;
}

/**
 * Browsing shelf inside the public book source: ranked lists from Hacker News
 * book mentions. ctx: { plugin, translate, chinese, locale(), vaultBooks(),
 * scroller, field, searchGutenberg(query) }.
 */
export class BookShelf {
  constructor(parent, ctx) {
    this.ctx = ctx;
    this.t = ctx.translate;
    this._chinese = ctx.chinese;
    this._alive = true;
    this._request = 0;
    this._shelf = bookShelfCache(ctx.plugin);
    // List, topic survive closing the dialog within this session.
    this._ui = this._shelf.ui ??= { view: "best", topic: "", mineStatus: "wish" };
    this._limit = SHELF_PAGE;
    this._query = "";
    this._detail = null;
    this._detailToken = 0;
    this._body = parent.createDiv({ cls: "qiaomu-reader-discovery-body" });
    this._typing = 0;
    this._onInput = () => {
      window.clearTimeout(this._typing);
      this._typing = window.setTimeout(() => this._setQuery(ctx.field.value), 250);
    };
    ctx.field.addEventListener("input", this._onInput);
    // Search results keep the page steady, so they redraw only while waiting for the shelf.
    this._onShelf = () => { if (this._alive && !this._detail && (!this._query || this._waiting)) this._render(); };
    this._shelf.listeners.add(this._onShelf);
    this._setQuery(ctx.field.value);
    this._render();
    void this._ensureShelf();
  }
  dispose() {
    this._alive = false;
    window.clearTimeout(this._typing);
    this.ctx.field.removeEventListener("input", this._onInput);
    this._shelf.listeners.delete(this._onShelf);
  }
  async _ensureShelf() {
    const shelf = this._shelf;
    if (shelf.full) return;
    shelf.pending ??= (async () => {
      const notify = () => { for (const listener of shelf.listeners) listener(); };
      const store = (books) => { shelf.books = books; shelf.byId = new Map(books.map((book) => [book.id, book])); };
      if (!shelf.books) {
        const [top, topics] = await Promise.all([shelfJson(shelfDataUrl("books-top")), shelfJson(shelfDataUrl("topics")).catch(() => [])]);
        store(normalizeShelfBooks(top));
        shelf.topics = normalizeShelfTopics(topics);
        notify();
      }
      store(normalizeShelfBooks(await shelfJson(shelfDataUrl("books"))));
      shelf.full = true;
      notify();
    })().catch((error) => {
      console.warn("Qiaomu Reader: book shelf failed", error);
      shelf.failed = true;
    }).finally(() => {
      shelf.pending = null;
      for (const listener of shelf.listeners) listener();
    });
    shelf.failed = false;
    return shelf.pending;
  }
  _setQuery(value) {
    const query = String(value || "").trim();
    if (query === this._query) return;
    this._query = query;
    this._detail = null;
    this._render();
  }
  _render() {
    if (!this._body) return;
    this._request += 1;
    this._waiting = false;
    this._body.empty();
    if (this._query) this._renderSearch();
    else this._renderBrowse();
  }
  _renderState(parent) {
    const shelf = this._shelf;
    const usable = shelf.books && (shelf.full || !this._query);
    if (usable && !shelf.failed) return false;
    this._waiting = true;
    const state = parent.createDiv({ cls: "qiaomu-reader-discovery-status" });
    state.setAttribute("role", "status");
    if (shelf.failed && !shelf.pending) {
      state.setText(this.t("shelf-load-failed"));
      const retry = state.createEl("button", { cls: "qiaomu-reader-discovery-text-btn", text: this.t("shelf-retry") });
      retry.addEventListener("click", () => { void this._ensureShelf(); this._render(); });
    } else state.setText(this.t("shelf-loading"));
    return !usable;
  }
  // Shelf IDs of books already in this vault's library, recomputed when the shelf grows.
  _owned() {
    if (!this._shelf.full) return new Set();
    if (this._ownedFor !== this._shelf.books) {
      const files = this.ctx.vaultBooks();
      this._ownedIds = matchLibraryBooks(this._shelf.books, files.map((file) => file.basename));
      this._ownedFor = this._shelf.books;
    }
    return this._ownedIds;
  }
  async _ensureCoIndex() {
    const shelf = this._shelf;
    if (shelf.coIndex || shelf.coPending) return;
    shelf.coPending = shelfJson(shelfDataUrl("co-index")).then((data) => { shelf.coIndex = data && typeof data === "object" ? data : {}; })
      .catch((error) => { console.warn("Qiaomu Reader: book recommendations failed", error); shelf.coIndex = {}; })
      .finally(() => { shelf.coPending = null; if (this._alive && !this._detail && !this._query) this._render(); });
  }
  _marks() { return this.ctx.plugin.settings.shelfMarks || {}; }
  // Recommendation seeds: books in the vault plus both reading lists.
  _seeds() {
    const seeds = new Set(this._owned());
    if (this._shelf.full) for (const id of Object.keys(this._marks())) if (this._shelf.byId.has(id)) seeds.add(id);
    return seeds;
  }
  async _toggleMark(book, status) {
    const plugin = this.ctx.plugin, previous = this._marks();
    const next = toggleShelfMark(previous, book.id, status);
    plugin.settings.shelfMarks = next;
    try { await plugin.saveAll(); }
    catch (error) {
      if (plugin.settings.shelfMarks === next) plugin.settings.shelfMarks = previous;
      throw error;
    }
  }
  _renderBrowse() {
    const ui = this._ui, seeds = this._seeds(), marks = this._marks();
    const hasMarks = Object.keys(marks).length > 0;
    if (this._shelf.full && ((ui.view === "foryou" && !seeds.size) || (ui.view === "mine" && !hasMarks))) ui.view = "best";
    const bar = this._body.createDiv({ cls: "qiaomu-reader-discovery-views" });
    const tabs = bar.createDiv({ cls: "qiaomu-reader-discovery-tabs", attr: { role: "tablist" } });
    for (const view of SHELF_VIEWS) {
      if ((view === "foryou" && !seeds.size) || (view === "mine" && !hasMarks)) continue;
      const tab = tabs.createEl("button", { text: this.t(`shelf-${view}`), attr: { type: "button", role: "tab", "aria-selected": String(view === ui.view) } });
      tab.toggleClass("is-active", view === ui.view);
      tab.addEventListener("click", () => { ui.view = view; this._limit = SHELF_PAGE; this._render(); });
    }
    const tools = bar.createDiv({ cls: "qiaomu-reader-discovery-tools" });
    if (this._shelf.topics.length) {
      const topicLabel = tools.createEl("label", { cls: "qiaomu-reader-discovery-topic" });
      topicLabel.createSpan({ cls: "qiaomu-reader-sr-only", text: this.t("shelf-all-topics") });
      const select = topicLabel.createEl("select", { cls: "dropdown" });
      select.createEl("option", { value: "", text: this.t("shelf-all-topics") });
      for (const topic of this._shelf.topics) select.createEl("option", { value: topic.slug, text: this._chinese ? topic.zh : topic.en });
      select.value = ui.topic;
      select.addEventListener("change", () => { ui.topic = select.value; this._limit = SHELF_PAGE; this._render(); });
    }
    if (ui.view === "mine") this._renderMineSwitch(marks);
    else {
      const hint = ui.view === "foryou" ? this.t("shelf-foryou-hint", seeds.size) : this.t(`shelf-${ui.view}-hint`);
      this._body.createDiv({ cls: "qiaomu-reader-discovery-view-hint", text: hint });
    }
    if (this._renderState(this._body)) return;
    let books;
    if (ui.view === "mine") {
      books = markedShelf(this._shelf.byId, marks, ui.mineStatus);
      if (ui.topic) books = books.filter((book) => book.tp.includes(ui.topic));
    } else if (ui.view === "foryou") {
      if (!this._shelf.coIndex) {
        void this._ensureCoIndex();
        this._body.createDiv({ cls: "qiaomu-reader-discovery-status", text: this.t("shelf-loading") });
        return;
      }
      books = recommendShelf(this._shelf.books, this._shelf.coIndex, seeds);
      if (ui.topic) books = books.filter((book) => book.tp.includes(ui.topic));
    } else books = shelfOrder(this._shelf.books, ui.view, { topic: ui.topic });
    if (!books.length) {
      this._body.createDiv({ cls: "qiaomu-reader-discovery-status", text: this.t("shelf-filter-empty") });
      return;
    }
    this._renderGrid(this._body, books.slice(0, this._limit));
    if (books.length > this._limit || !this._shelf.full) {
      const more = this._body.createEl("button", { cls: "qiaomu-reader-discovery-more", text: this.t(this._shelf.full ? "shelf-show-more" : "shelf-loading"), attr: { type: "button" } });
      more.disabled = !this._shelf.full;
      more.addEventListener("click", () => {
        const scroll = this.ctx.scroller.scrollTop;
        this._limit += SHELF_PAGE;
        this._render();
        this.ctx.scroller.scrollTop = scroll;
      });
    }
  }
  _renderMineSwitch(marks) {
    const ui = this._ui;
    const counts = Object.fromEntries(SHELF_MARKS.map((status) => [status, Object.values(marks).filter((mark) => mark.s === status).length]));
    if (!counts[ui.mineStatus]) ui.mineStatus = counts.wish ? "wish" : "read";
    const row = this._body.createDiv({ cls: "qiaomu-reader-discovery-mine" });
    for (const status of SHELF_MARKS) {
      const chip = row.createEl("button", { cls: "qiaomu-reader-discovery-chip", text: `${this.t(`shelf-mark-${status}`)} ${counts[status]}`, attr: { type: "button", "aria-pressed": String(ui.mineStatus === status) } });
      chip.toggleClass("is-active", ui.mineStatus === status);
      chip.addEventListener("click", () => { ui.mineStatus = status; this._limit = SHELF_PAGE; this._render(); });
    }
  }
  _activate(el, open) {
    el.addEventListener("click", open);
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
  }
  _renderSearch() {
    const list = this._body.createEl("section", { cls: "qiaomu-reader-discovery-section" });
    const heading = list.createDiv({ cls: "qiaomu-reader-discovery-section-head" });
    heading.createEl("h3", { text: this.t("shelf-search-results") });
    const clear = heading.createEl("button", { cls: "qiaomu-reader-discovery-text-btn", text: this.t("shelf-clear-search"), attr: { type: "button" } });
    clear.addEventListener("click", () => { this.ctx.field.value = ""; this.ctx.field.dispatchEvent(new Event("input")); this.ctx.field.focus(); });
    if (!this._renderState(list)) {
      const books = searchShelf(this._shelf.books, this._query, 24);
      if (books.length) this._renderGrid(list, books);
      else list.createDiv({ cls: "qiaomu-reader-discovery-status", text: this.t("shelf-no-match") });
    }
  }
  // Where to get a book: browser libraries, plus the plugin's own Gutenberg search below.
  _renderGet(parent, book) {
    const section = parent.createEl("section", { cls: "qiaomu-reader-discovery-section qiaomu-reader-discovery-get" });
    section.createEl("h3", { text: this.t("shelf-get-book") });
    const links = section.createDiv({ cls: "qiaomu-reader-discovery-get-links" });
    const urls = externalBookSearchUrls(shelfSearchQuery(book));
    const external = (text, href, primary = false) => {
      const link = links.createEl("a", { cls: primary ? "qiaomu-reader-discovery-btn mod-primary" : "qiaomu-reader-discovery-btn", href, attr: { target: "_blank", rel: "noopener noreferrer" } });
      link.createSpan({ text });
      setIcon(link.createSpan({ cls: "qiaomu-reader-discovery-link-icon" }), "arrow-up-right");
    };
    external(ANNA_NAME, urls?.anna || "https://annas-archive.gl/", true);
    external("Z-Library", urls?.zlibrary || "https://z-library.sk/");
    if (this._chinese) for (const [name, href] of chineseStoreLinks(book)) external(name, href);
    const gutenberg = links.createEl("button", { cls: "qiaomu-reader-discovery-btn", text: this.t("shelf-search-gutenberg"), attr: { type: "button" } });
    gutenberg.addEventListener("click", () => this.ctx.searchGutenberg(shelfSearchQuery(book)));
  }
  _renderGrid(parent, books) {
    const grid = parent.createDiv({ cls: "qiaomu-reader-discovery-grid" });
    for (const book of books) this._renderCard(grid, book);
  }
  _renderCover(parent, book) {
    const cover = parent.createDiv({ cls: "qiaomu-reader-discovery-cover" });
    const text = shelfText(book, this._chinese);
    const placeholder = () => { cover.empty(); cover.addClass("is-empty"); cover.createSpan({ text: text.title }); };
    const src = shelfCoverUrl(book.c);
    if (!src) return placeholder();
    const img = cover.createEl("img", { attr: { src, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" } });
    img.addEventListener("error", placeholder, { once: true });
  }
  _stats(book) {
    const n = (value) => value.toLocaleString(this.ctx.locale());
    return book.ru ? `${this.t("shelf-recommend-count", n(book.ru))} · ${this.t("shelf-mention-count", n(book.u))}` : this.t("shelf-mention-count", n(book.u));
  }
  _renderCard(grid, book) {
    const text = shelfText(book, this._chinese);
    const card = grid.createDiv({ cls: "qiaomu-reader-discovery-card", attr: { role: "button", tabindex: "0" } });
    this._renderCover(card, book);
    const info = card.createDiv({ cls: "qiaomu-reader-discovery-card-info" });
    info.createDiv({ cls: "qiaomu-reader-discovery-card-title", text: text.title });
    const meta = [book.a[0], book.y].filter(Boolean).join(" · ");
    if (meta) info.createDiv({ cls: "qiaomu-reader-discovery-card-meta", text: meta });
    const stats = info.createDiv({ cls: "qiaomu-reader-discovery-card-stats" });
    if (book.q != null) stats.createSpan({ cls: "qiaomu-reader-discovery-score", text: String(book.q) });
    stats.createSpan({ text: this._stats(book) });
    const mark = this._marks()[book.id]?.s;
    const badge = this._owned().has(book.id) ? "shelf-in-library" : mark ? `shelf-mark-${mark}` : "";
    if (badge) info.createDiv({ cls: "qiaomu-reader-discovery-owned", text: this.t(badge) });
    if (text.blurb) info.createDiv({ cls: "qiaomu-reader-discovery-card-blurb", text: text.blurb });
    this._activate(card, () => this._showDetail(book));
  }
  _showDetail(book) {
    const fromDetail = Boolean(this._detail);
    if (!fromDetail) this._scroll = this.ctx.scroller.scrollTop;
    this._detail = book;
    this._request += 1;
    const token = ++this._detailToken;
    const text = shelfText(book, this._chinese);
    this._body.empty();
    const page = this._body.createDiv({ cls: "qiaomu-reader-discovery-detail" });
    const back = page.createEl("button", { cls: "qiaomu-reader-discovery-text-btn qiaomu-reader-discovery-back", attr: { type: "button" } });
    setIcon(back.createSpan({ cls: "qiaomu-reader-discovery-link-icon" }), "arrow-left");
    back.createSpan({ text: this.t("shelf-clear-search") });
    back.addEventListener("click", () => {
      this._detail = null;
      this._render();
      this.ctx.scroller.scrollTop = this._scroll || 0;
    });
    const top = page.createDiv({ cls: "qiaomu-reader-discovery-detail-top" });
    this._renderCover(top, book);
    const info = top.createDiv({ cls: "qiaomu-reader-discovery-detail-info" });
    info.createEl("h3", { text: text.title });
    if (text.original) info.createDiv({ cls: "qiaomu-reader-discovery-original", text: text.original });
    if (text.subtitle) info.createDiv({ cls: "qiaomu-reader-discovery-subtitle", text: text.subtitle });
    const meta = [book.a.join(", "), book.y].filter(Boolean).join(" · ");
    if (meta) info.createDiv({ cls: "qiaomu-reader-discovery-card-meta", text: meta });
    const topics = book.tp.map((slug) => this._shelf.topics.find((topic) => topic.slug === slug)).filter(Boolean);
    if (topics.length) {
      const chips = info.createDiv({ cls: "qiaomu-reader-discovery-chips" });
      for (const topic of topics) chips.createSpan({ text: this._chinese ? topic.zh : topic.en });
    }
    const stats = info.createDiv({ cls: "qiaomu-reader-discovery-detail-stats" });
    if (book.q != null) stats.createSpan({ cls: "qiaomu-reader-discovery-score", text: this.t("shelf-score", book.q) });
    stats.createSpan({ text: this._stats(book) });
    if (this._owned().has(book.id)) stats.createSpan({ cls: "qiaomu-reader-discovery-owned", text: this.t("shelf-in-library") });
    if (text.blurb) info.createDiv({ cls: "qiaomu-reader-discovery-detail-blurb", text: text.blurb });
    const markRow = info.createDiv({ cls: "qiaomu-reader-discovery-marks" });
    const markStatus = info.createDiv({ cls: "qiaomu-reader-discovery-status", attr: { role: "status" } });
    const drawMarks = () => {
      markRow.empty();
      for (const [status, icon] of [["wish", "bookmark"], ["read", "check"]]) {
        const on = this._marks()[book.id]?.s === status;
        const button = markRow.createEl("button", { cls: "qiaomu-reader-discovery-btn", attr: { type: "button", "aria-pressed": String(on) } });
        button.toggleClass("is-on", on);
        setIcon(button.createSpan({ cls: "qiaomu-reader-discovery-link-icon" }), icon);
        button.createSpan({ text: this.t(`shelf-mark-${status}`) });
        button.addEventListener("click", async () => {
          for (const control of markRow.querySelectorAll("button")) control.disabled = true;
          markStatus.empty();
          try { await this._toggleMark(book, status); }
          catch (error) {
            console.warn("Qiaomu Reader: reading list save failed", error);
            if (this._alive && this._detail === book) markStatus.setText(this.t("saving-failed-check-vault-permissions-and-retry"));
          } finally {
            if (this._alive && this._detail === book) drawMarks();
          }
        });
      }
    };
    drawMarks();
    this._renderGet(page, book);
    const more = page.createDiv({ cls: "qiaomu-reader-discovery-detail-more" });
    const status = more.createDiv({ cls: "qiaomu-reader-discovery-status", text: this.t("shelf-loading") });
    this.ctx.scroller.scrollTop = 0;
    void this._loadDetail(book).then((detail) => {
      if (!this._alive || token !== this._detailToken) return;
      status.remove();
      this._renderDetailBody(more, book, detail);
    }).catch((error) => {
      if (!this._alive || token !== this._detailToken) return;
      console.warn("Qiaomu Reader: book detail failed", error);
      status.setText(this.t("shelf-load-failed"));
    });
    const web = page.createEl("a", { cls: "qiaomu-reader-discovery-credit-link", text: SHELF_SOURCE_NAME, href: shelfPageUrl(book.id), attr: { target: "_blank", rel: "noopener noreferrer" } });
    setIcon(web.createSpan({ cls: "qiaomu-reader-discovery-link-icon" }), "arrow-up-right");
  }
  async _loadDetail(book) {
    const cache = this._shelf.details;
    if (!cache.has(book.id)) {
      const request = shelfJson(shelfBookUrl(book.id)).then((data) => normalizeShelfDetail(data, book.id));
      cache.set(book.id, request);
      request.catch(() => cache.delete(book.id));
      if (cache.size > 60) cache.delete(cache.keys().next().value);
    }
    return cache.get(book.id);
  }
  _renderDetailBody(parent, book, detail) {
    const n = (value) => value.toLocaleString(this.ctx.locale());
    const stance = detail.stance;
    if (stance && stance.r + stance.n + stance.c > 0) {
      const section = parent.createEl("section", { cls: "qiaomu-reader-discovery-section" });
      section.createEl("h3", { text: this.t("shelf-hn-voices") });
      const bar = section.createDiv({ cls: "qiaomu-reader-discovery-stance" });
      const legend = section.createDiv({ cls: "qiaomu-reader-discovery-stance-legend" });
      for (const key of ["r", "n", "c"]) {
        if (!stance[key]) continue;
        bar.createSpan({ cls: `is-${key}` }).style.flexGrow = String(stance[key]);
        const item = legend.createSpan({ cls: `is-${key}` });
        item.createSpan({ cls: "qiaomu-reader-discovery-dot" });
        item.createSpan({ text: `${this.t(`shelf-stance-${key}`)} ${n(stance[key])}` });
      }
      for (const comment of pickShelfComments(detail.comments)) {
        const quote = section.createDiv({ cls: "qiaomu-reader-discovery-comment" });
        const head = quote.createDiv({ cls: "qiaomu-reader-discovery-comment-head" });
        if (comment.stance) head.createSpan({ cls: `qiaomu-reader-discovery-tag is-${comment.stance}`, text: this.t(`shelf-stance-${comment.stance}`) });
        const year = Number.isFinite(comment.ts) ? new Date(comment.ts * 1000).getFullYear() : "";
        head.createSpan({ text: [comment.by, year].filter(Boolean).join(" · ") });
        head.createEl("a", { text: HN_SOURCE_NAME, href: hackerNewsItemUrl(comment.id), attr: { target: "_blank", rel: "noopener noreferrer" } });
        quote.createDiv({ cls: "qiaomu-reader-discovery-comment-text", text: (this._chinese && comment.zh) || comment.x });
      }
    }
    if (detail.why && (detail.why.points.length || detail.why.fit) && this._chinese) {
      const section = parent.createEl("section", { cls: "qiaomu-reader-discovery-section" });
      section.createEl("h3", { text: this.t("shelf-why") });
      if (detail.why.points.length) {
        const list = section.createEl("ul", { cls: "qiaomu-reader-discovery-why" });
        for (const point of detail.why.points) list.createEl("li", { text: point });
      }
      for (const key of ["fit", "warn"]) {
        if (!detail.why[key]) continue;
        const row = section.createDiv({ cls: "qiaomu-reader-discovery-why-row" });
        row.createSpan({ cls: "qiaomu-reader-discovery-why-label", text: this.t(`shelf-${key}`) });
        row.createSpan({ text: detail.why[key] });
      }
    }
    const description = (this._chinese && detail.description.zh) || detail.description.en;
    if (description) {
      parent.createDiv({ cls: "qiaomu-reader-discovery-section qiaomu-reader-discovery-description", text: description });
    }
    const related = detail.related.map((id) => this._shelf.byId.get(id)).filter(Boolean).slice(0, 6);
    if (related.length) {
      const section = parent.createEl("section", { cls: "qiaomu-reader-discovery-section" });
      section.createEl("h3", { text: this.t("shelf-related") });
      this._renderGrid(section, related);
    }
  }
}
