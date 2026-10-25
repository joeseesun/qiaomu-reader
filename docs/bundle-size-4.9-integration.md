# 4.9.0 candidate: stable size-budget integration

Fresh remote inspection on 2026-10-25 found stable main/release 4.8.4 at
`2309c35`, while the authenticated 4.9.0 release was still a draft targeting
`bf16816`. No public 4.9.0 tag existed. The draft's main.js was 5,808,973 bytes.
The newer candidate `fee9ceb` (PR #77, based on PR #75) includes the released
About page and first-authorization UX; its main.js was 5,871,392 bytes. Neither
candidate contained PR #80 / `2309c35`.

This integration merges stable main into that newer candidate, preserving its
4.9.0 manifest, dual-mode Kindle, embedded EPUB-to-AZW3 conversion, About page,
download progress and setup UX. Reader, Kindle controller/UI, conversion worker,
native transport and vendored conversion implementations remain byte-identical
to `fee9ceb`. This does not promote PR #75 or #77 to stable main or establish
their deferred hardware acceptance.

## Measured result

| Build | main.js bytes |
| --- | ---: |
| Existing 4.9.0 draft (`bf16816`) | 5,808,973 |
| Existing newer candidate (`fee9ceb`) | 5,871,392 |
| Stable language packing only | 4,825,078 |
| Final standard | 4,783,200 |
| Final community | 4,783,201 |

The first integration correctly failed the existing 4,800,000-byte gate.
Packing the 44 static PDF CMap strings into the same local data archive saves
the remaining bytes; no CMap or supported language is removed. Standard main
is 1,088,192 bytes smaller than `fee9ceb` (18.5%), with 216,800 bytes below strict
decimal 5 MB. Every install asset in both profiles still has the unchanged
4,800,000-byte gate. CSS is 3,725,864 bytes; manifest is 343 bytes.

The original generated CMap source remains intact for development/tests. In the
production build its frozen object is restored with the same keys and base64
values through the already-pinned pure-JS codec. The PDF resource factory is
unchanged and still returns fresh binary buffers, entirely offline. This adds
no asynchronous initialization, remote code, runtime dependency installation,
extra plugin asset, or permission. The standalone receiver source ZIP remains
a separate user-operated setup artifact, as in the original 4.9.0 candidate.

Standard main SHA-256:
`fcf55ffaf53298d59cff83ff331fe6611d9517d8fc0df8964d2cd1bd78b6abee`.
Community main SHA-256:
`c5109462ae3680b5bb803dfffdfbf616ac683f229c18b571145dcc43bf5e83e1`.
CSS SHA-256:
`eb894498f6e21a0402564e153fbf8f3cadecf538a0cfb7d210bb4968af040162`.
Manifest remains the original 4.9.0 bytes:
`e14be45dca8b1822c205fd96f91bf32ea00837281256a000d95c398dedea5f33`.

## Validation and boundaries

- 536 Node tests pass without skips, including existing native transport,
  bounded/cancellable converter and independent Foliate conversion readback.
- Six local-TTS and five Kindle-setup Python tests pass using temporary fixtures.
- All 1,568 English keys, Chinese and seven additional language packs pass i18n;
  source ESLint reports no warnings. Both builds and release verifiers pass.
- Production-packing tests compare every language entry/fallback and all 44
  CMaps. Every CMap fetched from each compiled profile matches the locked PDF.js
  source bytes; subsequent fetches return fresh buffers. Frozen-object semantics
  and Unicode/empty/missing/own-property behavior are retained.
- Full production bundle startup reaches reader-view registration for simulated
  desktop/iOS/Android without a Node loader beyond Obsidian, network or secrets.
- Native offline desktop reading is exercised in a fresh disposable Obsidian
  1.14.5 profile/vault, covering EPUB Chinese/encoded paths and TOC/body, fully
  visible rendered PDF pixels and TXT with saved synthetic font/theme/progress.
  This does not install into the daily vault or change pairing/SecretStorage.
- Production dependency audit has zero findings. Dependencies retain their
  locked candidate versions; Pako was already transitive and is explicitly pinned.

Exact commit CI and any draft asset refresh are recorded separately. Existing
physical Kindle native-library opening, reboot/first-USB acceptance and mobile
hardware limitations are unchanged. No existing public tag is overwritten and
no stable release is repeated by this candidate-only integration.
