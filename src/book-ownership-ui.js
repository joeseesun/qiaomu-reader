import { matchBook, vaultCatalog } from './book-catalog.js';

export function showBookOwnership(result, book, plugin, t, { records = vaultCatalog(plugin), calibre = [], onNavigate = () => {} } = {}) {
  const local = matchBook(book, records);
  const match = local || matchBook(book, calibre);
  if (!match) return;
  const label = result.row.ownerDocument.createElement('span');
  label.className = 'qiaomu-reader-ebook-owned';
  label.textContent = t(local && !local.record.file ? 'catalog.downloaded' : local ? (match.exact ? 'catalog.owned' : 'catalog.possible') : (match.exact ? 'catalog.calibre-owned' : 'catalog.calibre-possible'));
  result.row.querySelector('.qiaomu-reader-discovery-result-info').append(label);
  // A title + author match is useful context, never a download veto.
  if (local?.record.file) {
    const open = result.row.ownerDocument.createElement('button');
    open.type = 'button'; open.textContent = t('catalog.open');
    open.addEventListener('click', () => { onNavigate(); void plugin.openFile(local.record.file); });
    label.append(' ', open);
  }
}
