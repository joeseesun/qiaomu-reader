// Only anchors are persisted, never book text or generated audio.
export function savedSpeechProgress(settings, file) {
  const saved = settings?.progress?.[file?.path];
  if (!file || !saved || saved.mtime !== file.stat?.mtime) return null;
  if (typeof saved.cfi === 'string' && saved.cfi.startsWith('epubcfi(')) return saved;
  if (Number.isInteger(saved.page) && saved.page > 0 && Number.isInteger(saved.offset) && saved.offset >= 0) return saved;
  return null;
}
export function rememberSpeechProgress(settings, file, anchor) {
  settings.progress ||= {};
  delete settings.progress[file.path];
  settings.progress[file.path] = { ...anchor, mtime: file.stat?.mtime };
  const paths = Object.keys(settings.progress);
  for (const path of paths.slice(0, Math.max(0, paths.length - 100))) delete settings.progress[path];
}
export function restorePdfSpeechPage(view, page) {
  const pager = view.pager;
  const target = pager?.flow?.querySelector(`.qiaomu-reader-pdf-page-break[data-pdf-page-no="${Number(page)}"]`);
  if (!target) return false;
  if (pager.scrollMode && pager.clip) {
    pager.clip.scrollTop += target.getBoundingClientRect().top - pager.clip.getBoundingClientRect().top;
    pager.spread = Math.min(pager.total - 1, Math.floor(pager.clip.scrollTop / Math.max(1, pager.clip.clientHeight)));
  } else {
    const x = target.getBoundingClientRect().left - pager.flow.getBoundingClientRect().left;
    pager.jumpTo(Math.floor(Math.round(x / (pager.sw / (pager.cols || 1))) / (pager.cols || 1)));
  }
  (view.updateUI || view._updateUI)?.call(view, pager.spread, pager.total);
  return true;
}

export function speechAnchorVisible(view, anchor) {
  if (!anchor) return false;
  if (anchor.page) return view.pager?.currentPdfPageNumber?.() === anchor.page;
  try {
    const spoken = view.engine?.rangeFromCfi(anchor.cfi), visible = view.engine?.currentLocation()?.range;
    if (!spoken || !visible || spoken.startContainer.ownerDocument !== visible.startContainer.ownerDocument) return false;
    return visible.comparePoint(spoken.startContainer, spoken.startOffset) === 0;
  } catch { return false; }
}
export function speechStartMode(view, settings) {
  const saved = savedSpeechProgress(settings, view.file);
  return saved && speechAnchorVisible(view, saved) ? 'resume' : 'page';
}
