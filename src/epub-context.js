import { PDF_AI_CONTEXT_MAX_CHARS } from './pdf-page-mode.js';
import { ZipReader, BlobReader } from 'foliate-js/vendor/zip.js';

export const EPUB_CONTEXT_LIMITS = Object.freeze({ fileBytes: 30 * 1024 * 1024, expandedBytes: 100 * 1024 * 1024, entryBytes: 8 * 1024 * 1024, entries: 10000, chapters: 2000, chars: PDF_AI_CONTEXT_MAX_CHARS });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = signal => { if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' }); };
function archivePath(base, href) {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) fail('epub-attachment-invalid');
  let value;
  try { value = decodeURIComponent(href.split('#')[0]); } catch { fail('epub-attachment-invalid'); }
  const parts = base ? base.split('/').slice(0, -1) : [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) fail('epub-attachment-invalid'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

// Parse detached documents only: never open an iframe, load resources, or run book scripts.
// Reuse Foliate's bundled zip.js with bounded decompression and cancellation.
export async function extractEpubContext(bytes, { signal, DOMParser: Parser = window.DOMParser, limits = EPUB_CONTEXT_LIMITS, yieldTask = () => new Promise(resolve => window.setTimeout(resolve, 0)) } = {}) {
  check(signal);
  if (bytes.byteLength > limits.fileBytes) fail('epub-attachment-too-large');
  const zip = new ZipReader(new BlobReader(new Blob([bytes])), { useWebWorkers: false });
  try {
    const entries = [];
    let expanded = 0, actualExpandedBytes = 0;
    for await (const entry of zip.getEntriesGenerator()) {
      check(signal);
      entries.push(entry); expanded += entry.uncompressedSize;
      if (entries.length > limits.entries || expanded > limits.expandedBytes) fail('epub-attachment-too-large');
    }
    const files = new Map(entries.map(entry => [entry.filename, entry]));
    const read = async path => {
      check(signal);
      const entry = files.get(path);
      if (!entry || entry.directory) fail('epub-attachment-invalid');
      if (entry.encrypted) fail('epub-attachment-invalid');
      if (entry.uncompressedSize > limits.entryBytes) fail('epub-attachment-too-large');
      // Count actual decompressed bytes too; do not trust the archive directory alone.
      let size = 0;
      const decoder = new TextDecoder();
      const chunks = [];
      const writer = {
        size: 0, initialized: true,
        writable: new WritableStream({ write(chunk) {
          size += chunk.byteLength; actualExpandedBytes += chunk.byteLength;
          if (size > limits.entryBytes || actualExpandedBytes > limits.expandedBytes) fail('epub-attachment-too-large');
          check(signal); chunks.push(decoder.decode(chunk, { stream: true }));
        } }),
        getData() { return chunks.join('') + decoder.decode(); },
      };
      try {
        const text = await entry.getData(writer, { signal, useWebWorkers: false });
        check(signal); return text;
      } catch (error) {
        check(signal);
        if (size > limits.entryBytes || actualExpandedBytes > limits.expandedBytes) fail('epub-attachment-too-large');
        throw error;
      }
    };
    const xml = text => {
      const doc = new Parser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) fail('epub-attachment-invalid');
      return doc;
    };
    const container = xml(await read('META-INF/container.xml'));
    const opfPath = archivePath('', container.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path'));
    const opf = xml(await read(opfPath));
    const manifest = new Map(Array.from(opf.getElementsByTagNameNS('*', 'item'), item => [item.getAttribute('id'), item]));
    const spine = Array.from(opf.getElementsByTagNameNS('*', 'itemref'));
    if (!spine.length) fail('epub-attachment-invalid');
    if (spine.length > limits.chapters) fail('epub-attachment-too-large');
    let text = '', truncated = false, chapters = 0;
    for (const ref of spine) {
      check(signal);
      const item = manifest.get(ref.getAttribute('idref'));
      if (!item || !/^(application\/xhtml\+xml|text\/html)$/.test(item.getAttribute('media-type') || '')) fail('epub-attachment-invalid');
      const html = await read(archivePath(opfPath, item.getAttribute('href')));
      const doc = new Parser().parseFromString(html, 'text/html');
      for (const el of doc.querySelectorAll('script,style,iframe,object,svg,template,noscript')) el.remove();
      for (const el of doc.querySelectorAll('p,div,section,h1,h2,h3,h4,h5,h6,li,br,tr')) el.append(doc.createTextNode('\n'));
      const chapter = (doc.body?.textContent || '').replace(/[\t \u00a0]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
      if (chapter) {
        const part = (text ? '\n\n' : '') + chapter;
        const available = limits.chars - text.length;
        text += part.slice(0, available);
        chapters++;
        if (part.length > available || text.length >= limits.chars && ref !== spine.at(-1)) { truncated = true; break; }
      }
      // Yield between chapters so navigation, removal and close can cancel work.
      await yieldTask();
    }
    check(signal);
    if (!text.trim()) fail('epub-attachment-empty');
    return { text, truncated, chapters, totalChapters: spine.length };
  } finally { await zip.close(); }
}
