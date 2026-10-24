# Qiaomu Reader · Reader HUD and AI Reading

## 1. Visual theme and atmosphere

The reader is a quiet, content-first Obsidian surface. Reading chrome uses warm-neutral, low-contrast materials that feel attached to the host application while remaining visibly above the page. The memorable action is a matched pair of top and bottom HUD bars that retract without changing page geometry.

## 2. Color roles

- Page colors continue to come from the selected reading theme.
- HUD surfaces use Obsidian `--background-primary`; text and icons use Obsidian text tokens.
- Borders use a single whisper line from `--background-modifier-border`.
- Accent color is reserved for active progress and focus, never decorative chrome.

## 3. Typography

- Chinese UI uses the platform system stack and weights 400 / 500 / 600.
- The visible book title is limited to 18 Unicode characters plus `…`; the full title remains available to assistive technology and pointer users.
- Page and percentage values use tabular numerals.

## 4. Component styling

- Desktop HUD bars: 48px high, 14px outer radius, 6px inset padding.
- Desktop icon and timer controls: 36px high, 10px inner radius, one whisper border and a subtle tinted fill.
- Touch controls: at least 44px hit area.
- Depth uses layered low-opacity shadows instead of one dark shadow.
- Top and bottom bars share the same surface, border, radius, control height and shadow tokens.

## 5. Layout principles

- The HUD is an overlay and never reserves document height.
- Top: back / shortened title / frequent reader actions.
- Desktop frequent actions: timer, reading note, book search, contents, reading settings.
- Overflow contains reader-only secondary actions: highlights and timer reset. It must not contain generic file or external-link commands.
- Bottom: previous page / clickable page-and-percentage status / next page. Scrolling mode collapses to status only.

## 6. Depth hierarchy

- Level 0: book page.
- Level 1: inner icon controls with tinted fill.
- Level 2: matched HUD bars with whisper border and layered shadow.
- Level 3: menus and reader panels supplied by Obsidian.

## 7. Do and do not

- Do keep frequent reading actions one click away on desktop.
- Do preserve complete accessible labels for truncated titles and icon buttons.
- Do use one geometric system for all HUD controls.
- Do not mix generic file actions into the reader overflow menu.
- Do not add persistent explanatory copy to the reading surface.
- Do not let chrome visibility change pagination geometry.

## 8. Responsive behavior

- Desktop shows the full frequent-action set.
- Mobile keeps back, shortened title, timer and one reader-only overflow menu; note, search, contents, highlights, timer reset and settings remain in that menu to protect the title and 44px targets.
- Bottom bar spans the available phone width while respecting safe-area insets.
- No horizontal overflow at 390px.

## 9. Motion philosophy

- HUD reveal/retract animates only opacity and transform for 220ms with a strong ease-out curve.
- Hover and press feedback lasts 100–150ms and never delays the action.
- Reduced motion keeps a short opacity change and removes large translation.
- Focused controls, open menus, panels and selection tools prevent automatic retraction.

## 10. AI reading composer

- Provider and model are stable settings, not per-message controls. The reading chat header shows only the current book; the settings button owns provider, model and reasoning changes.
- A new chat opened from a text PDF attaches the full extractable document; EPUB and FB2 attach the current page. A text selection replaces that default for the next turn. There is no manual “update to current page” control in the composer.
- When the AI sidebar is already open, selecting text in the reader immediately replaces the pending page source with that selection. Ordinary text selection does not force the sidebar open; the selection wand remains the explicit opener when the sidebar is closed.
- Attached selection/page context shows the actual source text in a fully outlined quote card. It is clamped to three lines; source longer than 120 characters or containing a line break expands on demand and scrolls internally. Full-document context stays compact and non-expandable so a large PDF does not inflate the sidebar DOM.
- Context metadata identifies `PDF 全文`, `PDF 全文（已精简）`, `当前页` or `选文`, page position and character count. A separate remove button changes the next message only.
- Sent messages retain their source quote, clamped to two lines in the user bubble and expandable when long. Never replace the source with a generic `选文` badge.
- Custom quick prompts sit directly above the input, remain available after a selection is attached, and execute with one click. More than three prompts move into a compact overflow menu.
- Typing `/` opens the same custom prompt library. Typing filters by prompt name; arrow keys move, Enter executes and Escape closes the menu.
- The composer uses the primary background, a visible neutral border and an accent focus ring. Disabled, ready and stop states must be visually distinct.
- Keep only the placeholder inside the field. Do not reserve a permanent row for keyboard instructions such as `Enter 发送`.
- Assistant answers keep streaming while the same message is re-rendered as Markdown in throttled increments. Final output must not jump from plain text to formatted text.
- Use Obsidian's renderer and lifecycle for headings, links, nested lists, blockquotes, fenced code, task lists, strikethrough, footnotes, math and diagrams. GFM tables get a message-local horizontal scroll container so the sidebar itself never overflows.
- User messages use only a quiet accent tint; saturated brand colour is reserved for actions and focus. Assistant answers stay in the page flow without a full card border, while tables, code and quotes keep their own local boundaries.
- Task lists reserve a fixed checkbox lane instead of pulling controls into the sidebar edge. Saving an answer makes the Markdown answer the note body and keeps the attached source below it as a reference.

