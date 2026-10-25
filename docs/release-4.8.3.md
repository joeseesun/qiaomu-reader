# 4.8.3 — Explain one-time Kindle authorization

The connection dialog now explains the purpose and duration before asking for a cable: USB is used once to authorize the computer, while later book delivery uses Wi-Fi. The initial action is “Authorize this computer”; the authorized state explicitly says no USB is needed and shows Wi-Fi delivery. Existing pairing, key storage and transport behavior are unchanged. The same copy covers all nine interface languages.

Includes the 4.8.2 About redesign and author support codes. Removes the optional footer underline-color declaration flagged by the 4.8.2 CSS compatibility scan.

## Validation — 2026-10-24

- 513 existing tests, i18n, ESLint and production build pass.
- Obsidian 1.13.7 in the isolated Kindle QA vault: both unpaired and paired UI state fixtures rendered with the intended explanation, correct USB/Wi-Fi visibility and no horizontal overflow. The fixtures do not write keys or pairing settings, or initiate USB/SSH operations.
- Existing daily-vault pairing was independently checked before this change: paired KOReader configuration retained after installing the About update.
- New USB authorization and physical-device interaction are not repeated for this copy-only patch.

Publication, scan results and native installer verification are recorded separately during release.
