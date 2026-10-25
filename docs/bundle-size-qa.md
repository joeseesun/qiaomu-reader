# Bundle size and offline acceptance (2026-10-25)

Baseline: stable main `073c304` / release 4.8.3. Patch candidate: 4.8.4, retaining
the public APIs and three installation assets. It is a size correction,
not a released fix for an unidentified user's reading failure.

## Measured assets

| Asset | Stable 4.8.3 | Packed standard | Packed community |
| --- | ---: | ---: | ---: |
| main.js | 5,715,816 | 4,678,222 | 4,678,223 |
| styles.css | 3,725,128 | 3,725,128 | 3,725,128 |
| manifest.json | 343 | 343 | 343 |

The standard bundle saves 1,037,594 bytes (18.2%). It leaves 321,778 bytes below
decimal 5,000,000. The shared build/release check rejects any installation asset
above 4,800,000 bytes, leaving at least 200,000 bytes below that hard requirement.
Both build profiles and CI use the same gate. Empty assets also fail verification.

Standard main SHA-256:
`bfebab09007377edf4a31191146558d5fa80ab8959e7d58358f74457f3cd2e02`.
Community main SHA-256:
`30b4a0cabc97736021205d365258ebe5227a3ff88da49c1ab7a62b14d12dcfa9`.

## What changed

The editable nine-language dictionaries contain 1,411,660 bytes when expanded
as JSON, including 77 extra legacy Chinese keys. Production builds share their
key table, deflate the static strings with the already-locked JSZip codec Pako
1.0.11, and embed 406,232 bytes of base64 data. The codec is now an explicit,
exactly pinned direct dependency; its installed version does not change.

The browser synchronously inflates and parses local JSON into the same ordinary
dictionaries. Temporary decode buffers are local to a function and can be
collected. No evaluation, asynchronous initialization, Node API, global API
polyfill, extra release file, CDN or remote executable payload is introduced.
Development builds continue using the ordinary source dictionaries.

EPUB/PDF/text reading, bundled books and font, offline CMaps/WASM/worker, Kindle
SSH/SFTP, activation UI, all nine languages and existing license notices remain.
Reader, PDF, Kindle and configuration-migration implementations are unchanged.
The metafile `main.js.json` is generated beside each profile's bundle and ignored
by Git; it supports repeatable attribution of future size growth.

Representative output contributions from that metafile (not a total file-size
accounting, because the worker is attributed to its consuming main module):

| Group | Bytes in output |
| --- | ---: |
| Bundled starter EPUBs | 968,100 |
| Offline PDF CMaps/WASM | 585,671 |
| PDF.js main runtime | 531,123 |
| Packed nine-language payload | 406,246 |
| Kindle SSH dependencies | 336,479 |

## Verification

- All 517 Node tests pass with no skips; local SSH and OAuth tests use disposable
  loopback fixtures, not a paired Kindle or real account.
- Six Python local-TTS tests pass; source ESLint has zero warnings.
- A fresh `npm ci` and production dependency audit pass. The full install still
  reports eight existing development-tool advisories; this patch does not update
  that unrelated toolchain. The production dependency audit reports zero.
- Internationalization check passes all 1,552 English keys and the Chinese and
  seven other packs. New tests compare every decoded key/value, all language
  fallbacks and extra Chinese keys in both profiles without Node globals. Unicode,
  placeholders, empty strings and own-property handling are covered.
- Standard build, community build and both release verifiers pass. CSS and the
  bundled font retain their baseline SHA-256. The explicit budget regression
  rejects 5,000,000 and 5,242,880 bytes, not just files over 5 MiB.
- Native Obsidian 1.14.5 in a new, disposable profile/vault: network disabled;
  baseline 4.8.3, packed standard and packed community each open the original
  EPUB fixture with Chinese/space/percent-encoded ZIP paths, jump through the TOC
  to its body, draw the PDF page to a 1,224 × 1,584 image, and read TXT. The 19 px
  font, warm theme and previously saved reading records survive upgrades. No
  uncaught page errors were recorded. This is desktop evidence.
- Full bundled scripts reach reader-view registration under desktop/iOS/Android
  platform flags, with no Node loader available except the Obsidian module, and
  fail-on-access fake secret/network storage. Native mobile devices, Windows UI,
  physical Kindle pairing/transfers and live AI requests are not claimed tested.

## Original report: boundaries and known observations

The stable 4.7.9 → 4.8.3 source comparison does not change the reading engine,
PDF worker/resources, frame compatibility or open-reader helper. A new release
does cross the 5 MiB region: 4.7.9 main is 5,221,272 bytes and 4.8.0 is 5,650,405.
Obsidian Sync Standard officially allows a maximum 5 MB file; 4.8.1 release notes
warn that its main cannot sync. That is a concrete distribution risk, not proof
of the unidentified device's root cause.

The disposable native-vault controls showed:

- Missing main.js with a 4.8.3 manifest makes plugin enable return false.
- Old 4.7.9 main.js with new 4.8.3 manifest/CSS can still render all three fixture
  types; a version mismatch alone does not reproduce universal reading failure.
- After a plugin hot reload, the first request to change books can remain on the
  previous book. This reproduces with 4.7.9 reloading itself as well as 4.8.3 and
  the packed builds. Closing the reading tab and reopening restores reading.
  Attribution to a specific host/reader change needs further investigation.
- Markdown vault image embeds `![[image.png]]` remain literal in 4.7.9, 4.8.0 and
  4.8.3: four vault embeds plus one standard image produce only one image. That
  predates this upgrade. Draft PR #73 is separate and has not been released.

The original affected device, installed asset hashes, format, sample and error
are still unknown. This optimization does not establish that its reading
failure is resolved; no daily vault, installed plugin, pairing or SecretStorage
was modified for these tests.
