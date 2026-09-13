import { calibreNodeBuiltin, calibreRuntime, execFileUtf8 } from "./calibre-node.js";

export const CALIBRE_FORMAT_ORDER = ["epub", "pdf", "fb2", "fbz", "azw3", "mobi", "azw", "cbz"];
export const CALIBRE_WARN_BYTES = 50 * 1024 * 1024;
export const CALIBRE_BLOCK_BYTES = 150 * 1024 * 1024;

const SEARCH_PY = `
import json, os, sqlite3, sys
db, mode, payload = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()

def like_term(raw):
    text = str(raw or "").strip()
    for ch in ("%","_"):
        text = text.replace(ch, " ")
    return "%" + text + "%" if text else "%"

def pack(row):
    formats = [x for x in str(row["formats"] or "").split(",") if x]
    sizes = {}
    for part in str(row["sizes"] or "").split(","):
        if ":" not in part: continue
        fmt, _, rest = part.partition(":")
        try: sizes[fmt.upper()] = int(rest)
        except: pass
    stems = {}
    for part in str(row["stems"] or "").split("||"):
        if ":" not in part: continue
        fmt, _, rest = part.partition(":")
        stems[fmt.upper()] = rest
    return {
        "id": row["id"],
        "uuid": row["uuid"] or "",
        "title": row["title"] or "",
        "authors": row["authors"] or "",
        "path": row["path"] or "",
        "hasCover": bool(row["has_cover"]),
        "lastModified": row["last_modified"] or "",
        "formats": formats,
        "sizes": sizes,
        "stems": stems,
        "isbn": row["isbn"] or "",
        "posFrac": row["pos_frac"] if row["pos_frac"] is not None else None,
        "lastRead": row["last_read"] if row["last_read"] is not None else None,
    }

BASE = '''
SELECT b.id, b.title, b.path, b.uuid, b.has_cover, b.last_modified,
  (SELECT group_concat(a.name, " & ") FROM books_authors_link al JOIN authors a ON a.id=al.author WHERE al.book=b.id) AS authors,
  (SELECT group_concat(d.format, ",") FROM data d WHERE d.book=b.id) AS formats,
  (SELECT group_concat(d.format || ":" || d.uncompressed_size, ",") FROM data d WHERE d.book=b.id) AS sizes,
  (SELECT group_concat(d.format || ":" || d.name, "||") FROM data d WHERE d.book=b.id) AS stems,
  (SELECT i.val FROM identifiers i WHERE i.book=b.id AND lower(i.type)="isbn" LIMIT 1) AS isbn,
  (SELECT MAX(p.pos_frac) FROM last_read_positions p WHERE p.book=b.id) AS pos_frac,
  (SELECT MAX(p.epoch) FROM last_read_positions p WHERE p.book=b.id) AS last_read
FROM books b
'''

limit = max(1, min(int(payload.get("limit") or 30), 80))
rows = []
if mode == "ids":
    ids = [int(x) for x in payload.get("ids") or [] if str(x).isdigit()]
    if ids:
        qmarks = ",".join("?" * len(ids))
        rows = cur.execute(BASE + " WHERE b.id IN (" + qmarks + ")", ids).fetchall()
elif mode == "recent":
    rows = cur.execute(BASE + '''
      WHERE EXISTS (SELECT 1 FROM last_read_positions p WHERE p.book=b.id)
      ORDER BY last_read DESC LIMIT ?
    ''', (limit,)).fetchall()
else:
    q = str(payload.get("q") or "").strip()
    field = str(payload.get("field") or "").strip().lower()
    term = like_term(q)
    where = "1=1"
    args = []
    if q:
        if field == "title":
            where = "b.title LIKE ? COLLATE NOCASE"
            args = [term]
        elif field == "author":
            where = '''EXISTS (
              SELECT 1 FROM books_authors_link al JOIN authors a ON a.id=al.author
              WHERE al.book=b.id AND a.name LIKE ? COLLATE NOCASE)'''
            args = [term]
        elif field == "tag":
            where = '''EXISTS (
              SELECT 1 FROM books_tags_link tl JOIN tags t ON t.id=tl.tag
              WHERE tl.book=b.id AND t.name LIKE ? COLLATE NOCASE)'''
            args = [term]
        elif field == "format":
            where = "EXISTS (SELECT 1 FROM data d WHERE d.book=b.id AND d.format LIKE ? COLLATE NOCASE)"
            args = [term]
        elif field == "isbn":
            where = '''EXISTS (
              SELECT 1 FROM identifiers i WHERE i.book=b.id AND i.val LIKE ? COLLATE NOCASE)'''
            args = [term]
        else:
            where = '''(
              b.title LIKE ? COLLATE NOCASE
              OR EXISTS (SELECT 1 FROM books_authors_link al JOIN authors a ON a.id=al.author
                         WHERE al.book=b.id AND a.name LIKE ? COLLATE NOCASE)
              OR EXISTS (SELECT 1 FROM identifiers i WHERE i.book=b.id AND i.val LIKE ? COLLATE NOCASE)
              OR EXISTS (SELECT 1 FROM books_tags_link tl JOIN tags t ON t.id=tl.tag
                         WHERE tl.book=b.id AND t.name LIKE ? COLLATE NOCASE)
            )'''
            args = [term, term, term, term]
    sql = BASE + " WHERE " + where + " ORDER BY b.last_modified DESC LIMIT ?"
    rows = cur.execute(sql, args + [limit]).fetchall()

print(json.dumps([pack(r) for r in rows], ensure_ascii=False))
`.trim();

