import { Modal, Notice, Platform, Setting, setIcon } from 'obsidian';
import { signInAccount, readAccount, signOutAccount } from './model-access/services/provider-auth.js';
import { discoverModels } from './model-access/client.js';
import { detectMagpie, magpieAddress } from './model-access/services/magpie.js';
import { validateApiUrl, permitsEmptyKey } from './model-access/services/api-providers.js';
import { connectionError } from './model-access/services/api-transport.js';
import { accountText as t, setAccountLanguage } from './model-access/i18n/accounts.js';

// Larger catalogs (OpenRouter, SiliconFlow) start with a short selection so
// the chat model menu stays usable; the full list stays one search away.
const SHORT_CATALOG = 30;

/**
 * One connect flow per service: sign in or paste a key, then models are read,
 * a default is chosen and the connection is tested without further clicks.
 * Credentials live only in SecretStorage, never in data.json.
 */
export class AiAccountModal extends Modal {
  constructor(plugin, id, preset, done, verify, options = {}) {
    super(plugin.app); Object.assign(this, { plugin, id, preset, done, verify, activate: options.activate !== false });
    setAccountLanguage(plugin.settings.language || 'zh');
    const s = plugin.settings;
    this.secretId = s.aiSecrets?.[id] || (s.aiProvider === id ? s.aiSecret : '') || `qiaomu-reader-${id}-${crypto.randomUUID()}`;
    this.secret = this.app.secretStorage.getSecret(this.secretId) || '';
    this.base = s.aiBases?.[id] || (s.aiProvider === id ? s.aiBase : '') || preset.base;
    this.models = [...(s.aiCatalogs?.[id] || [])];
    this.selected = new Set(this.models.map(m => m.id));
    this.controller = new AbortController(); this.alive = true; this.busy = false; this.search = '';
    this.message = ''; this.alert = false;
  }
  onClose() { this.alive = false; this.controller.abort(); this.login?.abort(); this.secret = ''; this.plugin.modelAccessModals?.delete(this); this.contentEl.empty(); }
  connection() { return { provider: this.id, baseUrl: this.base, model: '', secretId: this.secretId, protocol: this.id === 'chatgpt' ? 'openai-responses' : 'openai-chat' }; }
  store() { return { getSecret: id => id === this.secretId ? this.secret : this.app.secretStorage.getSecret(id), setSecret: (id, value) => { if (id === this.secretId) this.secret = value; else this.app.secretStorage.setSecret(id, value); } }; }
  account() { return this.id === 'chatgpt' ? readAccount(this.secret) : null; }
  hasCredential() {
    if (this.id === 'chatgpt') return Boolean(this.account()?.access);
    if (this.secret || this.id === 'custom') return true;
    try { return permitsEmptyKey(this.connection()); } catch { return false; }
  }
  setStatus(text, alert = false) {
    this.message = text; this.alert = alert;
    if (!this.statusEl) return;
    this.statusEl.setAttribute('role', alert ? 'alert' : 'status');
    this.statusEl.toggleClass('is-error', alert);
    this.statusEl.setText(text);
    this.statusEl.hidden = !text;
  }
  fail(error) { if (this.alive) this.setStatus(connectionError(error), true); }

  onOpen() {
    (this.plugin.modelAccessModals ||= new Set()).add(this);
    this.modalEl.addClass('qiaomu-reader-account-modal');
    this.setTitle(this.preset.label);
    this.draw();
    if (this.id === 'magpie' && !this.models.length) void this.detectGateway();
  }

