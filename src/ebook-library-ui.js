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

export function mountEbookDiscovery(shell, plugin, library, t, { icon, sourceParent = shell } = {}) {
  const service = plugin.ebookLibrary;
  const view = shell.ownerDocument.defaultView;
  const sources = element(sourceParent, 'div', undefined, 'qiaomu-reader-ebook-sources');
  const publicButton = element(sources, 'button', t('ebook.source-public'));
  const qiaomuButton = element(sources, 'button', t('ebook.source-qiaomu'));
  publicButton.type = qiaomuButton.type = 'button';
  const publicRoot = element(shell, 'div');
  const premium = element(shell, 'section', undefined, 'qiaomu-reader-ebook-panel'); premium.hidden = true;
  let closed = false, active = false, aborter = null, epoch = 0, searchEpoch = 0;
  const createButton = (parent, text, click, cls) => {
    const button = element(parent, 'button', text, cls); button.type = 'button';
    button.addEventListener('click', click); return button;
  };
  const select = which => {
    publicRoot.hidden = which !== 'public'; premium.hidden = which === 'public';
    publicButton.setAttribute('aria-pressed', String(which === 'public'));
    qiaomuButton.setAttribute('aria-pressed', String(which !== 'public'));
  };
  const cancel = () => { epoch++; searchEpoch++; aborter?.abort(); aborter = new AbortController(); };
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
    const form = element(premium, 'form', undefined, 'qiaomu-reader-discovery-search');
    const label = element(form, 'label', t('book-title-or-author')), field = element(label, 'input');
    field.type = 'search'; field.maxLength = 160; field.autocomplete = 'off';
    const submit = element(form, 'button', t('search')); submit.type = 'submit';
    const toolbar = element(premium, 'div', undefined, 'qiaomu-reader-ebook-toolbar'); toolbar.hidden = true;
    const count = element(toolbar, 'span'); count.setAttribute('role', 'status');
    const filters = element(toolbar, 'div', undefined, 'qiaomu-reader-ebook-filters');
    const results = element(premium, 'div', undefined, 'qiaomu-reader-discovery-results');
    const coverNote = element(premium, 'p', t('ebook.cover-note'), 'qiaomu-reader-ebook-cover-note'); coverNote.hidden = true;
    async function download(book, button, resume) {
      const text = button.textContent;
      await action(button, async () => {
        await service.download(book, files => library._importBooks(files), state => {
          tell(t('ebook.' + state)); if (live(ticket)) button.textContent = t('ebook.working');
        }, signal, resume);
        if (!live(ticket)) return;
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
    form.addEventListener('submit', event => { event.preventDefault(); void action(submit, async () => {
      if (!field.value.trim()) { field.focus(); return; }
      const searchTicket = ++searchEpoch;
      tell(t('searching-books')); results.replaceChildren(); toolbar.hidden = true; coverNote.hidden = true;
      const books = await service.search(field.value, signal); if (!live(ticket) || searchTicket !== searchEpoch) return;
      tell(books.length ? '' : t('no-books-found')); toolbar.hidden = !books.length; coverNote.hidden = !books.length;
      filters.replaceChildren(); const rows = new Map();
      for (const book of books) rows.set(book.id, createEbookResult(results, book, t, { icon, onDownload: button => void download(book, button) }));
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
    }); });
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
  publicButton.addEventListener('click', () => { active = false; cancel(); select('public'); });
  qiaomuButton.addEventListener('click', () => { active = true; select('qiaomu'); void render(); });
  select('public');
  return { publicRoot, dispose() { closed = true; active = false; cancel(); premium.replaceChildren(); } };
}
