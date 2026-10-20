import JSZip from 'jszip';

export const chapter = '01 方案 根干枝叶的成长模型.xhtml';
export const legacyMetadata = `<dc:title>前传</dc:title>
  <dc:creator opf:role="aut" opf:file-as="Qiao Mu">乔木</dc:creator>
  <dc:language>zh</dc:language><meta name="calibre:title_sort" content="Prelude"/>`;
export const refinedMetadata = `<dc:title id="title">前传</dc:title>
  <dc:creator id="author">乔木</dc:creator><dc:language>zh</dc:language>
  <meta refines="#title" property="title-type">main</meta>
  <meta refines="#title" property="alternate-script" xml:lang="en">Prelude</meta>
  <meta refines="#author" property="role" scheme="marc:relators">aut</meta>
  <meta property="belongs-to-collection" id="collection">Reader Library</meta>
  <meta refines="#collection" property="collection-type">collection</meta>
  <meta refines="#collection" property="group-position">2</meta>
  <meta name="calibre:title_sort" content="Prelude"/>`;

// Mirrors web-exported EPUBs: UTF-8 names with the ZIP UTF-8 flag (bit 11)
// cleared and no Unicode Path extra field (0x7075) to recover them.
export async function unflaggedEpub(metadata = '<dc:title>前传</dc:title>', { version = '3.0', encodedHref = false } = {}) {
  const zip = new JSZip();
  const href = encodedHref ? encodeURIComponent(chapter) : chapter;
  const legacy = version === '2.0';
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('EPUB/package.opf', `<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="${version}"><metadata>${metadata}</metadata><manifest><item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"${legacy ? '' : ' properties="nav"'}/><item id="c0" href="${href}" media-type="application/xhtml+xml"/>${legacy ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}</manifest><spine${legacy ? ' toc="ncx"' : ''}><itemref idref="toc"/><itemref idref="c0"/></spine></package>`);
  zip.file('EPUB/toc.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="${href}#start">01 方案</a></li></ol></nav></body></html>`);
  if (legacy) zip.file('EPUB/toc.ncx', `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="c0" playOrder="1"><navLabel><text>01 方案</text></navLabel><content src="${href}#start"/></navPoint></navMap></ncx>`);
  zip.file(`EPUB/${chapter}`, '<html xmlns="http://www.w3.org/1999/xhtml"><body><p id="start">什么叫根干枝叶模型？</p></body></html>');
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const sig = view.getUint32(i, true);
    const header = sig === 0x04034b50 ? { flag: 6, name: 26, extra: 30 } : sig === 0x02014b50 ? { flag: 8, name: 28, extra: 46 } : null;
    if (!header) continue;
    view.setUint16(i + header.flag, view.getUint16(i + header.flag, true) & ~0x0800, true);
    const start = i + header.extra + view.getUint16(i + header.name, true), end = start + view.getUint16(i + header.name + 2, true);
    for (let at = start; at + 4 <= end; at += 4 + view.getUint16(at + 2, true))
      if (view.getUint16(at, true) === 0x7075) view.setUint16(at, 0xffff, true);
  }
  return bytes;
}
