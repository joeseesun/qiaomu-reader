# Model access core

Adapted from Qiaomu Agent 0.6.0 (`c33d708be1576222a4b70071ed3e32c730e00322`), MIT; see LICENSE.
Each product has its own application name, stable host identifier and SecretStorage references.
Design keeps TypeScript; Reader uses equivalent JavaScript to fit its native build and lint pipeline.
Changes include host integration and text-only Responses decoding. No runtime dependency on Qiaomu Agent.

Authentication: PKCE S256, exact-state loopback callback, signed OIDC identity validation, cancellation/unload cleanup,
per-account refresh deduplication and rotating credential persistence. ChatGPT requests use fixed official API endpoints,
stream:true and store:false; truncated streams fail. Magpie owns upstream account login; only its public port setting is read.
Source research: https://github.com/joeseesun/qiaomu-agent/blob/main/docs/research/2026-10-11-account-and-gateway-access.md
