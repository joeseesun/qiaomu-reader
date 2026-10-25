# 4.8.2 — About and author support

Replaces the old settings rows with the Qiaomu Audio About layout: product mark, installed version, changelog, guide and issue reporting first; public-account and support codes below; public author links last. The two author-provided codes are embedded rather than fetched at runtime. Existing guide and changelog modals remain the action destinations. New copy covers all nine existing UI languages.

## Validation — 2026-10-24

- 513 existing Node tests pass; six Python TTS runtime tests pass.
- `check:i18n`, production build, release verification and ESLint pass.
- Actual desktop host: Obsidian 1.13.7, isolated `qiaomu-reader-kindle-qa` vault, 4.8.2 build. Existing QA files and settings were backed up before installation; source books were not replaced.
- Light/dark About, English, and narrow 341px content width rendered in the real settings window. Two bundled images decoded, six icons rendered, zero tooltips in About, no horizontal overflow. Narrow layout uses one code per row and 44px action targets.
- Changelog and guide buttons opened their existing real modals; keyboard focus returned an actual focused button. Image origin and public destination links inspected. WeChat scan/payment and mobile hardware were not exercised.
- Screenshots and measured geometry were captured during the task. They are QA evidence, not marketing assets.

## Distribution boundary

Candidate based on the released 4.8.1 branch. The separate 4.9.0 Kindle candidate is not promoted by this patch. Official pre-scan, draft asset installation, anonymous asset readback, merge and formal review must be recorded independently in the release evidence before reporting official publication.