  draw() {
    const outer = this.contentEl; outer.empty();
    const root = outer.createDiv('qiaomu-reader-account-scroll');
    const intro = this.introText();
    if (intro) root.createEl('p', { cls: 'qiaomu-reader-account-intro', text: intro });
    if (this.id === 'magpie') root.createEl('a', { text: t('gatewayLink'), href: 'https://usemagpie.ai/docs/start', attr: { target: '_blank', rel: 'noopener noreferrer' } });

    this.drawState(root);
    this.drawConnect(root);
    this.statusEl = root.createDiv('qiaomu-reader-account-status-line');
    this.setStatus(this.message, this.alert);
    this.drawModels(root);
    this.drawAdvanced(root);

    const footer = new Setting(outer.createDiv('qiaomu-reader-account-footer'));
    const s = this.plugin.settings;
    if (s.aiSecrets?.[this.id] || s.aiCatalogs?.[this.id]?.length) footer.addButton(button => {
      button.setButtonText(t(this.confirmRemove ? 'confirmRemove' : 'remove')).onClick(() => void this.remove());
      button.buttonEl.addClass('qiaomu-reader-account-remove');
      if (this.confirmRemove) button.buttonEl.addClass('is-confirm');
    });
    footer
      .addButton(button => button.setButtonText(t('close')).onClick(() => this.close()))
      // One primary action: key services connect (read, save, test); a signed-in
      // account only needs its model selection saved.
      .addButton(button => button.setButtonText(t(this.id === 'chatgpt' ? 'save' : 'connectSave')).setCta().setDisabled(this.busy || Boolean(this.login))
        .onClick(() => void (this.id === 'chatgpt' ? this.finish() : this.connect())));
  }

  introText() {
    if (this.id === 'chatgpt') return t('introChatgpt');
    if (this.id === 'magpie') return t('introMagpie');
    if (this.preset.local) return t('introLocal');
    if (this.id === 'custom') return t('introCustom');
    return '';
  }

  /** One line that says whether this service is usable right now. */
  drawState(root) {
    const row = root.createDiv('qiaomu-reader-account-state');
    // A saved but untested (or rejected) credential is not shown as ready.
    const s = this.plugin.settings;
    const ok = this.hasCredential() && this.models.length > 0 && (s.aiProvider !== this.id || s.aiEnabled === true);
    setIcon(row.createSpan('qiaomu-reader-account-state-icon'), ok ? 'circle-check' : 'circle');
    let text = t('notConnected');
    const account = this.account();
    if (this.id === 'chatgpt' && account?.access) text = t('signedIn', account.email || 'ChatGPT');
    else if (this.id === 'chatgpt' && account) text = t('sessionEnded');
    else if (this.secret) text = t('keySaved', this.secret.length > 8 ? this.secret.slice(-4) : '');
    else if (this.hasCredential() && this.models.length) text = t('connected');
    if (ok) text += t('modelCount', this.selected.size);
    row.createSpan({ text });
    if (this.id === 'chatgpt' && account?.access) {
      const out = row.createEl('button', { cls: 'qiaomu-reader-account-link', text: t('signout'), attr: { type: 'button' } });
      out.addEventListener('click', () => void this.signOut());
    }
  }

