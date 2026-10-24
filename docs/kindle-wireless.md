# Kindle wireless delivery

Status: 4.8.0 KOReader delivery is released. The 4.9.0 dual-mode candidate is developed and locally tested; native-library visibility, opening the book, device reboot and official release gates remain pending. Updated 2026-10-24.

Physical evidence: the running Obsidian 1.13.7 QA plugin paired over USB, connected to KOReader using key authentication and transferred `道德经.epub` (71,399 bytes). Full remote read-back matched SHA256 `7fab2b6ccb810af13f9009dffa57d8407aa1f996aa072a42d8a8743922250b1e`. No private key is stored in repository files.

## Decision

Go: extend the existing desktop library with **Send to Kindle**, a pairing command and a small connection dialog. Use the existing KOReader installation as receiver. No Calibre, account, cloud relay or separate helper is required. This version transfers book files; it does not synchronize highlights or reading positions. Existing Home/context integrations remain unchanged.

References inspected:

- [KOReader SSH documentation](https://github.com/koreader/koreader/wiki/SSH) and the SSH plugin bundled with v2026.07.1: patched Dropbear, port 2222, `settings/SSH/authorized_keys`, `SSH_key_only_auth`, `SSH_autostart`. Use the supported receiver; do not copy its Lua implementation or modify unrelated reading settings.
- [KOReader Calibre client](https://github.com/koreader/koreader/wiki/calibre): established device connection and progress feedback. Do not reimplement its full protocol or introduce another library database.
- [KOReader OPDS](https://github.com/koreader/koreader/wiki/OPDS-support): a pull-based shared shelf; not selected because the requested action starts in Obsidian.
- [ssh2 1.17.0](https://github.com/mscdex/ssh2/tree/v1.17.0), MIT, pinned by package-lock.json: use public key generation, host verification and SFTP APIs. Exclude optional native acceleration; preserve ssh2, asn1, bcrypt-pbkdf and tweetnacl licenses in the bundle.
- [Obsidian SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage), also checked in the installed SDK, supported by the existing 1.11.4 minimum: store the private key there, and only its reference in data.json. This is vault-local Obsidian storage, not an OS keychain or isolated plugin sandbox.

## Flow

`library/file menu → controller → lazy desktop SFTP client → KOReader documents`

1. Exit KOReader and connect Kindle by USB. Pairing checks Kindle/KOReader markers and path containment, preserves other authorized keys, backs up reader settings and changes only SSH options. It enables key-only authentication, disables passwordless login and starts the receiver with KOReader.
2. Safely eject Kindle, open KOReader and enable Wi-Fi. Enter its local IPv4 address, shown by KOReader. Authenticate with the paired key and pin the server SHA256 fingerprint. A changed identity requires explicit USB pairing again.
3. Right-click a book and send. Capture the selected vault file, reject source symlinks outside the vault, stream to a unique hidden temporary file, then read it back and compare SHA256. Publish with a non-overwriting rename after verification. Same-name books receive numeric suffixes.

Explicit local-LAN IPv4 connections only; desktop-only. Mobile never initializes the Node/SSH module. The user can explicitly click Find Kindle to probe the receiver port on attached private subnets (at most /24 per interface, 512 hosts total, 24 sockets, 20 seconds). A result must authenticate using this vault's paired key and match any pinned device identity. No background scans, uploads or cloud endpoints. Manual addresses remain available. KOReader and Wi-Fi must remain on. Files over 512 MiB are rejected rather than buffered.

Cancellation, unloading, timeout and disconnection never expose a partial final book. Abrupt disconnection can leave an unindexed `.qiaomu-*.part` file. It is not reported as a book or success; cleanup never deletes unrelated files.

No plaintext private-key fallback. Another computer without the vault-local secret must pair again. Settings-save failures retain prior configuration and do not announce success.

## Acceptance

- Actual loopback SSH/SFTP with key authentication: Chinese names, same-name preservation, complete read-back, wrong keys, changed host identity, corrupted bytes, cancellation and disconnection.
- USB fixture: idempotence, preserved fonts/nested settings and other authorized keys, rejection of linked external paths.
- Native Obsidian: menus and commands, upgrade persistence, keyboard/focus, short/narrow/English/dark/light modal states, errors and unload cleanup.
- Physical Kindle: product-driven pairing, EPUB transfer through the running plugin and file read-back. Only platforms actually exercised are claimed as verified.

Check new dependency findings separately from the baseline audit; do not silently update unrelated dependencies. The measured bundle increase is approximately 380 KB, so the explicit local asset budget changes from 5.25 MB to 5.75 MB. This is not an Obsidian policy limit.

## Local acceptance record (2026-10-24)

- 495 Node tests and six existing Python runtime tests passed; no skipped Node tests. Source ESLint passed with zero warnings; all 1,488 locale keys passed. Standard and community builds passed their asset checks.
- Installed 4.8.0 in the existing rockfish vault, preserving plugin caches, books, notes and reading data. Settings changed only for Kindle pairing and the expected last-seen version marker. The previous 4.7.9 assets and data were backed up outside the vault.
- Native Obsidian device discovery authenticated the paired physical receiver. The original local book and a same-name transfer both passed full device read-back verification through running plugin instances. The skill's adapter reused the rockfish controller and respected the custom library folder.
- macOS / Obsidian 1.13.7 / KOReader 2026.07.1 physically tested. Other platforms, models and older receiver versions remain unverified.
- Dependency audit: the new SSH dependencies have no reported advisories in this run. Fifteen unrelated existing findings remain (2 moderate, 13 high); they were not broadened into this feature's dependency scope.


## Dual-mode candidate 4.9.0 (2026-10-24)

### Scope and architecture

Keep one Send to Kindle action and select the reader in the existing connection dialog. Legacy settings default to KOReader. Each mode preserves its own address, port, pairing and pinned identity; generating a replacement client key invalidates both profiles. Mode changes are blocked during transfer. This is desktop-only; the mobile reader does not initialize the transport.

- KOReader: retain the existing receiver on port 2222 and original file formats. No conversion dependency is added to this mode.
- Native: an explicitly prepared, user-installed receiver on port 2223, with a separate Upstart job and Wi-Fi firewall chains. Password authentication and forwarding are disabled. The forced-command dispatcher allows only SFTP, protocol capabilities and a library-scan request. Its key grants filesystem-level SFTP access and must stay on the owner's computers.
- EPUB is converted locally by a bundled KF8 writer in a disposable desktop worker. No Calibre, executable discovery, subprocess, runtime package installation or remote conversion service is required. Worker time/memory and ZIP expansion are bounded; cancellation terminates the worker and temporary output is cleaned up. Native PDF/TXT/MOBI/AZW/AZW3 go directly; other formats require KOReader. No DRM removal, cloud relay, native-reading progress sync, wake-from-sleep or general format conversion is promised.
- Both routes stream to a hidden temporary file, fully read back SHA256 and publish using a non-overwriting rename. Indexing is a separate receipt: a stopped scanner queues a durable request for its next start; delivery is not retried just because indexing is unconfirmed.

The plugin never installs dependencies. The separate [receiver preparation tool](../kindle-receiver/README.md) downloads two pinned upstream USBNetLite distributions from their original author, verifies SHA256, parses only the supported SP01/FD04 container and extracts two ELF executables. It never runs upstream installer scripts, enables USB networking or changes OTA/sleep settings. The downloadable tool contains original setup code and the project license, without third-party binaries or copied USBNetLite installer glue. Partial preparation rolls back its own scriptlets. An uninstall script removes only the receiver's own jobs/firewall hooks and keeps books and keys.

Sources checked: [Obsidian dependency policy](https://docs.obsidian.md/community-directory/developer-policies), [Calibre ebook-convert](https://manual.calibre-ebook.com/generated/en/ebook-convert.html), [USBNetLite 1.0.M originals](https://github.com/notmarek/kindle-usbnetlite/releases/tag/1.0.M), [KindleTool container format](https://github.com/NiLuJe/KindleTool/tree/95291295e039a1a3bc0bc9d6040b07f640dae74a), [Kindle scanner properties](https://kindlemodding.org/kindle-apps-and-services/com.lab126.scanner/index.html). Upstream binary options were tested on the device: this trimmed build has no dropbearkey applet or -E flag; use its supported -R host-key generation and preserve existing keys.

### Evidence

- 522 Node tests (23 Kindle-specific), five Python setup/scan tests and six existing Python runtime tests pass; no Node skips. Source ESLint passes with zero warnings, and 1,545 i18n keys pass. Standard/community builds pass release verification. The initial dual-mode build added no dependency. The revised built-in converter adds pinned MIT-licensed XML and CSS parsers as recorded below.
- USB fixtures prove native pairing without a KOReader directory, preservation of unrelated keys, rejection of external symlinks, pinned-package parsing, rollback on partial preparation and queued-scan persistence. They are not a new physical USB installation.
- Running macOS Obsidian 1.13.7 / rockfish candidate, physical armv7 Kindle firmware 5.18.1.1.1: native capability check succeeds; Calibre converts the vault's public-domain 道德经.epub and the controller sends 道德经.azw3 (101,421 bytes). Full device readback matches SHA256 `8d71ec2c281593dbbfbe45955c31068f13405164129cb7710d1e3ffe7493fac3`. Original EPUB preserved and conversion temporary output removed. The original KOReader connection remains available.
- The standalone receiver was bootstrapped through the already trusted KOReader SSH connection because USB was unavailable. Receiver process restart and its dedicated firewall hooks were exercised. The final scan handler returns scan-pending while scanner is stop/waiting and leaves its pending flag; its new scanner-start job is present. This does not prove the scanner-start event after leaving KOReader, or service recovery across device reboot.
- Existing-vault upgrade copies only plugin assets and verifies byte identity and running manifest version while preserving data.json/caches. Modal mode selection and keyboard focus were inspected in the real host; Chinese/light and English/dark native mode were visually checked, including keyboard navigation. At 440 × 620 the modal was 352 px wide and the body client/scroll widths both 302 px (no horizontal overflow). QA language/theme/window size were restored, and rockfish stayed on its existing KOReader default. Initial pre-builtin-converter installed standard assets (superseded candidate): main.js `96c07ba786b7cd42f71d464e5b366af24e60f7e7986d2018bc71f5621ece64ec`, styles.css `ccd72a2b0e3ee3ff03426a59b4fc62e38e217c8ac93ff6e7cc77d0c732cfdc2b`, manifest.json `e14be45dca8b1822c205fd96f91bf32ea00837281256a000d95c398dedea5f33`. Both final running-mode connection checks passed and the AZW3 device readback still matched. Install/Remove scriptlets were also read back on the device.

### Remaining acceptance and release

The user deferred USB/device interaction. When convenient: exit KOReader, confirm 道德经 appears in the native library and opens with correct Chinese content, reboot Kindle and confirm reconnection without starting KOReader, then exercise sleep/wake. Verify a first-time receiver preparation + USB pairing path on a device without KOReader before widening compatibility claims. Windows/Linux conversion and host detection are fixture-verified, not physically verified.

Do not promote this candidate to a fully accepted native release until those checks and the official final-SHA preview scan pass. Keep main at its last installable release until matching public assets are available. Build, device receipt, native reading, GitHub draft and official publication remain separate states.


## Built-in conversion correction (2026-10-24)

Product requirement: users must not install Calibre to send an EPUB. The previous executable-based prototype is superseded. Both native and KOReader delivery now require no host conversion application. The separate Calibre-library import feature remains optional and unchanged.

Reference and reuse: Higino-Neto/Lyceum commit `806be2fd3677c77cd2bff5f61793ef4564ad2cca`, MIT. Reuse its KF8/PalmDOC/index writer and CSS sanitizer; keep full attribution in licenses/lyceum-MIT.txt and the built main.js. Replace JSDOM with detached portable XML traversal, remove unused embedded-source exporting and all executable detection. The original generic toolkit UI, filesystem exporter and accounts are not included. Add pinned `@xmldom/xmldom@0.9.12` and `postcss@8.5.31` for correct XML/CSS parsing; their and their bundled transitive dependencies' licenses are preserved. No new native code is required.

Corrections caught by independent reading: original EXTH 503/524 used integer records where title/language strings are required; same-chapter TOC anchors all defaulted to chapter start; synthesized chapter headings dropped the original first heading's ID. These were corrected in the vendored adaptation. Chinese locale codes are explicit. Full UTF-8 chapter text, source headings/IDs, cover image, nested TOC and footnote destinations have regression fixtures. Foliate independently reads metadata, all section content, images and TOC. A development-only Calibre readback converts the generated fixture AZW3 back to EPUB and confirms Chinese title/author plus distinct correct TOC destinations. Calibre is an independent test tool on the maintainer's computer, never a runtime dependency. Foliate's current character-based interpretation of KF8 offsets does not establish Chinese byte-offset anchors; the independent Calibre roundtrip confirms those destinations instead.

The worker is bundled during production builds and compressed into main.js. It has no book filesystem path, keys, network requests or UI document access. Main-thread launch is desktop-only. The converter runs as a browser Web Worker with no Node APIs, filesystem paths or credentials. ZIP/text input bounds limit allocation; a 120-second deadline and cancellation/unload terminate the worker and revoke its Blob URL. Actual Obsidian rejects Node worker_threads, so that prototype was replaced before delivery. Node protocol tests use an adapter only to exercise the same browser bundle. This adds approximately 160 KB to main.js; the measured local engineering asset budget moves to 6,000,000 bytes. This is not an Obsidian policy limit.

Native conversion limits: 64 MiB input, 128 MiB expanded ZIP, 16 MiB per entry, 10,000 entries, 5,000 chapters and 32 MiB textual input. Direct transfers still support 512 MiB. ZIP declarations and actual streaming expansion/CRC32 are checked. Reject traversal, ambiguous paths, unsafe XML entities, malformed input and DRM. Standard font obfuscation is allowed but fonts are not embedded. Static XHTML, JPEG/PNG/GIF, CSS and EPUB2 NCX/EPUB3 navigation are supported. A single SVG image wrapper can become an ordinary image; standalone vector content, MathML, audio/video and pre-paginated layouts are rejected with a localized KOReader recovery action. No silent truncation or PDF downgrade, cloud upload, or converter installation fallback.

The revised candidate must be rebuilt, tested, installed and scanned under its new final commit before promotion; the old preview SHA and draft assets do not validate these changes. Physical native library opening and device reboot remain deferred by the user.


Final built-in-converter verification:

- 530 Node tests (31 Kindle tests), five Python setup tests and six Python runtime tests pass. All 1,546 i18n keys and source ESLint pass. Standard/community builds and asset verification pass. New converter/parser dependency audit reports no findings for xmldom, postcss, nanoid, picocolors or source-map-js; 14 existing findings (2 moderate, 12 high) remain outside this change.
- Running rockfish 4.9.0: native send phases convert → send → verify → index; receipt identifies conversionEngine=embedded-azw3. Actual device file `/mnt/us/documents/道德经 (2).azw3`, 73,279 bytes, SHA256 `410a8a2a84364a326805d569cf01f196be4e3ffe0bd8b2341c7bbb51bbc6bcf9`. Complete readback succeeds. Transfer took 4.6 seconds and the UI timer kept ticking; the receiver correctly returns scanPending while the scanner is stopped. KOReader default was restored. This is the new built-in engine, not the previous Calibre output.
- Final candidate installed in rockfish and QA with byte-equal assets and preserved data.json/caches: main.js SHA256 `ac2fb806f73cfc94f9a83f688e39f53402cded8e1c7b3ea7af606b27f30f442d`, 5,805,997 bytes. Actual modal shows local automatic conversion without asking for converter installation; buttons/borders/text were visually checked, then QA mode restored. The worker + licenses add about 135 KB over the first dual-mode prototype.
- Still pending: native Kindle library visibility/opening, scanner-start event, full device reboot and first-time physical USB setup. These were deferred by the user. A successful converted-file receipt does not close those gates. The public release remains a draft, with a new final-SHA preview required.


Integration follow-up: merged main commit 930d37d (download progress/import stages, 4.8.1) into the 4.9.0 candidate, preserving that feature, its styles, locales and tests. Rebuilt both profiles and reran the complete suite. Final integration asset identities supersede the standalone converter build above: main.js 5,808,973 bytes SHA256 `f5dc32d53defb8c68bcb2950f44d726eaa1fe6509d169bf47a00a01f50d626cc`; styles.css 3,721,226 bytes SHA256 `b5666714572747f6ceda4325545da98fade8984e43dcba4963938f904b53411f`. No native conversion source changed during the merge. Both installed vaults were updated again preserving data. The integrated suite has 532 passing Node tests and 1,548 i18n keys.
