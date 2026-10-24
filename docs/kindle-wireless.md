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
- EPUB is converted locally to AZW3 through an existing Calibre executable (argument array, no shell, bounded timeout/output, cancellation and temporary-directory cleanup). Native PDF/TXT/MOBI/AZW/AZW3 go directly; other formats require KOReader. No DRM removal, cloud relay, native-reading progress sync, wake-from-sleep or general format conversion is promised.
- Both routes stream to a hidden temporary file, fully read back SHA256 and publish using a non-overwriting rename. Indexing is a separate receipt: a stopped scanner queues a durable request for its next start; delivery is not retried just because indexing is unconfirmed.

The plugin never installs dependencies. The separate [receiver preparation tool](../kindle-receiver/README.md) downloads two pinned upstream USBNetLite distributions from their original author, verifies SHA256, parses only the supported SP01/FD04 container and extracts two ELF executables. It never runs upstream installer scripts, enables USB networking or changes OTA/sleep settings. The downloadable tool contains original setup code and the project license, without third-party binaries or copied USBNetLite installer glue. Partial preparation rolls back its own scriptlets. An uninstall script removes only the receiver's own jobs/firewall hooks and keeps books and keys.

Sources checked: [Obsidian dependency policy](https://docs.obsidian.md/community-directory/developer-policies), [Calibre ebook-convert](https://manual.calibre-ebook.com/generated/en/ebook-convert.html), [USBNetLite 1.0.M originals](https://github.com/notmarek/kindle-usbnetlite/releases/tag/1.0.M), [KindleTool container format](https://github.com/NiLuJe/KindleTool/tree/95291295e039a1a3bc0bc9d6040b07f640dae74a), [Kindle scanner properties](https://kindlemodding.org/kindle-apps-and-services/com.lab126.scanner/index.html). Upstream binary options were tested on the device: this trimmed build has no dropbearkey applet or -E flag; use its supported -R host-key generation and preserve existing keys.

### Evidence

- 522 Node tests (23 Kindle-specific), five Python setup/scan tests and six existing Python runtime tests pass; no Node skips. Source ESLint passes with zero warnings, and 1,545 i18n keys pass. Standard/community builds pass release verification. No dependency was added or upgraded for dual mode.
- USB fixtures prove native pairing without a KOReader directory, preservation of unrelated keys, rejection of external symlinks, pinned-package parsing, rollback on partial preparation and queued-scan persistence. They are not a new physical USB installation.
- Running macOS Obsidian 1.13.7 / rockfish candidate, physical armv7 Kindle firmware 5.18.1.1.1: native capability check succeeds; Calibre converts the vault's public-domain 道德经.epub and the controller sends 道德经.azw3 (101,421 bytes). Full device readback matches SHA256 `8d71ec2c281593dbbfbe45955c31068f13405164129cb7710d1e3ffe7493fac3`. Original EPUB preserved and conversion temporary output removed. The original KOReader connection remains available.
- The standalone receiver was bootstrapped through the already trusted KOReader SSH connection because USB was unavailable. Receiver process restart and its dedicated firewall hooks were exercised. The final scan handler returns scan-pending while scanner is stop/waiting and leaves its pending flag; its new scanner-start job is present. This does not prove the scanner-start event after leaving KOReader, or service recovery across device reboot.
- Existing-vault upgrade copies only plugin assets and verifies byte identity and running manifest version while preserving data.json/caches. Modal mode selection and keyboard focus were inspected in the real host; Chinese/light and English/dark native mode were visually checked, including keyboard navigation. At 440 × 620 the modal was 352 px wide and the body client/scroll widths both 302 px (no horizontal overflow). QA language/theme/window size were restored, and rockfish stayed on its existing KOReader default. Final installed standard assets: main.js `96c07ba786b7cd42f71d464e5b366af24e60f7e7986d2018bc71f5621ece64ec`, styles.css `ccd72a2b0e3ee3ff03426a59b4fc62e38e217c8ac93ff6e7cc77d0c732cfdc2b`, manifest.json `e14be45dca8b1822c205fd96f91bf32ea00837281256a000d95c398dedea5f33`. Both final running-mode connection checks passed and the AZW3 device readback still matched. Install/Remove scriptlets were also read back on the device.

### Remaining acceptance and release

The user deferred USB/device interaction. When convenient: exit KOReader, confirm 道德经 appears in the native library and opens with correct Chinese content, reboot Kindle and confirm reconnection without starting KOReader, then exercise sleep/wake. Verify a first-time receiver preparation + USB pairing path on a device without KOReader before widening compatibility claims. Windows/Linux conversion and host detection are fixture-verified, not physically verified.

Do not promote this candidate to a fully accepted native release until those checks and the official final-SHA preview scan pass. Keep main at its last installable release until matching public assets are available. Build, device receipt, native reading, GitHub draft and official publication remain separate states.
