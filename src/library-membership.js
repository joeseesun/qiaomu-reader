// Library visibility is independent of the source file and reading records.
export async function setBookMembership(plugin, file, listed, textBook) {
  const settings = plugin.settings;
  const removed = settings.removedBookPaths || [];
  const selected = settings.textBookPaths || [];
  const nextRemoved = listed ? removed.filter(path => path !== file.path)
    : removed.includes(file.path) ? removed : [...removed, file.path];
  const nextSelected = listed && textBook && !selected.includes(file.path) ? [...selected, file.path] : selected;
  if (nextRemoved.length === removed.length && nextSelected === selected) return false;
  settings.removedBookPaths = nextRemoved;
  settings.textBookPaths = nextSelected;
  try {
    if (await plugin._saveLocalData() === false) throw new Error("library-membership-save-failed");
  } catch (error) {
    if (settings.removedBookPaths === nextRemoved) settings.removedBookPaths = removed;
    if (settings.textBookPaths === nextSelected) settings.textBookPaths = selected;
    throw error;
  }
  plugin.registerBookCommands();
  return true;
}