  drawConnect(root) {
    const loginKind = this.preset.login;
    if (loginKind) {
      const block = root.createDiv('qiaomu-reader-account-primary');
      if (this.login) {
        block.createSpan({ text: t('waiting') });
        const cancel = block.createEl('button', { text: t('cancel'), attr: { type: 'button' } });
        cancel.addEventListener('click', () => this.login?.abort());
      } else {
        const name = this.account()?.access ? t('again')
          : loginKind === 'chatgpt' ? t('continueChatgpt')
          : t('signInWith', this.preset.label);
        const button = block.createEl('button', { cls: 'mod-cta', text: name, attr: { type: 'button' } });
        button.disabled = this.busy || !Platform.isDesktopApp;
        button.addEventListener('click', () => void this.signIn());
        if (!Platform.isDesktopApp) block.createSpan({ cls: 'qiaomu-reader-set-note', text: t('desktop') });
      }
    }
    if (this.id === 'chatgpt') return;
    // Sign-in providers keep key entry folded; key-only services show it first.
    let host = root;
    if (loginKind) {
      const details = root.createEl('details', { cls: 'qiaomu-reader-settings-disclosure' });
      details.createEl('summary', { text: t('keyInstead') });
      details.open = Boolean(this.secret) && !this.login;
      host = details.createDiv('qiaomu-reader-settings-disclosure-body');
    }
    if (this.id === 'custom') new Setting(host).setName(t('endpoint')).addText(input => input.setValue(this.base).onChange(value => { this.base = value.trim(); }));
    if (this.id !== 'magpie' && !(this.preset.local && !this.secret)) {
      const keyRow = new Setting(host).setName(this.id === 'custom' ? t('keyOptional') : 'API Key')
        .setDesc(t('keyStored'))
        .addText(input => {
          input.inputEl.type = 'password'; input.inputEl.autocomplete = 'off'; input.setPlaceholder(this.secret ? '••••••••' : 'sk-…');
          input.setValue(this.secret).onChange(value => { this.secret = value.trim(); });
          input.inputEl.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void this.connect(); } });
        });
      if (this.preset.apiKeyUrl) keyRow.addButton(button => button.setButtonText(t('getKey')).onClick(() => window.open(this.preset.apiKeyUrl, '_blank')));
    }
  }

  drawModels(root) {
    const details = root.createEl('details', { cls: 'qiaomu-reader-settings-disclosure' });
    details.createEl('summary', { text: this.models.length ? t('modelsAdded', this.selected.size) : t('models') });
    details.open = this.modelsOpen === true;
    details.addEventListener('toggle', () => { this.modelsOpen = details.open; });
    const body = details.createDiv('qiaomu-reader-settings-disclosure-body');
    if (this.models.length) {
      const filter = body.createEl('input', { type: 'search', attr: { placeholder: t('search'), 'aria-label': t('search') } });
      filter.value = this.search;
      const bulk = body.createEl('label', { cls: 'qiaomu-reader-account-bulk' }); const all = bulk.createEl('input', { type: 'checkbox' }); bulk.appendText(t('selectAll'));
      const list = body.createDiv('qiaomu-reader-account-models');
      const matches = () => this.models.filter(m => `${m.id} ${m.name || ''}`.toLowerCase().includes(this.search));
      const update = () => { const found = matches(); all.checked = found.length > 0 && found.every(m => this.selected.has(m.id)); all.indeterminate = !all.checked && found.some(m => this.selected.has(m.id)); };
      const render = () => {
        list.empty();
        for (const model of matches()) {
          const row = list.createEl('label'); const check = row.createEl('input', { type: 'checkbox' }); check.checked = this.selected.has(model.id);
          row.appendText(model.name && model.name !== model.id ? `${model.name} · ${model.id}` : model.id);
          check.addEventListener('change', () => { if (check.checked) this.selected.add(model.id); else this.selected.delete(model.id); update(); });
        }
        update();
      };
      filter.addEventListener('input', () => { this.search = filter.value.toLowerCase(); render(); });
      all.addEventListener('change', () => { for (const m of matches()) if (all.checked) this.selected.add(m.id); else this.selected.delete(m.id); render(); });
      render();
    } else body.createDiv({ cls: 'qiaomu-reader-set-note', text: t('modelsHint') });
    if (this.id === 'chatgpt' && this.hasCredential()) new Setting(body).addButton(button => button.setButtonText(t('reload')).setDisabled(this.busy || Boolean(this.login)).onClick(() => void this.connect()));
    let manual;
    new Setting(body).setName(t('addManual')).addText(input => { manual = input; input.setPlaceholder('Model-id'); }).addButton(button => button.setButtonText(t('add')).onClick(() => {
      const id = manual.getValue().trim(); if (!id || /\s/.test(id) || id.length > 200) return;
      if (!this.models.some(m => m.id === id)) this.models.push({ id }); this.selected.add(id); this.modelsOpen = true; this.draw();
    }));
  }

  drawAdvanced(root) {
    if (this.id === 'chatgpt' || this.id === 'custom') return;
    const details = root.createEl('details', { cls: 'qiaomu-reader-settings-disclosure' });
    details.createEl('summary', { text: t('connection') });
    const body = details.createDiv('qiaomu-reader-settings-disclosure-body');
    let baseInput;
    new Setting(body).setName(t('endpoint')).setDesc(t('endpointHint'))
      .addText(input => { baseInput = input; input.setPlaceholder(this.preset.base || '').setValue(this.base).onChange(value => { this.base = value.trim() || this.preset.base; }); });
    if (this.id === 'magpie') {
      new Setting(body).setName(t('gatewayKey')).addText(input => {
        input.inputEl.type = 'password'; input.setValue(this.secret).onChange(value => { this.secret = value.trim(); });
      }).addButton(button => button.setButtonText(t('detect')).onClick(async () => { await this.detectGateway(); if (this.alive) baseInput.setValue(this.base); }));
    }
    if (this.preset.local && this.id !== 'magpie') new Setting(body).setName(t('keyOptional')).addText(input => {
      input.inputEl.type = 'password'; input.setValue(this.secret).onChange(value => { this.secret = value.trim(); });
    });
  }

  async detectGateway() {
    try {
      if (this.base === this.preset.base) this.base = await magpieAddress();
      const version = await detectMagpie(this.base, this.secret, this.controller.signal);
      if (this.alive) this.setStatus(t('detected', version));
    } catch (e) { this.fail(e); }
  }

  async signIn() {
    this.login?.abort(); const controller = new AbortController(); this.login = controller;
    this.setStatus(''); this.draw();
    try {
      const result = await signInAccount(this.preset.login, this.app.secretStorage, url => window.open(url), controller.signal, this.id === 'chatgpt' ? this.account() || undefined : undefined);
      if (!this.alive || controller.signal.aborted) return;
      this.secret = result.secret;
      this.login = undefined;
      this.setStatus(t('authorized'));
      await this.connect();
    } catch (e) { this.fail(e); }
    finally { if (this.login === controller) this.login = undefined; if (this.alive) this.draw(); }
  }

  async signOut() {
    try {
      const ok = await signOutAccount(this.secretId, this.app.secretStorage);
      this.secret = this.app.secretStorage.getSecret(this.secretId) || '';
      const s = this.plugin.settings;
      if (s.aiProvider === this.id) { s.aiEnabled = false; s.aiNeedsVerification = true; await this.plugin._saveLocalData(); }
      if (!this.alive) return;
      this.setStatus(ok ? t('signedOut') : t('revokeFailed'));
      this.draw(); this.done?.();
    } catch (e) { this.fail(e); }
  }

  /** Forget the key, account and model list of this service. */
  async remove() {
    if (this.busy || this.login) return;
    if (!this.confirmRemove) { this.confirmRemove = true; this.draw(); return; }
    const s = this.plugin.settings, drop = (record) => { const next = { ...record }; delete next[this.id]; return next; };
    if (this.id === 'chatgpt' && this.account()?.refresh) await signOutAccount(this.secretId, this.app.secretStorage).catch(() => false);
    this.app.secretStorage.setSecret(this.secretId, '');
    s.aiSecrets = drop(s.aiSecrets); s.aiCatalogs = drop(s.aiCatalogs); s.aiBases = drop(s.aiBases); s.aiModels = drop(s.aiModels);
    if (s.aiProvider === this.id) { s.aiProvider = ''; s.aiModel = ''; s.aiEnabled = false; s.aiNeedsVerification = false; }
    await this.plugin._saveLocalData();
    new Notice(t('removed', this.preset.label));
    this.close(); this.done?.();
  }

  /** Read models, keep a sensible selection, save, then test and enable. */
  async connect() {
    if (this.busy) return;
    if (!this.hasCredential()) { this.setStatus(this.preset.login ? t('needCredential') : t('needKey'), true); return; }
    this.busy = true; this.draw();
    try {
      this.base = validateApiUrl(this.base);
      this.setStatus(t('loading'));
      let found = [];
      try { found = await discoverModels(this.connection(), this.secret, this.store(), this.controller.signal); }
      catch (e) {
        // Some services do not list models. A preset list still lets the test run.
        const fallback = [this.preset.model, ...(this.preset.models || [])].filter(Boolean);
        if (!fallback.length && !this.models.length) { this.modelsOpen = true; throw e; }
        found = fallback.map(id => ({ id }));
      }
      if (!this.alive) return;
      const known = new Set(this.models.map(m => m.id));
      this.models = [...new Map([...this.models, ...found].map(m => [m.id, m])).values()];
      if (!this.selected.size) this.preselect(found);
      else for (const m of found) if (!known.has(m.id) && this.models.length <= SHORT_CATALOG) this.selected.add(m.id);
      if (!this.selected.size) { this.modelsOpen = true; throw new Error(t('noModels')); }
      await this.persist();
      await this.test();
    } catch (e) { this.fail(e); this.refreshHost(); }
    finally { this.busy = false; if (this.alive) this.draw(); }
  }

  /** Keep the settings behind the dialog in step with what was saved. */
  refreshHost() { if (this.persisted) this.done?.(); }

  preselect(found) {
    if (found.length <= SHORT_CATALOG) { for (const m of found) this.selected.add(m.id); return; }
    const preferred = new Set([this.preset.model, ...(this.preset.models || []), this.plugin.settings.aiModels?.[this.id]].filter(Boolean));
    for (const m of found) if (preferred.has(m.id)) this.selected.add(m.id);
    if (!this.selected.size) for (const m of found.slice(0, 8)) this.selected.add(m.id);
  }

  defaultModel() {
    const current = this.plugin.settings.aiModels?.[this.id];
    if (current && this.selected.has(current)) return current;
    if (this.preset.model && this.selected.has(this.preset.model)) return this.preset.model;
    return this.models.find(m => this.selected.has(m.id))?.id || '';
  }

  async persist() {
    const s = this.plugin.settings;
    const previous = { aiProvider: s.aiProvider, aiModel: s.aiModel, aiModels: s.aiModels, aiSecrets: s.aiSecrets, aiBases: s.aiBases, aiCatalogs: s.aiCatalogs, aiEnabled: s.aiEnabled, aiNeedsVerification: s.aiNeedsVerification };
    const oldSecret = this.app.secretStorage.getSecret(this.secretId);
    try {
      this.app.secretStorage.setSecret(this.secretId, this.secret);
      const model = this.defaultModel();
      // Connecting a new service makes it current; managing another one does not.
      if (this.activate || !s.aiProvider) s.aiProvider = this.id;
      const current = s.aiProvider === this.id;
      if (current) s.aiModel = model;
      s.aiModels = { ...s.aiModels, [this.id]: model };
      s.aiSecrets = { ...s.aiSecrets, [this.id]: this.secretId }; s.aiBases = { ...s.aiBases, [this.id]: this.base };
      s.aiCatalogs = { ...s.aiCatalogs, [this.id]: this.models.filter(m => this.selected.has(m.id)) };
      if (current) { s.aiEnabled = false; s.aiNeedsVerification = true; }
      if (!await this.plugin._saveLocalData()) throw new Error(t('saveFailed'));
      this.persisted = true;
    } catch (e) { Object.assign(s, previous); this.app.secretStorage.setSecret(this.secretId, oldSecret || ''); throw e; }
  }

  async test() {
    if (!this.verify || this.plugin.settings.aiProvider !== this.id) { this.close(); this.done?.(); return; }
    const result = await this.verify(text => { if (this.alive) this.setStatus(text); });
    new Notice(t('ready', result.model, result.latency));
    if (this.alive) this.close();
    this.done?.(result);
  }

  async finish() {
    if (this.busy || this.login) return;
    if (!this.hasCredential()) { this.setStatus(this.preset.login ? t('needCredential') : t('needKey'), true); return; }
    if (!this.selected.size) { await this.connect(); return; }
    this.busy = true; this.draw();
    try { this.base = validateApiUrl(this.base); await this.persist(); await this.test(); }
    catch (e) { this.fail(e); this.refreshHost(); }
    finally { this.busy = false; if (this.alive) this.draw(); }
  }
}
