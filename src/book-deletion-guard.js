// Compatibility adapter for Obsidian's internal attachment-cleanup flow.
// The public Vault API has no hook to exclude source books from this flow.
// Give only this deletion call a filtered view of the note's outgoing links;
// never edit the real metadata cache or the vault's cleanup preferences.
export function protectBooksFromNoteDeletion(app, bookExtensions) {
  const manager = app?.fileManager;
  const original = manager?.promptForDeletion;
  if (typeof original !== "function") return () => {};
  let active = true;
  const hadOwn = Object.hasOwn(manager, "promptForDeletion");
  function wrapped(file, ...args) {
    const currentApp = this.app;
    const cache = currentApp.metadataCache;
    if (!active || file?.extension?.toLowerCase() !== "md" || !cache?.resolvedLinks) {
      return original.call(this, file, ...args);
    }
    const links = new Proxy(cache.resolvedLinks, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key !== file.path || !value) return value;
        return Object.fromEntries(Object.entries(value).filter(([path]) =>
          !bookExtensions.has(path.split(".").at(-1).toLowerCase())));
      },
    });
    const scopedCache = scopedProperty(cache, "resolvedLinks", links);
    const scopedApp = scopedProperty(currentApp, "metadataCache", scopedCache);
    const scopedManager = scopedProperty(this, "app", scopedApp);
    return original.call(scopedManager, file, ...args);
  }
  manager.promptForDeletion = wrapped;
  return () => {
    active = false;
    if (manager.promptForDeletion !== wrapped) return;
    if (hadOwn) manager.promptForDeletion = original;
    else delete manager.promptForDeletion;
  };
}

function scopedProperty(target, property, value) {
  return new Proxy(target, {
    get(object, key) {
      if (key === property) return value;
      const result = Reflect.get(object, key, object);
      return typeof result === "function" ? result.bind(object) : result;
    },
  });
}
