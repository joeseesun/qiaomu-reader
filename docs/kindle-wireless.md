# Kindle wireless delivery

Status: implementation, protocol tests and physical Kindle transfer complete; installed-vault acceptance complete; release acceptance in progress. Research checked 2026-10-24.

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

Check new dependency findings separately from the baseline audit; do not silently update unrelated dependencies. The original Kindle addition increased the bundle by approximately 380 KB and used a 5.75 MB engineering budget. The current standard and community builds share a 4,800,000-byte per-asset budget after lossless translation packing; all Kindle code and language strings remain included. See [the current size and offline checks](bundle-size-qa.md).

## Local acceptance record (2026-10-24)

- 495 Node tests and six existing Python runtime tests passed; no skipped Node tests. Source ESLint passed with zero warnings; all 1,488 locale keys passed. Standard and community builds passed their asset checks.
- Installed 4.8.0 in the existing rockfish vault, preserving plugin caches, books, notes and reading data. Settings changed only for Kindle pairing and the expected last-seen version marker. The previous 4.7.9 assets and data were backed up outside the vault.
- Native Obsidian device discovery authenticated the paired physical receiver. The original local book and a same-name transfer both passed full device read-back verification through running plugin instances. The skill's adapter reused the rockfish controller and respected the custom library folder.
- macOS / Obsidian 1.13.7 / KOReader 2026.07.1 physically tested. Other platforms, models and older receiver versions remain unverified.
- Dependency audit: the new SSH dependencies have no reported advisories in this run. Fifteen unrelated existing findings remain (2 moderate, 13 high); they were not broadened into this feature's dependency scope.