export function isCalibreSyntaxQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return false;
  if (/[()]/.test(q)) return true;
  if (/\b(and|or|not)\b/i.test(q)) return true;
  return false;
}

export function parseSimpleCalibreQuery(raw) {
  const q = String(raw || "").trim();
  const match = q.match(/^(title|author|tag|format|isbn)\s*:\s*(.+)$/i);
  if (match) return { field: match[1].toLowerCase(), q: match[2].trim() };
  return { field: "", q };
}

export function pickPreferredFormat(formats, allowed) {
  const have = new Set((formats || []).map((f) => String(f).toLowerCase()));
  const allow = allowed && allowed.size ? allowed : new Set(CALIBRE_FORMAT_ORDER);
  for (const fmt of CALIBRE_FORMAT_ORDER) {
    if (have.has(fmt) && allow.has(fmt)) return fmt;
  }
  for (const fmt of have) if (allow.has(fmt)) return fmt;
  return "";
}

export function formatBytes(n) {
  const size = Number(n) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 50 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function calibreLibraryName(libraryPath, pathApi) {
  const base = pathApi.basename(String(libraryPath || "").replace(/[\\/]+$/, ""));
  return base.replace(/ /g, "_") || "_";
}

export function isInsideDir(root, target, pathApi) {
  if (!root || !target || !pathApi) return false;
  const sep = pathApi.sep || "/";
  const resolvedRoot = pathApi.resolve(String(root));
  const resolvedTarget = pathApi.resolve(String(target));
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(prefix);
}

export function copyToArrayBuffer(data) {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out.buffer;
}

export function calibreSafeFilename(title, format) {
  let stem = String(title || "book").normalize("NFC");
  stem = [...stem].filter((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join("");
  stem = stem.replace(/[\\/:*?"<>|]/g, "_");
  stem = stem.replace(/[：＊？＂＜＞｜]/g, "_");
  stem = stem.replace(/^\.+/g, "").replace(/[. ]+$/g, "").trim() || "book";
  if (stem.length > 120) stem = stem.slice(0, 120).trim() || "book";
  const ext = String(format || "epub").toLowerCase().replace(/[^a-z0-9]/g, "") || "epub";
  return `${stem}.${ext}`;
}

export function readLibraryFile(libraryPath, filePath) {
  const rt = calibreRuntime();
  if (!rt) throw new Error("desktop-only");
  if (!isInsideDir(libraryPath, filePath, rt.path)) throw new Error("path-outside-library");
  const data = rt.fs.readFileSync(filePath);
  return { bytes: copyToArrayBuffer(data), size: data.length };
}

export function detectCalibreLibraryPath(configured = "") {
  const rt = calibreRuntime();
  if (!rt) return "";
  const { fs, os, path } = rt;
  const candidates = [];
  const given = String(configured || "").trim();
  if (given) candidates.push(given);
  try {
    const prefs = path.join(os.homedir(), "Library", "Preferences", "calibre", "global.py.json");
    if (fs.existsSync(prefs)) {
      const data = JSON.parse(fs.readFileSync(prefs, "utf8"));
      if (data && data.library_path) candidates.push(String(data.library_path));
    }
  } catch { /* Calibre prefs are optional */ }
  candidates.push(path.join(os.homedir(), "calibre"), path.join(os.homedir(), "Calibre Library"));
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "metadata.db"))) return dir;
  }
  return "";
}

export function detectCalibredbPath(configured = "") {
  const rt = calibreRuntime();
  if (!rt) return "";
  const { fs, os, path } = rt;
  const given = String(configured || "").trim();
  const extra = [
    "/Applications/calibre.app/Contents/MacOS/calibredb",
    "/opt/homebrew/bin/calibredb",
    "/usr/local/bin/calibredb",
    path.join(os.homedir(), "calibre.app", "Contents", "MacOS", "calibredb"),
  ];
  if (typeof window !== "undefined" && window.process?.platform === "win32") {
    const pf = window.process.env?.ProgramFiles || "C:\\Program Files";
    const pf86 = window.process.env?.["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    extra.push(path.join(pf, "Calibre2", "calibredb.exe"), path.join(pf86, "Calibre2", "calibredb.exe"));
  }
  const envPath = (typeof window !== "undefined" && window.process && window.process.env && window.process.env.PATH) || "";
  const dirs = envPath.split(path.delimiter || ":").filter(Boolean);
  const names = window.process?.platform === "win32" ? ["calibredb.exe", "calibredb"] : ["calibredb"];
  const candidates = [given, ...extra];
  for (const dir of dirs) for (const name of names) candidates.push(path.join(dir, name));
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file;
  }
  return "";
}

function pythonBinaries() {
  const platform = typeof window !== "undefined" && window.process ? window.process.platform : "";
  return platform === "win32" ? ["python", "python3"] : ["python3", "python"];
}

async function queryMetadataDb(libraryPath, mode, payload) {
  const rt = calibreRuntime();
  if (!rt) throw new Error("desktop-only");
  const { childProcess, fs, os, path } = rt;
  const src = path.join(path.resolve(libraryPath), "metadata.db");
  if (!isInsideDir(libraryPath, src, path) || !fs.existsSync(src)) throw new Error("metadata.db missing");
  const tmp = path.join(os.tmpdir(), `qiaomu-calibre-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  fs.copyFileSync(src, tmp);
  const args = ["-c", SEARCH_PY, tmp, mode, JSON.stringify(payload || {})];
  let lastError = null;
  try {
    for (const bin of pythonBinaries()) {
      try {
        const { stdout } = await execFileUtf8(childProcess, bin, args, { timeout: 15000 });
        const parsed = JSON.parse(String(stdout || "[]").trim() || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        lastError = error;
        if (error && (error.code === "ENOENT" || /not found/i.test(String(error.message)))) continue;
        throw error;
      }
    }
    throw lastError || new Error("python not found");
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* temp db */ }
  }
}

async function searchCalibredbIds(libraryPath, calibredbPath, query, limit) {
  const rt = calibreRuntime();
  if (!rt) throw new Error("desktop-only");
  if (!calibredbPath) throw new Error("calibredb-missing");
  const { childProcess } = rt;
  const { stdout } = await execFileUtf8(childProcess, calibredbPath, [
    "search",
    "--library-path", libraryPath,
    "--limit", String(limit),
    query,
  ], { timeout: 25000 });
  return String(stdout || "")
    .trim()
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
}

export function resolveCalibreBookFile(libraryPath, book, format) {
  const rt = calibreRuntime();
  if (!rt || !book || !format) return "";
  const { fs, path } = rt;
  const dir = path.join(libraryPath, book.path || "");
  if (!isInsideDir(libraryPath, dir, path)) return "";
  const want = String(format).toLowerCase();
  const stem = (book.stems && (book.stems[format.toUpperCase()] || book.stems[want.toUpperCase()])) || "";
  const pick = (abs) => (abs && isInsideDir(libraryPath, abs, path) && fs.existsSync(abs) ? abs : "");
  if (stem) {
    const exact = pick(path.join(dir, `${stem}.${want}`));
    if (exact) return exact;
  }
  if (!fs.existsSync(dir)) return "";
  try {
    const hit = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith(`.${want}`));
    return hit ? pick(path.join(dir, hit)) : "";
  } catch {
    return "";
  }
}

export function calibreCoverPath(libraryPath, book) {
  const rt = calibreRuntime();
  if (!rt || !book || !book.path) return "";
  const file = rt.path.join(libraryPath, book.path, "cover.jpg");
  if (!isInsideDir(libraryPath, file, rt.path)) return "";
  return rt.fs.existsSync(file) ? file : "";
}

export function readCoverDataUrl(coverPath) {
  const rt = calibreRuntime();
  if (!rt || !coverPath || !rt.fs.existsSync(coverPath)) return "";
  const buf = rt.fs.readFileSync(coverPath);
  const base64 = typeof buf.toString === "function" ? buf.toString("base64") : "";
  return base64 ? `data:image/jpeg;base64,${base64}` : "";
}

function booksFromCalibredbRows(rows, libraryPath, pathApi) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const formatPaths = Array.isArray(row.formats) ? row.formats : [];
    const formats = [];
    const stems = {};
    let relPath = "";
    for (const abs of formatPaths) {
      if (!abs || !isInsideDir(libraryPath, abs, pathApi)) continue;
      const ext = pathApi.extname(abs).slice(1).toUpperCase();
      if (!ext) continue;
      formats.push(ext);
      stems[ext] = pathApi.basename(abs, pathApi.extname(abs));
      relPath = pathApi.relative(libraryPath, pathApi.dirname(abs));
    }
    const identifiers = row.identifiers && typeof row.identifiers === "object" ? row.identifiers : {};
    const isbn = row.isbn || identifiers.isbn || identifiers.ISBN || "";
    const size = Number(row.size) || 0;
    const sizes = {};
    if (formats[0] && size) sizes[formats[0]] = size;
    return {
      id: row.id,
      uuid: row.uuid || "",
      title: row.title || "",
      authors: String(row.authors || "").replace(/,/g, " & "),
      path: relPath,
      hasCover: true,
      lastModified: row.last_modified || "",
      formats,
      sizes,
      stems,
      isbn: String(isbn),
      posFrac: null,
      lastRead: null,
    };
  });
}

async function searchViaCalibredb(libraryPath, calibredbPath, query, limit) {
  const rt = calibreRuntime();
  if (!rt) throw new Error("desktop-only");
  if (!calibredbPath) throw new Error("calibredb-missing");
  const { childProcess, path } = rt;
  const args = [
    "list",
    "--library-path", libraryPath,
    "--for-machine",
    "-f", "title,authors,formats,uuid,id,identifiers,isbn,size",
    "--limit", String(limit),
  ];
  if (query) args.push("-s", query);
  else args.push("--sort-by", "last_modified");
  const { stdout } = await execFileUtf8(childProcess, calibredbPath, args, { timeout: 25000 });
  const rows = JSON.parse(String(stdout || "[]").trim() || "[]");
  return {
    books: booksFromCalibredbRows(rows, libraryPath, path),
    mode: query ? "calibredb" : "recent",
  };
}

export async function searchCalibreLibrary({ libraryPath, calibredbPath, query, limit = 30, syntax = false }) {
  const q = String(query || "").trim();
  const useSyntax = syntax || isCalibreSyntaxQuery(q);
  try {
    if (!q && !useSyntax) {
      return { books: await queryMetadataDb(libraryPath, "recent", { limit }), mode: "recent" };
    }
    if (useSyntax) {
      const ids = await searchCalibredbIds(libraryPath, calibredbPath, q, limit);
      if (!ids.length) return { books: [], mode: "calibredb" };
      const books = await queryMetadataDb(libraryPath, "ids", { ids });
      const order = new Map(ids.map((id, i) => [Number(id), i]));
      books.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { books, mode: "calibredb" };
    }
    const parsed = parseSimpleCalibreQuery(q);
    const books = await queryMetadataDb(libraryPath, "search", { ...parsed, limit });
    return { books, mode: "sqlite" };
  } catch (error) {
    if (!calibredbPath) throw error;
    const searchQuery = useSyntax || q ? (useSyntax ? q : (parseSimpleCalibreQuery(q).field
      ? `${parseSimpleCalibreQuery(q).field}:${parseSimpleCalibreQuery(q).q}`
      : q)) : "";
    return searchViaCalibredb(libraryPath, calibredbPath, searchQuery, limit);
  }
}

export function openCalibreShowBook(libraryPath, bookId) {
  const rt = calibreRuntime();
  if (!rt || !bookId) return false;
  const name = calibreLibraryName(libraryPath, rt.path);
  const url = `calibre://show-book/${name}/${bookId}`;
  try {
    const electron = calibreNodeBuiltin("electron");
    if (electron?.shell?.openExternal) {
      void electron.shell.openExternal(url);
      return true;
    }
  } catch { /* fall through */ }
  if (typeof window !== "undefined") window.open(url);
  return true;
}

export function findCalibreImport(settings, vaultPath) {
  const map = (settings && settings.calibreImports) || {};
  for (const rec of Object.values(map)) {
    if (rec && rec.path === vaultPath) return rec;
  }
  return null;
}

export function findCalibreImportByUuid(settings, uuid) {
  if (!uuid) return null;
  const map = (settings && settings.calibreImports) || {};
  return map[uuid] || null;
}

export function findCalibreImportByIsbn(settings, isbn) {
  const want = String(isbn || "").replace(/[^0-9Xx]/g, "");
  if (want.length < 10) return null;
  const map = (settings && settings.calibreImports) || {};
  for (const rec of Object.values(map)) {
    const have = String(rec && rec.isbn || "").replace(/[^0-9Xx]/g, "");
    if (have && have === want) return rec;
  }
  return null;
}

export function forgetCalibreImportByPath(settings, vaultPath) {
  const map = settings.calibreImports || {};
  for (const [uuid, rec] of Object.entries(map)) {
    if (rec && rec.path === vaultPath) delete map[uuid];
  }
}
