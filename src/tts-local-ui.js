import { setIcon } from 'obsidian';
import { LOCAL_MODELS } from './tts-local.js';

function action(host, icon, text, run) {
  const button = host.createEl('button', { cls: 'qbr-tts-button', attr: { type: 'button' } });
  setIcon(button, icon); button.createSpan({ text }); button.addEventListener('click', run); return button;
}
export class LocalSpeechPanel {
  constructor(host, { manager, model, tx, errorText, onReady, onState }) {
    Object.assign(this, { host, manager, model, tx, errorText, onReady, onState });
    const selected = LOCAL_MODELS.find(x => x.id === model);
    host.addClass('qbr-tts-local-panel');
    host.createDiv({ cls: 'qbr-tts-choice-feedback', text: `${tx('modelDownloadSize')} ${Math.ceil(selected?.bytes / 1024 ** 2)} MB · ${selected?.license || ''}` });
    this.status = host.createDiv({ cls: 'qbr-tts-choice-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    this.progress = host.createEl('progress', { attr: { max: '1' } }); this.progress.hidden = true;
    const actions = host.createDiv('qbr-tts-local-actions');
    this.install = action(actions, 'download', tx('downloadUse'), async () => {
      try { await manager.install(model); if (!this.disposed) await onReady(); }
      catch (error) { if (!this.disposed && error.name !== 'AbortError') this.status.setText(errorText(error)); }
    });
    this.cancel = action(actions, 'x', tx('cancelDownload'), () => manager.cancelInstall(model)); this.cancel.hidden = true;
    const details = host.createEl('details'); details.createEl('summary', { text: tx('localDetails') });
    details.createEl('p', { text: tx('localStorage') });
    details.createEl('p', { text: tx(model === 'melo' ? 'meloHelp' : 'kokoroHelp') });
    details.createEl('a', { text: selected.label + ' · ' + selected.license, href: selected.source, attr: { target: '_blank', rel: 'noopener' } });
    this.unsubscribe = manager.subscribe((id, state) => { if (id === model && !this.disposed) { this.refresh(state); onState?.(state); } });
    this.refresh(manager.snapshot(model));
    void manager.status(model).catch(error => { if (!this.disposed) this.status.setText(errorText(error)); });
  }
  refresh(state) {
    const busy = ['runtime', 'download', 'downloaded', 'environment', 'extract', 'installed', 'verify', 'cancelling'].includes(state.phase);
    const ready = state.phase === 'ready'; this.install.disabled = busy; this.install.hidden = ready; this.cancel.hidden = !busy;
    this.progress.hidden = !busy; this.cancel.disabled = state.phase === 'cancelling';
    if (state.total) { this.progress.value = state.bytes / state.total; }
    else this.progress.removeAttribute('value');
    const progress = state.total ? ` · ${Math.floor(state.bytes / 1024 ** 2)} / ${Math.ceil(state.total / 1024 ** 2)} MB` : '';
    this.status.setText(state.phase === 'error' ? this.errorText(state.error) : this.tx(`localPhase-${state.phase}`) + progress);
  }
  destroy() { this.disposed = true; this.unsubscribe?.(); }
}
