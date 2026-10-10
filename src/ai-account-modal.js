import { Modal, Platform, Setting } from 'obsidian';
import { signInAccount, readAccount, signOutAccount } from './model-access/services/provider-auth.js';
import { discoverModels } from './model-access/client.js';
import { detectMagpie, magpieAddress } from './model-access/services/magpie.js';
import { validateApiUrl, permitsEmptyKey } from './model-access/services/api-providers.js';
import { connectionError } from './model-access/services/api-transport.js';

/** Account drafts, model discovery and a separate default selector. No credential in data.json. */
export class AiAccountModal extends Modal {
  constructor(plugin, id, preset, done) {
    super(plugin.app); Object.assign(this, { plugin, id, preset, done });
    const s = plugin.settings;
    this.secretId = s.aiSecrets?.[id] || `qiaomu-reader-${id}-${crypto.randomUUID()}`;
    this.secret = this.app.secretStorage.getSecret(this.secretId) || '';
    this.base = s.aiBases?.[id] || preset.base;
    this.models = [...(s.aiCatalogs?.[id] || [])];
    this.selected = new Set(this.models.map(m => m.id));
    this.controller = new AbortController(); this.alive = true; this.saving = false;
  }
  onClose() { this.alive = false; this.controller.abort(); this.login?.abort(); this.secret = ''; this.plugin.modelAccessModals?.delete(this); this.contentEl.empty(); }
  connection() { return { provider: this.id, baseUrl: this.base, model: '', secretId: this.secretId, protocol: this.id === 'chatgpt' ? 'openai-responses' : 'openai-chat' }; }
  store() { return { getSecret: id => id === this.secretId ? this.secret : this.app.secretStorage.getSecret(id), setSecret: (id, value) => { if (id === this.secretId) this.secret = value; else this.app.secretStorage.setSecret(id, value); } }; }
  onOpen() {
    const label = (zh, en) => (this.plugin.settings.language || "zh").startsWith("zh") ? zh : en;
    (this.plugin.modelAccessModals ||= new Set()).add(this);
    this.modalEl.addClass('qiaomu-reader-account-modal');
    this.setTitle(this.preset.label);
    const root = this.contentEl, controls = root.createDiv(), status = root.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
    const showError = error => { if (this.alive) status.setText(connectionError(error)); };
    if (this.id === 'magpie') {
      root.createEl('p', { text: label('在 Magpie 中登录 Claude 等订阅并启用模型，然后读取列表。', 'Sign in to subscriptions such as Claude in Magpie, enable models, then load them here.') });
      root.createEl('a', { text: label('Magpie 安装与登录指南', 'Magpie setup guide'), href: 'https://usemagpie.ai/docs/start', attr: { target: '_blank', rel: 'noopener noreferrer' } });
    }
    if (this.preset.login) {
      let cancel;
      new Setting(controls).setName(label('账号登录', 'Account sign-in')).addButton(button => {
        button.setButtonText(label('登录并连接', 'Sign in')).setDisabled(!Platform.isDesktopApp).onClick(async () => {
          this.login?.abort(); const controller = new AbortController(); this.login = controller;
          button.setDisabled(true); cancel.setDisabled(false); save.setDisabled(true);
          status.setText(label('在浏览器中完成授权，然后返回这里。', 'Complete authorization in your browser, then return here.'));
          try {
            const result = await signInAccount(this.preset.login, this.app.secretStorage, url => window.open(url), controller.signal, this.id === 'chatgpt' ? readAccount(this.secret) || undefined : undefined);
            if (!this.alive || controller.signal.aborted) return;
            this.secret = result.secret; if (keyInput) keyInput.setValue(result.secret);
            status.setText(label('已登录，读取模型后保存。', 'Signed in. Load models, then save.'));
          } catch (e) { showError(e); }
          finally { if (this.alive) { button.setDisabled(false); cancel.setDisabled(true); save.setDisabled(false); this.login = undefined; } }
        });
      }).addButton(button => { cancel = button; button.setButtonText(label('取消登录', 'Cancel sign-in')).setDisabled(true).onClick(() => this.login?.abort()); });
      if (this.id === 'chatgpt' && this.secret) new Setting(controls).addButton(button => button.setButtonText(label('退出账号', 'Sign out')).onClick(async () => {
        try { const ok = await signOutAccount(this.secretId, this.app.secretStorage); this.secret = ''; status.setText(ok ? label('已退出账号', 'Signed out') : label('已退出本机账号，请在 ChatGPT 设置中断开应用。', 'Signed out locally. Disconnect this app in ChatGPT settings.')); } catch (e) { showError(e); }
      }));
    }
    let keyInput, baseInput;
    if (this.id !== 'chatgpt') {
      new Setting(controls).setName('API key').setDesc(label('凭据仅存入 Obsidian SecretStorage。', 'Credentials are stored in Obsidian SecretStorage.')).addText(input => {
        keyInput = input; input.inputEl.type = 'password'; input.setValue(this.secret).onChange(value => { this.secret = value.trim(); });
      });
      new Setting(controls).setName(label('接口地址', 'Base URL')).addText(input => { baseInput = input; input.setValue(this.base).onChange(value => { this.base = value.trim(); }); });
    }
    if (this.id === 'magpie') new Setting(controls).addButton(button => button.setButtonText(label('检测 Magpie', 'Detect Magpie')).onClick(async () => {
      button.setDisabled(true);
      try { if (this.base === this.preset.base) { this.base = await magpieAddress(); baseInput.setValue(this.base); }
        const version = await detectMagpie(this.base, this.secret, this.controller.signal); if (this.alive) status.setText(`Magpie ${version}`);
      } catch (e) { showError(e); } finally { if (this.alive) button.setDisabled(false); }
    }));
    const filter = root.createEl('input', { type: 'search', attr: { placeholder: label('搜索模型', 'Search models') } });
    let search = ''; filter.addEventListener('input', () => { search = filter.value.toLowerCase(); render(); });
    const bulk = root.createEl('label'); const all = bulk.createEl('input', { type: 'checkbox' }); bulk.appendText(label('全选当前搜索结果', 'Select all search results'));
    const list = root.createDiv('qiaomu-reader-account-models'), summary = root.createDiv({ attr: { role: 'status' } });
    const matches = () => this.models.filter(m => `${m.id} ${m.name || ''}`.toLowerCase().includes(search));
    const update = () => { const found = matches(); all.checked = found.length > 0 && found.every(m => this.selected.has(m.id)); all.indeterminate = !all.checked && found.some(m => this.selected.has(m.id)); summary.setText(`${this.selected.size} ${label('个模型已选择；默认模型在保存后单独选择。', 'models selected; choose your default separately after saving.')}`); };
    const render = () => {
      list.empty(); for (const model of matches()) {
        const row = list.createEl('label'); const check = row.createEl('input', { type: 'checkbox' }); check.checked = this.selected.has(model.id);
        row.appendText(model.name && model.name !== model.id ? `${model.name} · ${model.id}` : model.id);
        check.addEventListener('change', () => { if (check.checked) this.selected.add(model.id); else this.selected.delete(model.id); update(); });
      } update();
    };
    all.addEventListener('change', () => { for (const m of matches()) if (all.checked) this.selected.add(m.id); else this.selected.delete(m.id); render(); });
    new Setting(controls).addButton(button => button.setButtonText(label('读取模型列表', 'Load models')).onClick(async () => {
      button.setDisabled(true);
      try { const found = await discoverModels(this.connection(), this.secret, this.store(), this.controller.signal); if (!this.alive) return;
        this.models = [...new Map([...this.models, ...found].map(m => [m.id, m])).values()]; render(); status.setText(label('列表已读取，选择要添加的模型。能否调用取决于账号权益。', 'Models loaded. Select models to add. Availability depends on your account.'));
      } catch (e) { showError(e); } finally { if (this.alive) button.setDisabled(false); }
    }));
    let manual;
    new Setting(root).setName(label('手动添加模型', 'Add a model manually')).addText(input => { manual = input; input.setPlaceholder('Model-id'); }).addButton(button => button.setButtonText(label('添加', 'Add')).onClick(() => {
      const id = manual.getValue().trim(); if (!id || /\s/.test(id) || id.length > 200) return;
      if (!this.models.some(m => m.id === id)) this.models.push({ id }); this.selected.add(id); manual.setValue(''); render();
    }));
    let save;
    new Setting(root).addButton(button => button.setButtonText(label('取消', 'Cancel')).onClick(() => { if (!this.saving) this.close(); })).addButton(button => {
      save = button; button.setButtonText(label('保存', 'Save')).onClick(async () => {
        if (this.saving || this.login) return;
        const s = this.plugin.settings;
        try {
          this.base = validateApiUrl(this.base);
          if (this.id === 'chatgpt' ? !readAccount(this.secret)?.access : !this.secret && this.id !== 'custom' && !permitsEmptyKey(this.connection())) throw new Error(label('请先登录或填写密钥。', 'Sign in or enter a key first.'));
          if (!this.selected.size) throw new Error(label('至少选择一个模型。', 'Select at least one model.'));
          this.saving = true; save.setDisabled(true);
          const previous = { aiSecrets: s.aiSecrets, aiBases: s.aiBases, aiCatalogs: s.aiCatalogs, aiEnabled: s.aiEnabled, aiNeedsVerification: s.aiNeedsVerification };
          const oldSecret = this.app.secretStorage.getSecret(this.secretId);
          try {
            this.app.secretStorage.setSecret(this.secretId, this.secret);
            s.aiSecrets = { ...s.aiSecrets, [this.id]: this.secretId }; s.aiBases = { ...s.aiBases, [this.id]: this.base };
            s.aiCatalogs = { ...s.aiCatalogs, [this.id]: this.models.filter(m => this.selected.has(m.id)) };
            s.aiEnabled = false; s.aiNeedsVerification = true;
            await this.plugin.saveAll(); this.close(); this.done();
          } catch (e) { Object.assign(s, previous); this.app.secretStorage.setSecret(this.secretId, oldSecret || ''); throw e; }
        } catch (e) { showError(e); } finally { this.saving = false; if (this.alive) save.setDisabled(false); }
      });
    }); render();
  }
}
