import { EPUB_CONTEXT_LIMITS } from './epub-context.js';

// Obsidian does not expose file-tree drag payloads in its public SDK. Keep the
// guarded native adapter here, then fall back to standard links/URIs.
export function droppedVaultBooks(app, transfer) {
  const native = app.dragManager?.draggable;
  const paths = [];
  if (native?.type === 'file' && native.file?.path) paths.push(native.file.path);
  else if (native?.type === 'files' && Array.isArray(native.files)) paths.push(...native.files.map(file => file.path));
  if (!paths.length) {
    const raw = transfer?.getData('text/uri-list') || transfer?.getData('text/plain') || '';
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      const wiki = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(line.trim());
      if (wiki) { paths.push(wiki[1]); continue; }
      if (line.startsWith('obsidian://open?')) {
        try {
          const url = new URL(line), vault = url.searchParams.get('vault');
          if (vault && vault !== app.vault.getName()) continue;
          paths.push(url.searchParams.get('file'));
        } catch { /* invalid URI */ }
      } else paths.push(line.trim());
    }
  }
  return [...new Set(paths)].map(path => path && app.vault.getAbstractFileByPath(path)).filter(file => file && file.extension?.toLowerCase() === 'epub');
}

export function bindBookAttachment({ host, app, extract, isCurrent, isBusy, onLoading, onReady, onError }) {
  let disposed = false, generation = 0, controller = null, loading = false;
  const cancel = () => {
    generation++; controller?.abort(); controller = null;
    loading = false; onLoading(false);
  };
  const attach = async file => {
    if (disposed || !isCurrent() || isBusy()) return;
    cancel();
    const task = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const current = () => !disposed && generation === task && isCurrent() && !signal.aborted;
    loading = true; onLoading(true, file);
    try {
      if (file.stat?.size > EPUB_CONTEXT_LIMITS.fileBytes) throw Object.assign(new Error('Too large'), { code: 'epub-attachment-too-large' });
      const bytes = await app.vault.readBinary(file);
      if (!current()) return;
      const result = await extract(bytes, { signal });
      if (!current()) return;
      onReady(file, result);
    } catch (error) {
      if (current() && error.name !== 'AbortError') onError(error.code || 'epub-attachment-invalid');
    } finally {
      if (generation === task && !disposed) { controller = null; loading = false; onLoading(false); }
    }
  };
  const dragover = event => {
    // getData can be empty during dragover; do not consume ordinary text drops.
    if (droppedVaultBooks(app, event.dataTransfer).length || Array.from(event.dataTransfer?.types || []).includes('text/uri-list')) {
      event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  };
  const drop = event => {
    const files = droppedVaultBooks(app, event.dataTransfer);
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation();
    if (isBusy()) { onError('epub-attachment-busy'); return; }
    if (files.length !== 1) { onError('epub-attachment-one'); return; }
    void attach(files[0]);
  };
  host.addEventListener('dragover', dragover);
  host.addEventListener('drop', drop);
  return { attach, cancel, get loading() { return loading; }, dispose() {
    disposed = true; cancel(); host.removeEventListener('dragover', dragover); host.removeEventListener('drop', drop);
  } };
}
