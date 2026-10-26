import { vaultCatalog, bookMatches, bookMetadata } from './book-catalog.js';
import { showBookOwnership } from './book-ownership-ui.js';
function element(parent, tag, text, cls) {
  const node = parent.ownerDocument.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  parent.append(node); return node;
}
export function ebookMessage(error, t) {
  const code = error?.code;
  if (code === 'cancelled') return t('ebook.error-interrupted');
  if (['invalid-code', 'invalid-device'].includes(code)) return t('ebook.error-code');
  if (['unauthorized', 'inactive', 'device-revoked'].includes(code)) return t('ebook.error-access');
  if (code === 'device-limit') return t('ebook.error-devices');
  if (code === 'quota') return t('ebook.error-quota');
  if (code === 'save') return t('ebook.error-save');
  if (code === 'file') return t('ebook.error-file');
  if (code === 'busy') return t('ebook.error-busy');
  if (code === 'pending') return t('ebook.error-pending');
  if (['search-expired', 'file-expired', 'file-missing'].includes(code)) return t('ebook.error-expired');
  if (code === 'import') return t('book-download-failed');
  if (code === 'already-imported') return t('book-already-in-library');
  if (code === 'download-failed' || code === 'service-restarted') return t('ebook.error-download');
  return t('ebook.error-network');
}

export function displayEbookTitle(value) {
  const title = String(value || '');
  if (/[a-z\u3400-\u9fff]/.test(title) || !/[A-Z]{3}/.test(title)) return title;
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'at', 'by', 'from']);
  let index = 0;
  return title.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, word => {
    const lower = word.toLowerCase();
    return ['PDF', 'EPUB', 'ISBN', 'AI', 'DNA', 'USA'].includes(word) ? word
      : index++ && small.has(lower) ? lower : lower[0].toUpperCase() + lower.slice(1);
  });
}

let progressSequence = 0;
export function createEbookDownloadProgress(button, t) {
  const host = button.closest('.qiaomu-reader-ebook-result') || button.parentElement;
  host.querySelector(':scope > .qiaomu-reader-ebook-progress')?.remove();
  const root = element(host, 'div', undefined, 'qiaomu-reader-ebook-progress');
  const label = element(root, 'span'); label.id = 'qiaomu-ebook-progress-' + ++progressSequence;
  label.setAttribute('role', 'status');
  const track = element(root, 'div', undefined, 'qiaomu-reader-ebook-progress-track');
  track.setAttribute('role', 'progressbar'); track.setAttribute('aria-labelledby', label.id);
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
  return {
    get connected() { return root.isConnected; },
    update(state) {
      root.dataset.state = state;
      label.textContent = t('ebook.' + state);
      track.hidden = false;
      if (state === 'imported') track.setAttribute('aria-valuenow', '100');
      else track.removeAttribute('aria-valuenow');
      button.setAttribute('aria-busy', String(state !== 'imported'));
    },
    fail(message) {
      root.dataset.state = 'error'; label.textContent = message;
      track.hidden = true; button.setAttribute('aria-busy', 'false');
    }
  };
}

