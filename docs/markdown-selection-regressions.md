# Markdown images and selection-menu regressions

Scope: issues #67, #59 and #57, based on main `1ff4631` (4.7.9).
PR #51 is closed without a merge; its changes are not the baseline for this fix.
This patch does not change the plugin version or add OCR.

## Reproduced causes

- Marked treated `![[image.png]]` as text. A fixture with four vault embeds and
  one standard Markdown image produced only one image before the fix.
- Every right-click could create another Obsidian Menu. A source-method
  reproduction with a Menu test double left three visible instances; the same
  sequence now retains one and invalidates callbacks from the replaced menus.
- Android's long-press `contextmenu` path immediately opened the host sheet and
  reset the drag flag. Pointer cancellation can also precede `touchend` while a
  native selection handle is still held. Both the PDF flow and book iframes now
  wait for the complete gesture and a stable range before showing compact tools.
- Foliate skipped panning during a selection but still called `snap()` at touch
  release. The regression test exercises its original and adapted method: a
  selection no longer triggers that snap, while an ordinary page swipe still does.

## Automated coverage

- Vault image paths, basename lookup relative to the source note, Unicode and
  spaces, alt text, numeric width/height, missing resources, code/escaped syntax,
  non-image embeds and sanitization. Existing GFM/TXT/HTML and stable-DOM tests
  remain in place.
- PDF host and EPUB/Markdown iframe event sequences: long press, repeated handle
  adjustment, pointer cancellation before touch release, touch cancellation,
  repeated selection, unchanged-range dismissal, outside click, Escape, scrolling,
  book switching, and disposal with pending timers.
- One menu at a time, iframe dismissal of the host menu, obsolete menu actions,
  copying a CFI link, highlight recoloring/undo, comment drafts and IME handling.
- Mobile toolbar geometry avoids the selected line and its handles when there
  is room; the existing narrow-viewport clamping test remains.

These are Node/JSDOM and source-method tests, not Android or Windows devices and
not a full Obsidian UI run. On 2026-10-22 the native UI tool reported that the Mac
was locked and automatic unlock failed. UI verification awaits manual unlock;
no candidate was installed into the user's daily vault or another task's vault.

Local verification on 2026-10-22 passed: 505 Node tests, 6 Python TTS runtime
tests, ESLint with zero warnings, all 1,450 translation keys, standard and
community builds, and both release-asset checks. The repository is JavaScript
and has no standalone type-check command or TypeScript configuration.

## Remaining platform acceptance

Use a separate QA vault containing an EPUB, a PDF with a text layer, and a
Markdown note with existing highlights and `![[...]]` image embeds.

1. Android Obsidian: long-press in EPUB and PDF; hold and repeatedly drag both
   handles, including near page edges. Tools must remain hidden while touching.
   On release, verify the range, toolbar placement, highlight and note contents.
   Cross-page/native-handle behavior still needs a real-device check.
2. Open More, swipe the host sheet closed, scroll, cancel a selection, and select
   again. The dismissed menu must not immediately reopen for an unchanged range.
3. Windows 10 Obsidian: repeatedly select and right-click in both book iframes
   and PDF pages. Verify only one menu, outside click (including inside the book
   iframe), Escape, scrolling, navigation and closing/reopening the reader.
4. EPUB/PDF/Markdown: create and edit a highlight and note, change color, undo,
   jump back from a note, navigate away, and reopen at the saved position. Check
   existing annotations, especially text adjacent to newly rendered image embeds.

## Issue #28 boundary

4.7.9 already contains the local `Object.groupBy`/`Map.groupBy` compatibility
adaptation and encoded EPUB-path regressions. Those tests run with this patch;
no second compatibility implementation is added. Earlier iOS 27 WKWebView
simulator evidence is engine-level evidence only. iOS 17.0 on a physical device,
with the reporter's book and Obsidian vault, remains unverified.