### AI conversation recovery and input

- Saved answer titles come from the answer's topic heading, emphasized phrase or content sentence, never a generic quick question. Suggest locally without a model request, keep the title editable and preserve the full Markdown body. Saved-note actions remember their target and never switch source books midway.
- Drafts are scoped to books during the sidebar lifetime. Deleting the active history resets it without re-saving the deleted conversation. Explicitly detached sources stay detached when history is normalized.
- Use the existing host colors, 12px rounded controls and quiet 1px boundaries; draw on Claude's 1.6 body line-height and restrained secondary controls without importing its branding or fonts.
- Desktop and mobile share input behavior: composition-confirming Enter never sends, Shift+Enter stays a newline on desktop, and input typed during generation is never replaced by a prior failure.
- Stopping or losing a connection retains generated Markdown with an explicit interrupted label, copy/save actions, and its source. Persisted history retains that label.
- Copy and save remain visible for every stored answer without hovering; only the latest answer can be regenerated. A stale action must never target a different turn. Action targets are at least 32px tall on desktop and 44px on coarse-pointer devices.
- Reading earlier messages pauses automatic following, including on the final frame. A keyboard-accessible “Back to latest reply” button appears only away from the bottom; scrolling is confined to the chat log.

## 11. PDF fixed-layout architecture

PDF is a page description format, not a flowing-book format. The reader must
therefore preserve each page as the source of visual truth instead of rebuilding
it from extracted text.

### Rendering stack

Each PDF page uses one stable shell with three layers:

1. **Page image layer** - PDF.js renders the complete page to a lazy JPEG-backed
   canvas snapshot. This preserves charts, tables, vector graphics, typography,
   headers, footers and mixed writing directions.
2. **Text layer** - when PDF.js returns reliable text, its official `TextLayer`
   is positioned over the page image. The text remains visually transparent but
   selectable, searchable and available to highlights and AI context.
3. **Reader action layer** - selection actions and later PDF-specific actions sit
   above both content layers and never alter page geometry. Notes remain a
   single book-level destination in the global reader toolbar.

The page shell is identical for text, mixed and scan documents. Capabilities are
decided per page, because a single PDF can contain both native text pages and
scanned inserts.

### Capability matrix

| Capability | Reliable text layer | Scan / unreadable text |
| --- | --- | --- |
| Original visual page | Yes | Yes |
| Select and copy | Yes | No |
| Persistent highlight and comment | Yes | No |
| Book search | Yes | No |
| Full-document or selected-text AI context | Yes | No |
| Book note, backlink, bookmark and progress | Yes | Yes |

Vision-model questions and OCR are future capability-gated additions. They must
not be presented as available when the active provider accepts text only.

### Pagination and progress

- In page mode, every PDF page forces a column break. One-column mode shows one
  PDF page; two-column mode shows a two-page spread.
- In scrolling mode, pages form a vertical stack and image rendering stays
  viewport-lazy.
- The PDF text layer is one reader anchor per source page. This keeps progress,
  search results, highlights and note backlinks page-stable across screen sizes.
- Scan pages still have page-number progress even though they have no text
  anchor.

### Page zoom

- PDF zoom is separate from flowing-book typography. `100%` means the original
  page is fitted to the current page slot; zoom does not reconstruct or reflow
  the PDF.
- The page image, official text layer and persistent highlight geometry share
  one transform, so selection and annotations stay aligned at every scale.
- Desktop exposes a compact decrease / percentage / increase group. The centre
  value resets to fit-page. Mobile keeps the same commands in the reader menu
  and treats two-finger pinch as the primary path.
- `Cmd/Ctrl +`, `Cmd/Ctrl -` and `Cmd/Ctrl 0` provide keyboard parity. A
  modifier-wheel gesture follows the trackpad continuously.
- Zoom is bounded to 50%–300%. Button steps are 25%; gesture input is continuous.
  A zoomed paged view becomes a contained pan surface, while continuous reading
  keeps one shared horizontal scroller. Resetting to 100% restores ordinary
  side-tap and swipe page turning.

### Performance and failure handling

- Page pixels render only for the current viewport and a small prefetch window.
- Far-away page pixels are released; lightweight page shells and text layers
  remain so search and highlight anchors stay stable.
- Full-page rendering keeps the existing time budget and reduced-resolution
  retry.
- Every non-recoverable rendering error becomes a visible page-local error with
  a console diagnostic. A failure must never degrade into an unexplained blank
  reader.

### Migration and rollout

- The legacy “show pictures on text pages” preference is retired because every
  PDF page now preserves its original appearance.
- Existing EPUB and FB2 extraction, typography and pagination remain unchanged.
- Existing text highlights keep their quote-based fallback. PDF highlights now
  anchor to the stable per-page text layer rather than reflowed paragraphs.
