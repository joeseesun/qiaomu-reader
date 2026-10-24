function element(parent, tag, text, cls) {
  const node = parent.ownerDocument.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  parent.append(node); return node;
}
export function ebookMessage(error, t) {
  const code = error?.code;
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

export function mountEbookDiscovery(shell, plugin, library, t) {
  const service = plugin.ebookLibrary;
  const sources = element(shell, 'div', undefined, 'qiaomu-reader-ebook-sources');
  const publicButton = element(sources, 'button', t('ebook.source-public'));
  const qiaomuButton = element(sources, 'button', t('ebook.source-qiaomu'));
  publicButton.type = qiaomuButton.type = 'button';
  const publicRoot = element(shell, 'div');
  const premium = element(shell, 'section', undefined, 'qiaomu-reader-ebook-panel'); premium.hidden = true;
  let closed = false, active = false, aborter = null, epoch = 0;
  const createButton = (parent, text, click) => {
    const button = element(parent, 'button', text); button.type = 'button';
    button.addEventListener('click', click); return button;
  };
  const select = which => {
    publicRoot.hidden = which !== 'public'; premium.hidden = which === 'public';
    publicButton.setAttribute('aria-pressed', String(which === 'public'));
    qiaomuButton.setAttribute('aria-pressed', String(which !== 'public'));
  };
  const cancel = () => { epoch++; aborter?.abort(); aborter = new AbortController(); };
  const live = ticket => !closed && active && ticket === epoch;
  async function render() {
    cancel(); const ticket = epoch, signal = aborter.signal; premium.replaceChildren();
    const status = element(premium, 'div', '', 'qiaomu-reader-discovery-status'); status.setAttribute('role', 'status');
    const tell = message => { if (live(ticket)) status.textContent = message; };
    const action = async (button, fn) => {
      if (button.disabled) return; button.disabled = true;
      try { await fn(); } catch (error) { if (error.code !== 'cancelled') tell(ebookMessage(error, t)); }
      finally { if (live(ticket)) button.disabled = false; }
    };
    const activation = () => {
      element(premium, 'p', t('ebook.activate-help'), 'qiaomu-reader-discovery-intro');
      const form = element(premium, 'form', undefined, 'qiaomu-reader-discovery-search');
      const label = element(form, 'label', t('ebook.code')), input = element(label, 'input');
      input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 40;
      const submit = element(form, 'button', t('ebook.activate')); submit.type = 'submit';
      form.addEventListener('submit', event => { event.preventDefault(); void action(submit, async () => {
        tell(t('ebook.activating')); const code = input.value; input.value = '';
        await service.activate(code, signal); if (live(ticket)) await render();
      }); });
      input.focus();
    };
    let activated;
    try { activated = service.isActivated(); }
    catch (error) { tell(ebookMessage(error, t)); createButton(premium, t('ebook.retry'), () => void render()); return; }
    if (!activated) { activation(); return; }
    let profile;
    try { profile = await service.profile(signal); }
    catch (error) {
      if (!live(ticket)) return;
      tell(ebookMessage(error, t));
      if (['inactive', 'unauthorized', 'device-revoked'].includes(error.code)) activation();
      else createButton(premium, t('ebook.retry'), () => void render());
      return;
    }
    if (!live(ticket)) return;
    const account = element(premium, 'div', undefined, 'qiaomu-reader-ebook-account');
    const profileText = value => t('ebook.activated-meta', new Date(value.expiresAt * 1000).toLocaleDateString(plugin.settings.language || 'zh'), Math.max(0, value.dailyLimit - value.usedToday), value.dailyLimit);
    const accountText = element(account, 'span', profileText(profile));
    const logout = createButton(account, t('ebook.sign-out'), () => void action(logout, async () => { await service.logout(signal); if (live(ticket)) await render(); }));
    const form = element(premium, 'form', undefined, 'qiaomu-reader-discovery-search');
    const label = element(form, 'label', t('book-title-or-author')), field = element(label, 'input');
    field.type = 'search'; field.maxLength = 160; field.autocomplete = 'off';
    const submit = element(form, 'button', t('search')); submit.type = 'submit';
    const results = element(premium, 'div', undefined, 'qiaomu-reader-discovery-results');
    async function download(book, button, resume) {
      await action(button, async () => {
        await service.download(book, files => library._importBooks(files), state => tell(t('ebook.' + state)), signal, resume);
        if (!live(ticket)) return;
        tell(t('book-import-finished')); button.disabled = true; button.textContent = t('ebook.imported');
        button.dataset.imported = 'true';
        try { const next = await service.profile(signal); if (live(ticket)) accountText.textContent = profileText(next); }
        catch { /* The completed vault import remains successful if the profile refresh fails. */ }
      });
      if (button.dataset.imported) button.disabled = true;
    }
    form.addEventListener('submit', event => { event.preventDefault(); void action(submit, async () => {
      if (!field.value.trim()) { field.focus(); return; }
      tell(t('searching-books')); results.replaceChildren();
      const books = await service.search(field.value, signal); if (!live(ticket)) return;
      tell(t(books.length ? 'ebook.results-note' : 'no-books-found'));
      for (const book of books) {
        const row = element(results, 'div', undefined, 'qiaomu-reader-discovery-result');
        const info = element(row, 'div', undefined, 'qiaomu-reader-discovery-result-info');
        element(info, 'strong', book.title); element(info, 'span', [book.author, book.language, book.year, book.format.toUpperCase(), book.size_str].filter(Boolean).join(' · '));
        const button = createButton(row, t('download-to-library'), () => void download(book, button));
      }
    }); });
    field.focus();
    try {
      const jobs = await service.jobs(signal); if (!live(ticket) || !jobs.length) return;
      const recent = element(premium, 'section', undefined, 'qiaomu-reader-ebook-recent'); element(recent, 'h3', t('ebook.recent'));
      for (const job of jobs) {
        const row = element(recent, 'div', undefined, 'qiaomu-reader-discovery-result');
        element(row, 'span', job.result?.filename || t('ebook.' + job.state));
        const button = createButton(row, t('ebook.resume'), () => void download(null, button, job.id));
      }
    } catch (error) { if (error.code !== 'cancelled') tell(ebookMessage(error, t)); }
  }
  publicButton.addEventListener('click', () => { active = false; cancel(); select('public'); });
  qiaomuButton.addEventListener('click', () => { active = true; select('qiaomu'); void render(); });
  select('public');
  return { publicRoot, dispose() { closed = true; active = false; cancel(); premium.replaceChildren(); } };
}
