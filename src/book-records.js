import { bookDigest } from './library-data.js';
import { bookMetadata } from './book-catalog.js';

export const BOOK_RECORD_FOLDER = 'Qiaomu Reader/Book records';
// Plain Markdown files participate in normal vault sync, without copying device
// identity or credentials. One record per content hash avoids a global hot file.
export function createBookRecords(plugin) {
  const { vault, metadataCache, fileManager } = plugin.app;
  const records = new Map();
  let queue = Promise.resolve(), resolved = false;
  const hydrate = record => {
    const book = vault.getAbstractFileByPath(record.path);
    if (book?.stat) plugin.settings.bookImports[record.path] = { ...plugin.settings.bookImports[record.path], ...record, size: book.stat.size, mtime: undefined };
  };
  const accept = (file, cache = metadataCache.getFileCache(file)) => {
    const data = cache?.frontmatter?.qiaomu_book;
    if (data?.version !== 1 || typeof data.path !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256 || '')) { records.delete(file.path); return; }
    records.set(file.path, { ...bookMetadata(data), path: data.path, sha256: data.sha256, addedAt: Number(data.addedAt) || 0, jobs: Array.isArray(data.jobs) ? data.jobs.filter(x => /^[a-f0-9]{32}$/.test(x)) : [], recordPath: file.path });
    hydrate(records.get(file.path));
  };
  for (const file of vault.getMarkdownFiles()) accept(file);
  plugin.registerEvent(metadataCache.on('changed', (file, _text, cache) => accept(file, cache)));
  plugin.registerEvent(metadataCache.on('resolved', () => {
    if (resolved) return; resolved = true;
    for (const file of vault.getMarkdownFiles()) accept(file);
  }));
  plugin.registerEvent(vault.on('create', file => {
    const record = [...records.values()].find(record => record.path === file.path);
    if (record) hydrate(record);
  }));
  plugin.registerEvent(vault.on('delete', file => records.delete(file.path)));
  plugin.registerEvent(vault.on('rename', (file, oldPath) => {
    for (const [path, record] of [...records]) {
      if (path === oldPath || path.startsWith(oldPath + '/')) {
        records.delete(path); record.recordPath = file.path + path.slice(oldPath.length); records.set(record.recordPath, record);
      }
    }
    for (const record of records.values()) {
      if (record.path === oldPath || record.path.startsWith(oldPath + '/')) {
        const path = file.path + record.path.slice(oldPath.length);
        const book = vault.getAbstractFileByPath(path);
        if (book?.stat) void write(book, { ...record, sha256: undefined }, record.jobs).catch(error => console.warn('Qiaomu Reader: book record rename failed', error));
      }
    }
  }));
  async function write(file, metadata, jobs = []) {
    const task = async () => {
      if (plugin._unloading) throw new Error('book-record-closed');
      const existing = plugin.settings.bookImports[file.path] || {};
      const sha256 = metadata.sha256 || (existing.mtime === file.stat.mtime && existing.size === file.stat.size ? existing.sha256 : '') || await bookDigest(await vault.readBinary(file));
      const prior = [...records.values()].find(x => x.sha256 === sha256);
      const recordPath = prior?.recordPath || `${BOOK_RECORD_FOLDER}/${sha256}.md`;
      const data = { version: 1, ...bookMetadata(prior), ...bookMetadata(existing), ...bookMetadata(metadata), path: file.path, sha256, addedAt: prior?.addedAt || existing.addedAt || Date.now(), jobs: [...new Set([...(prior?.jobs || []), ...jobs])].filter(x => /^[a-f0-9]{32}$/.test(x)) };
      let note = vault.getAbstractFileByPath(recordPath);
      if (!note) {
        const parts = BOOK_RECORD_FOLDER.split('/');
        for (let i = 1; i <= parts.length; i++) {
          const dir = parts.slice(0, i).join('/');
          if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir).catch(error => { if (!vault.getAbstractFileByPath(dir)) throw error; });
        }
        if (plugin._unloading) throw new Error('book-record-closed');
        // Frontmatter is JSON (valid YAML); untrusted titles cannot inject fields.
        const link = fileManager.generateMarkdownLink(file, recordPath);
        const visible = Object.entries(bookMetadata(data)).map(([key, value]) => `- ${key}: ${String(value).replace(/[<>&[\]\n\r]/g, ' ')}`).join('\n');
        try { note = await vault.create(recordPath, `---\nqiaomu_book: ${JSON.stringify(data)}\n---\n\n${link}\n\n${visible}\n`); }
        catch (error) { note = vault.getAbstractFileByPath(recordPath); if (!note) throw error; }
      }
      if (plugin._unloading) throw new Error('book-record-closed');
      await fileManager.processFrontMatter(note, frontmatter => {
        const old = frontmatter.qiaomu_book;
        if (old?.version !== 1 || old.sha256 !== sha256) throw new Error('book-record-schema');
        frontmatter.qiaomu_book = { ...old, ...data, jobs: [...new Set([...(Array.isArray(old.jobs) ? old.jobs : []), ...data.jobs])] };
      });
      records.set(note.path, { ...data, recordPath: note.path });
      plugin.settings.bookImports[file.path] = { ...existing, ...data, recordPath: note.path, size: file.stat.size, mtime: file.stat.mtime };
      return note;
    };
    const result = queue.catch(() => {}).then(task); queue = result; return result;
  }
  return { write, hasJob: id => [...records.values()].some(x => x.jobs.includes(id)), entries: () => [...records.values()], drain: () => queue.catch(() => {}) };
}