- Acceptance uses one text-heavy PDF, one chart/table report, one image-only
  scan, one Traditional Chinese CMap PDF, desktop page mode, desktop scroll mode
  and a narrow mobile viewport.

## 12. Selection translation and lookup card

- Plugin-owned UI follows the Vercel-style neutral system: reading-theme ink and paper only. The one primary action is ink-filled with paper text and inverts in dark themes. Secondary and completed states are transparent with a 1px shadow-as-border; text actions are muted with a faint underline. Never use the host purple `--interactive-accent` for buttons, links or decoration.
- The card replaces the selection toolbar inside the same popup: 12px radius, layered low-opacity shadow, 16px content inset and a hairline footer divider.
- Header: term (17px/600) with phonetic in small muted monospace, and a ghost target-language chip. Body: in-context meaning first, then senses with a monospace part-of-speech column, a muted note and a tinted example block. Footer: engine name, one-click engine switch, **Add word**, copy, save.
- Verify in light, dark and one tinted reading theme; no accent colour may appear.



## 13. Read-aloud transport (Readwise direction, 2026-10-12)

- Voice-first pill: current voice, previous segment, play/pause, next segment, speed, close. Close is always visible and stops audio while retaining the saved sentence. Reader-theme surface/text/border tokens apply; no page reflow or fake duration.
- Voice opens an anchored popover with inline service/model choice, individual voice selection and independent audition. Selecting a voice and testing a voice are distinct actions; testing never saves that voice as the selection. Search appears for larger catalogs. Credentials and endpoints have a permanent Speech settings entry.
- Desktop first use defaults to Edge with Xiaoxiao, without a key. Preserve explicit existing service choices. A dismissible first-use note explains online transfer to Microsoft and offers Speech settings directly. Acknowledging it, opening the voice picker or entering configuration dismisses it persistently. Mobile fresh installs retain system speech; Edge is desktop-only.
- Voice and speed panels are mutually exclusive, bounded by the reader pane, dismiss on outside click/Escape, and return keyboard focus. Dismissing a panel never stops main reading. All primary touch targets are at least 44px and accessible names use hidden text rather than hover tips.
- Unconfigured services expose a specific issue and Set up and test action. Configuration opens directly on the selected service and focuses its key. Settings and audition return to the paused sentence with the original speed; no automatic body synthesis or playback. Only an actual test result can say it passed.
- Main playback errors expose retry, speech settings and explicit system fallback. Never silently switch providers. No permanent untested/success messages in the pill.
- Playback and viewport have separate positions. Reopening resumes the saved sentence if visible; after navigation, start at the current page and offer saved-position recovery. Browsing suspends follow. At a chapter boundary while browsing, pause until explicit continuation. See `docs/tts-interaction-2026-10-12.md`.
- References: Readwise Reader floating transport and per-voice audition; independently implemented, no third-party UI code copied.
## 14. Text documents as books

Markdown, plain text and static HTML use the existing book reader and library.
Markdown is parsed as GFM HTML by a bundled private Marked instance and rendered
inside the reader. Tables, task lists, strikethrough, autolinks and code fences
retain their semantics. TXT uses escaped HTML paragraphs, preserving in-paragraph
newlines and indentation, with blank lines separating paragraphs.
Only explicitly imported/opened text documents enter the library; ordinary vault
notes remain in Obsidian's native editor. Headings become the contents hierarchy,
TXT chapter labels become section entries, and existing highlights, search,
progress and reading-note actions keep the same interaction contract.

HTML supplies semantic reading content, not application UI: source scripts,
forms, frames and styles are removed. Reader typography and theme remain the
single presentation source. Local images resolve relative to the vault source;
individual imports do not silently gather files from the user's filesystem.
See `docs/text-formats.md` for format boundaries and acceptance evidence.

## 15. Book discovery — selected direction A (2026-10-24)

The user selected “清晰书目” in chat. Dials: variance 4, motion 2, density 6.
Contract: identify the book, compare language/year/format/size, download the
specific result; public sources remain the default and require no activation.
Use a cover / bibliography / file-and-action list, with one quiet divider per
row and a single scroll surface. Covers load progressively in reserved space;
missing/failed images never block search or download. Work covers are labelled
as references, never as proof of the downloadable edition. Do not fabricate
publisher, ISBN, rating or page-count data.

Concrete Notion DNA adapted to existing Obsidian tokens: 1px whisper dividers,
8px spacing rhythm, 400/500/600 UI weights, 1.5 body line-height. Retain host
system fonts and theme colours instead of importing branding or web fonts.
Signatures: aligned file column, stable cover box, format filters above results,
quiet account details, and inline full-title disclosure only for long titles.
At 520px container width, file/action move below the bibliography while the
cover stays beside it. No horizontal scroll or nested result scrollbar.
Keyboard focus is visible; no hover tooltips. Unknown progress stays inline;
failed searches offer retry through the existing form, failed downloads retain
their action, and cover errors remain local. No decorative animation.
