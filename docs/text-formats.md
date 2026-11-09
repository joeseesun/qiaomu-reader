# Markdown, TXT and HTML in the reader

## Product contract

All three formats become safe HTML chapters in memory and use the existing
Foliate engine for pagination, scrolling, contents, search, highlights, notes,
AI selection context and reading progress. Original source bytes are retained.

- Library import and drag/drop accept `.md`, `.markdown`, `.txt`, `.html`, `.htm`.
  Clicking an imported Markdown document in the library opens Qiaomu Reader.
  Existing vault files can enter through the file menu or current-text command.
- Markdown is parsed as **GitHub Flavored Markdown**, independently of Obsidian's
  preview renderer and code-block processors. GFM tables (including alignment),
  task lists, strikethrough, autolinks, nested lists and fenced code become HTML.
  Frontmatter stays out of the body. Standard relative links/images resolve in
  the vault. Obsidian image embeds (`![[assets/image.png]]`, `![[image.png|alt]]`,
  `![[image.png|320]]`, `![[image.png|320x180]]`) use the same vault resolver,
  relative to the source note, including basename lookup. Missing images retain
  readable alt text or their path. Code examples and escaped embeds stay literal.
  Note/audio/PDF embeds, ordinary wikilinks and dynamic plugin blocks remain
  outside this static image support.
- TXT is escaped plain text, never parsed as Markdown or executable HTML. Blank
  lines separate paragraphs; repeated blank lines collapse. Newlines inside a
  paragraph and existing indentation are preserved; no extra first-line indent
  is imposed. Chinese chapter labels and Chapter/Part/Book generate headings.
  Unchaptered, line-wrapped prose is split into bounded internal reading units.
- HTML retains semantic content, including tables and images. Scripts, event
  attributes, forms, frames and source styles are removed. Each chapter also
  carries a restrictive CSP. Reading typography comes from the reader settings.
- Only explicitly imported/opened text documents enter the library. Ordinary
  vault notes are not automatically collected or globally redirected. Ebooks
  retain their existing folder discovery. A selected text document remains
  listed even when it is outside the configured book folder.
- Local images resolve relative to the vault source. Importing a single file
  does not copy companion files from the source filesystem; place attachments
  in the matching vault folder first. Remote images need a network connection.
- Supported encodings: UTF-8, BOM-tagged UTF-16 LE/BE, and GB18030 fallback.
  Empty, undecodable and over-20-MB documents have distinct recovery messages.

## Architecture and evidence

As requested on 2026-10-13, Markdown uses bundled **Marked 18.1.1** (MIT), with
GFM enabled, instead of calling the host Markdown renderer. Lexer/Parser receive
fresh options; no executable host code-block extensions run in this pipeline.
The generated DOM is sanitized before it becomes a book document. TXT creates
DOM text nodes directly; HTML uses the same sanitization boundary.

- GFM specification: https://github.github.com/gfm/
- Marked options: https://marked.js.org/using_advanced
- Foliate book interface: https://github.com/johnfactotum/foliate-js#the-main-interface-for-books
- Locked Foliate version: 1.0.1 (MIT).
- Source baseline: `0c0b3ed3d0b0269614c560caa56419268282cb2e` (main), isolated
  from the ongoing TTS branch and its uncommitted changes.

`text-book.js` provides searchable sections, hierarchical TOC and CFI-compatible
stable DOM. Chapter URLs are lazy and revoked on unload/destroy through the
existing Android frame registry. No intermediate EPUB or second reader exists.
The full Marked license is included in `licenses/marked-MIT.txt` and distributed
in the CSS asset. Production build notices lose indentation only, keeping the
existing 5-MB JavaScript budget without removing license text.

`settings.textBookPaths` records explicit enrollment. Rename updates library
membership, progress, note associations and highlights through existing queues;
delete removes enrollment without proactively deleting notes or highlights.
Large source edits can invalidate old CFI anchors; existing recovery and quote
fallback apply, with no promise of stable locations after arbitrary edits.

## Verification (2026-10-13, Asia/Shanghai)

- 385 automated tests pass, including real GFM parsing, TXT literal syntax,
  paragraph/poem preservation, encodings, chapter cleanup, HTML sanitization,
  library eligibility and existing ebook cover behavior.
- Zero-warning source lint, nine-language i18n checks, standard build and asset
  verification. Community build is checked separately before PR delivery.
- Real Obsidian 1.13.7 in isolated `/tmp/qbr-text-qa`; the existing TTS QA vault
  remains untouched. Viewed actual Markdown/HTML screenshots.
- Markdown, TXT and HTML: page turns, search, highlight creation/jump, close and
  reopen, and matching restored progress verified in the host.
- Actual library import of uppercase `.MD` and `.HTM`, local SVG image rendering
  (naturalWidth 400), and relative note links verified. TXT rename retained one
  highlight both in memory and on disk. Ordinary Markdown notes remained native.
- GFM extensions are separately checked in the actual reader after replacing
  host Markdown rendering; TXT poetry/paragraph rules have targeted tests.

Not covered: physical mobile devices, long-running large-document reading,
external AI providers, MHTML, interactive websites or dynamic Markdown plugins.
Release candidate: 4.6.1. GitHub CI, official scan, public assets and native
installation are separate release checks; they are not implied by local QA.
