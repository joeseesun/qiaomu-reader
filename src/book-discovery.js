const GUTENBERG_ORIGIN = "https://www.gutenberg.org";
const GUTENBERG_BOOK = /^\/ebooks\/(\d+)(?:\.opds)?$/;
const MAX_EPUB_BYTES = 30 * 1024 * 1024;

export function externalBookSearchUrls(query) {
  const value = String(query || "").trim();
  if (!value) return null;
  return {
    anna: `https://annas-archive.gl/search?q=${encodeURIComponent(value)}`,
    zlibrary: `https://z-library.sk/s/${encodeURIComponent(value)}`
  };
}

export function gutenbergSearchUrl(query) {
  return `${GUTENBERG_ORIGIN}/ebooks/search.opds/?query=${encodeURIComponent(String(query || "").trim())}`;
}

export function gutenbergBookId(value) {
  try {
    const url = new URL(value, GUTENBERG_ORIGIN);
    if (url.origin !== GUTENBERG_ORIGIN) return null;
    return GUTENBERG_BOOK.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

export function gutenbergDetailUrl(id) {
  if (!/^\d+$/.test(String(id))) throw new Error("Invalid Gutenberg book ID");
  return `${GUTENBERG_ORIGIN}/ebooks/${id}.opds`;
}

export function gutenbergPageUrl(id) {
  if (!/^\d+$/.test(String(id))) throw new Error("Invalid Gutenberg book ID");
  return `${GUTENBERG_ORIGIN}/ebooks/${id}`;
}

export function gutenbergCoverUrl(id) {
  if (!/^\d+$/.test(String(id))) throw new Error("Invalid Gutenberg book ID");
  return `${GUTENBERG_ORIGIN}/cache/epub/${id}/pg${id}.cover.medium.jpg`;
}

function atomChildren(parent, name) {
  return Array.from(parent?.children || []).filter((node) => node.localName === name && node.namespaceURI === "http://www.w3.org/2005/Atom");
}

function atomText(parent, name) {
  return atomChildren(parent, name)[0]?.textContent?.trim() || "";
}

function parseFeed(xml, parseXml) {
  if (typeof xml !== "string" || xml.length > 2_000_000) throw new Error("Invalid catalog response");
  const doc = parseXml(xml);
  if (doc.querySelector("parsererror") || doc.documentElement?.localName !== "feed") throw new Error("Invalid catalog response");
  return doc.documentElement;
}

export function parseGutenbergSearch(xml, parseXml) {
  const feed = parseFeed(xml, parseXml);
  const books = new Map();
  for (const entry of atomChildren(feed, "entry")) {
    const id = gutenbergBookId(atomText(entry, "id"));
    if (!id || books.has(id)) continue;
    const title = atomText(entry, "title");
    if (!title) continue;
    const authorNode = atomChildren(entry, "content")[0];
    const authorValue = atomChildren(entry, "author").map((person) => atomText(person, "name")).filter(Boolean).join(", ") ||
      (authorNode?.getAttribute("type") === "text" ? authorNode.textContent?.trim() || "" : "");
    const author = /^[\d,. ]+\s+downloads?$/i.test(authorValue) ? "" : authorValue;
    books.set(id, { id, title, author, pageUrl: gutenbergPageUrl(id) });
  }
  return Array.from(books.values()).slice(0, 25);
}

export function parseGutenbergEpub(xml, id, parseXml) {
  const feed = parseFeed(xml, parseXml);
  const choices = [];
  for (const entry of atomChildren(feed, "entry")) {
    for (const link of atomChildren(entry, "link")) {
      if (link.getAttribute("rel") !== "http://opds-spec.org/acquisition" || link.getAttribute("type") !== "application/epub+zip") continue;
      const raw = link.getAttribute("href");
      if (!raw) continue;
      let url;
      try { url = new URL(raw, GUTENBERG_ORIGIN); } catch { continue; }
      if (url.origin !== GUTENBERG_ORIGIN || !url.pathname.startsWith(`/ebooks/${id}.epub`)) continue;
      const length = Number(link.getAttribute("length"));
      if (Number.isFinite(length) && length > MAX_EPUB_BYTES) continue;
      choices.push({ url: url.href, length, title: link.getAttribute("title") || "" });
    }
  }
  choices.sort((a, b) => Number(b.url.includes(".epub3.images")) - Number(a.url.includes(".epub3.images")));
  return choices[0] || null;
}

export function validGutenbergEpub(bytes) {
  return bytes instanceof ArrayBuffer && bytes.byteLength > 100 && bytes.byteLength <= MAX_EPUB_BYTES &&
    new Uint8Array(bytes, 0, 4).every((byte, index) => byte === [0x50, 0x4b, 0x03, 0x04][index]);
}

export function safeBookFileName(title, id) {
  const clean = String(title || "Book").replace(/[\\/:*?"<>|]/g, " ").split("").map((char) => char.charCodeAt(0) < 32 ? " " : char).join("").replace(/\s+/g, " ").trim().slice(0, 100) || "Book";
  return `${clean} (Gutenberg ${id}).epub`;
}
