import { Modal, Platform, setIcon } from 'obsidian';
import { AI_PROVIDERS, AI_PROVIDER_CATEGORIES } from './ai-providers.js';
import { CLI_AI_PROVIDER_IDS, cliMeta, resolveAcpPath, resolveCliPath } from './ai-cli.js';
import { readAccount } from './model-access/services/provider-auth.js';
import { accountText as t } from './model-access/i18n/accounts.js';

// Magpie-style model sources: connected services as rows, local agents found
// automatically, and one searchable grid for adding a service.

/** A neutral monogram stands in for brand marks, which would cost ~65 KB. */
function mark(parent, label) {
  const letter = [...String(label).replace(/^[^\p{L}\p{N}]+/u, '')][0] || '·';
  parent.createSpan({ cls: 'qiaomu-reader-src-mark', text: letter.toUpperCase(), attr: { 'aria-hidden': 'true' } });
}

function host(base) {
  try { return new URL(base).host; } catch { return ''; }
}

/** Null when this service has never been connected. */
export function apiSourceState(plugin, id, secret) {
  const s = plugin.settings, p = AI_PROVIDERS[id];
  if (!p || p.transport === 'cli') return null;
  const count = (s.aiCatalogs?.[id] || []).length;
  const models = (n) => n ? t('modelCount', n).replace(/^ · /, '') : '';
  if (id === 'chatgpt') {
    const account = readAccount(secret);
    if (!account && !count) return null;
    return account?.access
      ? { ok: true, sub: [account.email || 'ChatGPT', models(count)].filter(Boolean).join(' · ') }
      : { ok: false, sub: t('needsLogin') };
  }
  const local = p.local || id === 'custom';
  if (!secret && !count && !(s.aiProvider === id && s.aiSecrets?.[id])) return null;
  const ok = Boolean(secret) || local || !p.needsKey;
  const base = s.aiBases?.[id] || p.base;
  return { ok, sub: ok ? [host(base), models(count)].filter(Boolean).join(' · ') : t('needsKey') };
}

/** Finds installed agent CLIs; concurrent calls share one scan. */
export function detectCliAgents(plugin) {
  if (!Platform.isDesktopApp) return Promise.resolve({});
  if (plugin._aiCliScan) return plugin._aiCliScan;
  const s = plugin.settings;
  plugin._aiCliScan = Promise.all(CLI_AI_PROVIDER_IDS.map(async (id) => {
    try {
      const path = cliMeta(id)?.acpOnly ? await resolveAcpPath(id, s.aiAcpPaths?.[id]) : await resolveCliPath(id, s.aiCliPaths?.[id]);
      return [id, path || ''];
    } catch { return [id, '']; }
  })).then((pairs) => {
    plugin._aiCliAgents = Object.fromEntries(pairs);
    return plugin._aiCliAgents;
  }).finally(() => { plugin._aiCliScan = null; });
  return plugin._aiCliScan;
}

function sectionHead(parent, title, hint) {
  const head = parent.createDiv('qiaomu-reader-src-head');
  const text = head.createDiv('qiaomu-reader-src-head-text');
  text.createDiv({ cls: 'qiaomu-reader-src-title', text: title });
  if (hint) text.createDiv({ cls: 'qiaomu-reader-src-hint', text: hint });
  return head.createDiv('qiaomu-reader-src-actions');
}

function quietButton(parent, icon, text) {
  const button = parent.createEl('button', { cls: 'qiaomu-reader-src-button', attr: { type: 'button' } });
  setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
  button.createSpan({ text });
  return button;
}

