// Empty is an explicit vault-root choice; undefined means use the default.
export function noteFolderPath(value) {
  const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (path.split('/').some(part => part === '.' || part === '..' || /[:*?"<>|]/.test(part) || Array.from(part).some(char => char.charCodeAt(0) < 32))) {
    throw new Error('Invalid vault folder path');
  }
  return path;
}
export async function ensureNoteFolder(vault, value, isFolder) {
  const path = noteFolderPath(value);
  if (!path) return vault.getRoot();
  let parent = '';
  for (const part of path.split('/')) {
    parent = parent ? `${parent}/${part}` : part;
    let entry = vault.getAbstractFileByPath(parent);
    if (!entry) {
      try { await vault.createFolder(parent); }
      catch (error) { if (!vault.getAbstractFileByPath(parent)) throw error; }
      entry = vault.getAbstractFileByPath(parent);
    }
    if (!isFolder(entry)) throw new Error('A file occupies the folder path');
  }
  return vault.getAbstractFileByPath(path);
}

// Before explicit-root support, empty per-book/last-note paths inherited the
// excerpt folder. Materialize that inherited default once without moving files.
export function migrateNoteFolderDefaults(settings) {
  if (settings.noteFolderRootSemanticsMigrated) return false;
  const inherited = typeof settings.notesFolder === 'string' ? settings.notesFolder.trim() : '';
  const wasEmpty = value => !String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (inherited && !wasEmpty(inherited)) {
    if (wasEmpty(settings.bookNotesFolder)) settings.bookNotesFolder = inherited;
    if (wasEmpty(settings.lastNoteFolder)) settings.lastNoteFolder = inherited;
  }
  settings.noteFolderRootSemanticsMigrated = true;
  return true;
}