export function createEbookResult(parent, book, t, { onDownload, icon, pageUrl } = {}) {
  const row = element(parent, 'article', undefined, 'qiaomu-reader-discovery-result qiaomu-reader-ebook-result');
  const coverBox = element(row, 'div', undefined, 'qiaomu-reader-ebook-cover');
  const placeholder = element(coverBox, 'span', t('ebook.no-cover'), 'qiaomu-reader-ebook-no-cover');
  const image = element(coverBox, 'img'); image.hidden = true; image.alt = '';
  image.loading = 'eager'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
  const attribution = element(coverBox, 'a', t('ebook.reference-cover')); attribution.hidden = true;
  attribution.target = '_blank'; attribution.rel = 'noopener noreferrer';
  const info = element(row, 'div', undefined, 'qiaomu-reader-discovery-result-info');
  const title = element(info, 'strong', displayEbookTitle(book.title), 'qiaomu-reader-ebook-title');
  const longTitle = book.title.length > (/[\u3400-\u9fff]/.test(book.title) ? 46 : 90);
  if (longTitle) {
    title.classList.add('qiaomu-reader-ebook-title-clamped');
    const expand = element(info, 'button', t('ebook.show-title'), 'qiaomu-reader-ebook-title-toggle');
    expand.type = 'button'; expand.setAttribute('aria-expanded', 'false');
    expand.addEventListener('click', () => {
      const expanded = expand.getAttribute('aria-expanded') !== 'true';
      expand.setAttribute('aria-expanded', String(expanded));
      expand.textContent = t(expanded ? 'ebook.hide-title' : 'ebook.show-title');
      title.classList.toggle('qiaomu-reader-ebook-title-clamped', !expanded);
    });
  }
  if (book.author) element(info, 'span', book.author, 'qiaomu-reader-ebook-author');
  const metadata = [book.year, book.language].filter(Boolean);
  if (metadata.length) element(info, 'span', metadata.join(' · '), 'qiaomu-reader-ebook-meta');
  if (pageUrl) { const link = element(info, 'a', t('book-page')); link.href = pageUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  const file = element(row, 'div', undefined, 'qiaomu-reader-ebook-file');
  element(file, 'span', book.format.toUpperCase(), 'qiaomu-reader-ebook-format');
  if (book.size_str) element(file, 'span', book.size_str, 'qiaomu-reader-ebook-size');
  const button = element(file, 'button', undefined, 'qiaomu-reader-ebook-download'); button.type = 'button';
  if (icon) { const symbol = element(button, 'span'); symbol.setAttribute('aria-hidden', 'true'); icon(symbol, 'download'); }
  element(button, 'span', t('ebook.download'));
  button.addEventListener('click', () => onDownload?.(button));
  const setCover = cover => {
    if (!cover) return;
    image.onload = () => {
      if (!image.naturalWidth) return;
      image.hidden = false; placeholder.hidden = true; attribution.hidden = false;
    };
    image.onerror = () => { image.hidden = true; placeholder.hidden = false; attribution.hidden = true; };
    image.alt = t('ebook.cover-alt', displayEbookTitle(book.title));
    attribution.href = cover.sourceUrl; image.src = cover.url;
  };
  return { row, button, setCover };
}

export function mountEbookDiscovery(shell, plugin, library, t, { icon, sourceParent = shell, sharedForm, sharedField, onNavigate = () => {} } = {}) {
  const service = plugin.ebookLibrary;
  const view = shell.ownerDocument.defaultView;
  const sources = element(sourceParent, 'div', undefined, 'qiaomu-reader-ebook-sources');
  const localButton = sharedForm && element(sources, 'button', t('catalog.local'));
  if (localButton) localButton.type = 'button';
  const publicButton = element(sources, 'button', t('ebook.source-public'));
  const qiaomuButton = element(sources, 'button', t('ebook.source-qiaomu'));
  publicButton.type = qiaomuButton.type = 'button';
  if (sharedForm) { shell.classList.add('qiaomu-reader-find-unified'); sources.append(localButton, qiaomuButton, publicButton); }
  const localRoot = sharedForm && element(shell, 'section', undefined, 'qiaomu-reader-discovery-results');
  const publicRoot = element(shell, 'div');
  const premium = element(shell, 'section', undefined, 'qiaomu-reader-ebook-panel'); premium.hidden = true;
  let closed = false, active = false, aborter = null, epoch = 0, searchEpoch = 0;
  const createButton = (parent, text, click, cls) => {
    const button = element(parent, 'button', text, cls); button.type = 'button';
    button.addEventListener('click', click); return button;
  };
  let selected = sharedForm ? 'local' : 'public';
  const select = which => {
    selected = which;
    if (localRoot) localRoot.hidden = which !== 'local';
    localButton?.setAttribute('aria-pressed', String(which === 'local'));
    publicRoot.hidden = which !== 'public'; premium.hidden = which !== 'qiaomu';
    publicButton.setAttribute('aria-pressed', String(which === 'public'));
    qiaomuButton.setAttribute('aria-pressed', String(which === 'qiaomu'));
  };
  const cancel = () => { if (sharedForm) sharedForm.querySelector('button[type="submit"]').disabled = false; epoch++; searchEpoch++; aborter?.abort(); aborter = new AbortController(); };
  const live = ticket => !closed && active && ticket === epoch;
  async function render() {
    cancel(); const ticket = epoch, signal = aborter.signal; premium.replaceChildren();
    const status = element(premium, 'div', '', 'qiaomu-reader-discovery-status'); status.setAttribute('role', 'status');
    const tell = message => { if (live(ticket)) status.textContent = message; };
    const action = async (button, fn) => {
      if (button.disabled) return; button.disabled = true;
      try { await fn(); } catch (error) { tell(ebookMessage(error, t)); }
      finally { if (live(ticket)) button.disabled = false; }
    };
    const activation = () => {
      element(premium, 'p', t('ebook.activate-help'), 'qiaomu-reader-discovery-intro');
      const form = element(premium, 'form', undefined, 'qiaomu-reader-discovery-search');
      const label = element(form, 'label', t('ebook.code')), input = element(label, 'input');
      input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 40;
      const submit = element(form, 'button', t('ebook.activate')); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); void action(submit, async () => {
        tell(t('ebook.activating')); const code = input.value;
        await service.activate(code, signal); if (live(ticket)) { input.value = ''; await render(); }
      }); });
      input.focus();
    };
    let activated;
    try { activated = service.isActivated(); }
    catch (error) { tell(ebookMessage(error, t)); createButton(premium, t('ebook.retry'), () => void render()); return; }
    if (!activated) { activation(); return; }
    let profile; tell(t('ebook.connecting'));
    try { profile = await service.profile(signal); }
    catch (error) {
      if (!live(ticket)) return;
      tell(ebookMessage(error, t));
      if (['inactive', 'unauthorized', 'device-revoked'].includes(error.code)) activation();
      else createButton(premium, t('ebook.retry'), () => void render());
      return;
    }
    if (!live(ticket)) return;
    tell('');
    const account = element(premium, 'div', undefined, 'qiaomu-reader-ebook-account');
    const profileText = value => t('ebook.remaining', Math.max(0, value.dailyLimit - value.usedToday), value.dailyLimit);
    const accountText = element(account, 'span', profileText(profile));
    const details = element(account, 'details', undefined, 'qiaomu-reader-ebook-account-details');
    element(details, 'summary', t('ebook.account'));
    const detailBody = element(details, 'div');
    element(detailBody, 'span', t('ebook.expires', new Date(profile.expiresAt * 1000).toLocaleDateString(plugin.settings.language || 'zh')));
    const logout = createButton(detailBody, t('ebook.sign-out'), () => void action(logout, async () => { await service.logout(signal); if (live(ticket)) await render(); }));
    const form = sharedForm || element(premium, 'form', undefined, 'qiaomu-reader-discovery-search');
    const field = sharedField || element(element(form, 'label', t('book-title-or-author')), 'input');
    field.type = 'search'; field.maxLength = 160; field.autocomplete = 'off';
    const submit = sharedForm ? sharedForm.querySelector('button[type="submit"]') : element(form, 'button', t('search')); submit.type = 'submit';
    const toolbar = element(premium, 'div', undefined, 'qiaomu-reader-ebook-toolbar'); toolbar.hidden = true;
    const count = element(toolbar, 'span'); count.setAttribute('role', 'status');
    const filters = element(toolbar, 'div', undefined, 'qiaomu-reader-ebook-filters');
    const results = element(premium, 'div', undefined, 'qiaomu-reader-discovery-results');
    const coverNote = element(premium, 'p', t('ebook.cover-note'), 'qiaomu-reader-ebook-cover-note'); coverNote.hidden = true;
    async function download(book, button, resume) {
      if (button.disabled) return;
      const text = button.textContent;
      const feedback = createEbookDownloadProgress(button, t);
      feedback.update('queued'); button.textContent = t('ebook.working'); tell('');
      await action(button, async () => {
        try {
          await service.download(book, files => library._importBooks(files), state => {
            if (live(ticket)) { feedback.update(state); if (!feedback.connected) tell(t('ebook.' + state)); }
          }, signal, resume);
        } catch (error) {
          if (live(ticket)) feedback.fail(ebookMessage(error, t));
          throw error;
        }
        if (!live(ticket)) return;
        feedback.update('imported');
        tell(t('book-import-finished')); button.disabled = true; button.textContent = t('ebook.imported');
        button.dataset.imported = 'true';
        try { const next = await service.profile(signal); if (live(ticket)) accountText.textContent = profileText(next); }
        catch { /* The verified vault import remains successful when profile refresh fails. */ }
      });
      if (live(ticket)) { if (button.dataset.imported) button.disabled = true; else button.textContent = text; }
    }
    async function covers(books, rows, searchTicket) {
      if (!service.covers) return;
      let pending = books, rounds = 0;
      try {
        while (pending.length && rounds++ < 40 && live(ticket) && searchTicket === searchEpoch) {
          const values = await service.covers(pending, signal);
          if (!live(ticket) || searchTicket !== searchEpoch) return;
          for (const value of values) if (value.cover) rows.get(value.id)?.setCover(value.cover);
          const ids = new Set(values.filter(value => value.pending).map(value => value.id));
          pending = pending.filter(book => ids.has(book.id));
          if (pending.length) await new Promise(resolve => {
            const finish = () => { view.clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
            const timer = view.setTimeout(finish, 1500); signal.addEventListener('abort', finish, { once: true });
            if (signal.aborted) finish();
          });
        }
      } catch { /* Optional covers never replace successful search results with an error. */ }
    }
    const search = event => { if (!live(ticket)) return; event.preventDefault(); void action(submit, async () => {
      if (!field.value.trim()) { field.focus(); return; }
      const searchTicket = ++searchEpoch;
      tell(t('searching-books')); results.replaceChildren(); toolbar.hidden = true; coverNote.hidden = true;
      const query = field.value;
      const localCheck = plugin.searchCalibreBooks?.(query).catch(() => ({ books: [], available: false }));
      const books = await service.search(query, signal); if (!live(ticket) || searchTicket !== searchEpoch) return;
      tell(books.length ? '' : t('no-books-found')); toolbar.hidden = !books.length; coverNote.hidden = !books.length;
      filters.replaceChildren(); const rows = new Map();
      const owned = plugin.bookFiles ? vaultCatalog(plugin) : [];
      owned.push(...(plugin.bookRecords?.entries() || []).filter(record => !owned.some(book => book.path === record.path)));
      for (const book of books) {
        const row = createEbookResult(results, book, t, { icon, onDownload: button => void download(book, button) });
        rows.set(book.id, row);
        showBookOwnership(row, book, plugin, t, { records: owned, onNavigate });
      }
      void Promise.resolve(localCheck).then(result => {
        if (!live(ticket) || searchTicket !== searchEpoch) return;
        for (const book of books) {
          if (!rows.get(book.id).row.querySelector('.qiaomu-reader-ebook-owned')) showBookOwnership(rows.get(book.id), book, plugin, t, { records: [], calibre: result?.books || [] });
        }
      });
      const buttons = new Map();
      const filter = format => {
        let visible = 0;
        for (const book of books) { const show = !format || book.format === format; rows.get(book.id).row.hidden = !show; if (show) visible++; }
        count.textContent = t('ebook.result-count', visible);
        for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === format));
      };
      for (const format of ['', ...new Set(books.map(book => book.format))]) {
        const button = createButton(filters, format ? format.toUpperCase() : t('ebook.all-formats'), () => filter(format));
        buttons.set(format, button);
      }
      filter(''); void covers(books, rows, searchTicket);
    }); };
    form.addEventListener('submit', search);
    signal.addEventListener('abort', () => form.removeEventListener('submit', search), { once: true });
    field.focus();
    const historyTicket = searchEpoch;
    try {
      const jobs = await service.jobs(signal); if (!live(ticket) || historyTicket !== searchEpoch || !jobs.length) return;
      const recent = element(premium, 'section', undefined, 'qiaomu-reader-ebook-recent'); element(recent, 'h3', t('ebook.recent'));
      for (const job of jobs) {
        const row = element(recent, 'div', undefined, 'qiaomu-reader-discovery-result');
        element(row, 'span', job.result?.filename || t('ebook.' + job.state));
        const button = createButton(row, t('ebook.resume'), () => void download(null, button, job.id));
      }
    } catch (error) { if (historyTicket === searchEpoch && error.code !== 'cancelled') tell(ebookMessage(error, t)); }
  }
  let localTicket = 0;
  async function searchLocal() {
    const request = ++localTicket;
    localRoot.replaceChildren();
    const query = sharedField.value;
    const books = vaultCatalog(plugin).filter(book => bookMatches(book.file, book, query));
    element(localRoot, 'p', t('catalog.local-count', books.length));
    for (const book of books.slice(0, 50)) {
      const row = createEbookResult(localRoot, { ...book, title: book.title || book.file.basename, format: book.file.extension }, t, { onDownload: () => { onNavigate(); void plugin.openFile(book.file); } });
      row.button.textContent = t('catalog.open');
    }
    if (books.length > 50) element(localRoot, 'p', t('catalog.narrow'));
    if (!query.trim()) return;
    const status = element(localRoot, 'p', t('catalog.calibre-checking'));
    try {
      const result = await plugin.searchCalibreBooks(query);
      if (closed || request !== localTicket) return;
      status.textContent = t(result.available ? 'catalog.calibre-count' : 'catalog.calibre-unavailable', result.books.length);
      for (const book of result.books) {
        const row = createEbookResult(localRoot, { ...bookMetadata(book), title: book.title, format: book.formats?.[0] || '' }, t, { onDownload: () => { onNavigate(); plugin.openCalibrePicker(library, book.title); } });
        row.button.textContent = t('add-from-calibre');
      }
    } catch { if (!closed && request === localTicket) status.textContent = t('catalog.calibre-unavailable'); }
  }
  if (sharedForm) {
    const search = event => { if (!closed && selected === 'local') { event.preventDefault(); void searchLocal(); } };
    sharedForm.addEventListener('submit', search);
    localButton.addEventListener('click', () => { active = false; cancel(); select('local'); void searchLocal(); });
    element(localRoot, 'p', t('catalog.local-help'));
    const records = plugin.bookRecords?.entries().sort((a, b) => b.addedAt - a.addedAt).slice(0, 20) || [];
    if (records.length) {
      const history = element(localRoot, 'details', undefined, 'qiaomu-reader-book-records');
      element(history, 'summary', t('catalog.history'));
      for (const record of records) createButton(history, record.title || record.path, () => {
        const file = plugin.app.vault.getAbstractFileByPath(record.recordPath);
        if (file) { onNavigate(); void plugin.app.workspace.getLeaf(false).openFile(file); }
      });
    }
  }
  publicButton.addEventListener('click', () => { active = false; cancel(); select('public'); });
  qiaomuButton.addEventListener('click', () => { active = true; select('qiaomu'); void render(); });
  select(selected);
  return { publicRoot, source: () => selected, dispose() { closed = true; active = false; cancel(); premium.replaceChildren(); } };
}