function row(list, { label, sub, attention, current, open, use }) {
  const entry = list.createDiv(`qiaomu-reader-src-row${current ? ' is-current' : ''}`);
  const main = entry.createEl('button', { cls: 'qiaomu-reader-src-row-main', attr: { type: 'button' } });
  mark(main, label);
  const text = main.createDiv('qiaomu-reader-src-row-text');
  const name = text.createDiv({ cls: 'qiaomu-reader-src-row-name', text: label });
  if (current) name.createSpan({ cls: 'qiaomu-reader-src-pill', text: t('inUse') });
  text.createDiv({ cls: `qiaomu-reader-src-row-sub${attention ? ' is-attention' : ''}`, text: sub });
  if (open) {
    setIcon(main.createSpan({ cls: 'qiaomu-reader-src-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    main.addEventListener('click', open);
  } else if (use) main.addEventListener('click', use);
  if (use && !current) {
    const button = entry.createEl('button', { cls: 'qiaomu-reader-src-button', text: t('use'), attr: { type: 'button' } });
    button.addEventListener('click', use);
  }
}

/**
 * deps: { translate, secret(id), openAccount(id, activate), use(id), redraw }
 */
export function renderAiSources(container, plugin, deps) {
  const s = plugin.settings, label = (p) => deps.translate(p.label);
  const services = container.createDiv('qiaomu-reader-src-section');
  const actions = sectionHead(services, t('servicesTitle'), t('servicesHint'));
  const chooser = () => new AiProviderChooser(plugin.app, plugin, deps).open();
  const connected = Object.keys(AI_PROVIDERS)
    .map((id) => [id, apiSourceState(plugin, id, deps.secret(id))])
    .filter(([, state]) => state);
  if (connected.length) quietButton(actions, 'plus', t('addService')).addEventListener('click', chooser);
  if (!connected.length) {
    const empty = services.createDiv('qiaomu-reader-src-empty');
    empty.createDiv({ cls: 'qiaomu-reader-src-empty-title', text: t('emptyTitle') });
    empty.createDiv({ cls: 'qiaomu-reader-src-hint', text: t('emptyHint') });
    const add = quietButton(empty, 'plus', t('addService'));
    add.addClass('mod-cta');
    add.addEventListener('click', chooser);
  } else {
    const list = services.createDiv('qiaomu-reader-src-list');
    for (const [id, state] of connected) row(list, {
      label: label(AI_PROVIDERS[id]), sub: state.sub, attention: !state.ok, current: s.aiProvider === id,
      open: () => deps.openAccount(id, s.aiProvider === id), use: () => deps.use(id),
    });
  }
  if (Platform.isDesktopApp) renderAgents(container.createDiv('qiaomu-reader-src-section'), plugin, deps);
}

function renderAgents(section, plugin, deps) {
  const s = plugin.settings;
  const actions = sectionHead(section, t('agentsTitle'), t('agentsHint'));
  const found = plugin._aiCliAgents;
  const scanning = Boolean(plugin._aiCliScan) || !found;
  const redetect = quietButton(actions, 'refresh-cw', scanning ? t('detecting') : t('redetect'));
  redetect.disabled = scanning;
  const scan = () => { plugin._aiCliAgents = null; void detectCliAgents(plugin).then(() => { if (section.isConnected) deps.redraw(); }); deps.redraw(); };
  redetect.addEventListener('click', scan);
  if (!found) {
    if (!plugin._aiCliScan) void detectCliAgents(plugin).then(() => { if (section.isConnected) deps.redraw(); });
    section.createDiv({ cls: 'qiaomu-reader-src-hint', text: t('detecting') });
    return;
  }
  const ready = CLI_AI_PROVIDER_IDS.filter((id) => found[id] || s.aiProvider === id);
  const missing = CLI_AI_PROVIDER_IDS.filter((id) => !ready.includes(id)).map((id) => deps.translate(AI_PROVIDERS[id]?.label || id));
  if (!ready.length) section.createDiv({ cls: 'qiaomu-reader-src-hint', text: t('noAgents') });
  else {
    const list = section.createDiv('qiaomu-reader-src-list');
    for (const id of ready) row(list, {
      label: deps.translate(AI_PROVIDERS[id].label),
      sub: t(found[id] ? 'agentReady' : 'agentMissing'),
      attention: !found[id],
      current: s.aiProvider === id,
      use: s.aiProvider === id ? null : () => deps.use(id),
    });
  }
  if (missing.length && ready.length) section.createDiv({ cls: 'qiaomu-reader-src-hint', text: t('notFound', missing.join('、')) });
}

/** Grouped, searchable grid of services; already connected ones are marked. */
export class AiProviderChooser extends Modal {
  constructor(app, plugin, deps) { super(app); Object.assign(this, { plugin, deps }); }
  onClose() { this.contentEl.empty(); }
  onOpen() {
    this.modalEl.addClass('qiaomu-reader-src-chooser');
    this.setTitle(t('addService'));
    const search = this.contentEl.createEl('input', { cls: 'qiaomu-reader-src-search', type: 'search', attr: { placeholder: t('findService'), 'aria-label': t('findService'), autocomplete: 'off' } });
    const scroller = this.contentEl.createDiv('qiaomu-reader-src-choices');
    const items = [];
    const groups = [['login', t('accountGroup')], ...AI_PROVIDER_CATEGORIES.filter((c) => c.id !== 'cli').map((c) => [c.id, this.deps.translate(c.label)])];
    for (const [groupId, title] of groups) {
      const ids = Object.keys(AI_PROVIDERS).filter((id) => {
        const p = AI_PROVIDERS[id];
        if (p.transport === 'cli' || (p.desktopOnly && !Platform.isDesktopApp)) return false;
        return groupId === 'login' ? Boolean(p.login) : !p.login && p.category === groupId;
      });
      if (!ids.length) continue;
      const wrapper = scroller.createDiv('qiaomu-reader-src-group');
      wrapper.createDiv({ cls: 'qiaomu-reader-src-group-title', text: title });
      const grid = wrapper.createDiv('qiaomu-reader-src-grid');
      for (const id of ids) {
        const p = AI_PROVIDERS[id], name = this.deps.translate(p.label);
        const done = Boolean(apiSourceState(this.plugin, id, this.deps.secret(id)));
        const button = grid.createEl('button', { cls: `qiaomu-reader-src-choice${done ? ' is-added' : ''}`, attr: { type: 'button' } });
        mark(button, name);
        const text = button.createDiv('qiaomu-reader-src-row-text');
        text.createDiv({ cls: 'qiaomu-reader-src-row-name', text: name });
        text.createDiv({ cls: 'qiaomu-reader-src-row-sub', text: id === 'chatgpt' ? t('planHint') : p.login ? t('loginHint') : p.local ? t('noKeyNeeded') : host(p.base) || t('customHint') });
        if (done) setIcon(button.createSpan({ cls: 'qiaomu-reader-src-check', attr: { 'aria-hidden': 'true' } }), 'check');
        button.addEventListener('click', () => { this.close(); this.deps.openAccount(id, true); });
        items.push({ text: `${name} ${id} ${p.base || ''}`.toLowerCase(), button, wrapper });
      }
    }
    const none = scroller.createDiv({ cls: 'qiaomu-reader-src-hint', text: t('noMatch') });
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      for (const item of items) item.button.hidden = Boolean(q) && !item.text.includes(q);
      for (const wrapper of new Set(items.map((item) => item.wrapper))) wrapper.hidden = items.every((item) => item.wrapper !== wrapper || item.button.hidden);
      none.hidden = items.some((item) => !item.button.hidden);
    };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const first = items.find((item) => !item.button.hidden);
      if (first) { event.preventDefault(); first.button.click(); }
    });
    filter();
    if (!Platform.isMobile) search.focus();
  }
}
