# Source and third-party notices

Qiaomu Reader contains adapted portions of [Elton Reader](https://github.com/swayinfo/elton-reader), copyright (c) 2026 Elton Labs, originally released under the MIT license. Those portions retain the [original MIT terms](licenses/elton-reader-MIT.txt). Qiaomu additions and the project as a whole are distributed under GPL-3.0-only; this does not replace the original notices or grant exclusive rights over upstream code.

The upstream source examined for this notice is commit `46c2eb7f63e183ab09e9a741fcda3347e6aa1fba`. Changing the repository name, history or rendering engine does not establish independent provenance. Community-directory submission remains subject to Obsidian's fork policy and publicly verifiable authorization; [the authorization request](https://github.com/swayinfo/elton-reader/issues/14) is not itself approval.

Bundled dependencies retain their own licenses; esbuild preserves their legal comments in `main.js`. This list identifies their upstream license sources:

- [Foliate.js](https://github.com/johnfactotum/foliate-js) — MIT, John Factotum.
- [PDF.js](https://github.com/mozilla/pdf.js) — Apache-2.0, Mozilla Foundation.
- [JSZip](https://github.com/Stuk/jszip) — MIT or GPLv3, Stuart Knightley and contributors.
- [localForage](https://github.com/localForage/localForage) — Apache-2.0, Mozilla.
- [ssh2](https://github.com/mscdex/ssh2/tree/v1.17.0) — MIT, Brian White. Its bundled ASN.1, bcrypt-pbkdf and TweetNaCl dependencies retain their license terms in `main.js`; optional native accelerators are excluded.

Bundled font provenance and license are in `fonts/README.md` and `fonts/OFL.txt`.
Starter books retain their Project Gutenberg notices; see `assets/starter-books/README.md`.
