// Stable library ordering and import identity, independent of host UI.
export function libraryTarget(settings = {}) {
  return String(settings.downloadFolder || settings.booksFolder || 'Books').trim().replace(/^\/+|\/+$/g, '') || 'Books';
}
export function sortLibrary(files, mode, locale, progress, imports = {}) {
  const collator = new Intl.Collator(locale?.startsWith('zh') ? 'zh-Hans-u-co-pinyin' : locale || 'en', { numeric: true, sensitivity: 'base' });
  return files.sort((a, b) => {
    const score = f => mode === 'added' ? imports[f.path]?.addedAt || f.stat?.ctime || 0
      : mode === 'title' ? 0 : progress(f.path)?.lastRead || 0;
    return score(b) - score(a) || collator.compare(a.basename, b.basename) || collator.compare(a.path, b.path);
  });
}
export function cleanBookName(name, metadata = {}) {
  const ext = String(name).split('.').pop().toLowerCase();
  const original = String(name).replace(/\.[^.]+$/, '');
  const clean = value => String(value || '').replace(/\s*[([]\s*z[- ]?library\s*[)\]]\s*/gi, ' ').replace(/[_ -]+z[_ -]?library(?:[_ .-]+(?:sk|se|org|com|1lib|z[_ -]?lib))*[_ .-]*$/i, '').replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  const title = clean(metadata.title || original) || 'Book';
  const rawAuthor = Array.isArray(metadata.author) ? metadata.author.map(x => typeof x === 'object' ? x.name : x).join(', ') : typeof metadata.author === 'object' ? metadata.author?.name : metadata.author;
  const author = clean(rawAuthor);
  let stem = (title + (author ? ' - ' + author : '')).slice(0, 140).replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  return stem + '.' + ext;
}
export async function bookDigest(bytes, cryptoApi = crypto) {
  return Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export async function findDuplicateBook(bytes, files, records, read, cryptoApi = crypto) {
  const digest = await bookDigest(bytes, cryptoApi);
  for (const file of files) {
    if (file.stat?.size !== bytes.byteLength) continue;
    const old = records[file.path];
    const hash = old?.sha256 && old.mtime === file.stat.mtime && old?.size === file.stat.size ? old.sha256 : await bookDigest(await read(file), cryptoApi);
    records[file.path] = { ...old, sha256: hash, mtime: file.stat.mtime, size: file.stat.size };
    if (hash === digest) return { digest, duplicate: file };
  }
  return { digest, duplicate: null };
}
