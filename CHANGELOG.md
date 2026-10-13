# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-10-13

### Changed

- **DevLens is now docked instead of a popup.** Clicking the toolbar icon (or Ctrl+Shift+L) opens it in Chrome's **side panel**, which stays open while you work on the page. New permission: `sidePanel`.
- **DevTools tab = the whole toolbox.** The "DevLens" DevTools tab (docked at the bottom, or wherever DevTools is docked) now contains JWT, JSON, Diff, HTTP and Tools in addition to the Network inspector. The Network tab keeps its captured requests while you switch tabs.
- The right-click "Inspect with DevLens" entry opens the side panel, and works while it is already open.

### Removed

- The toolbar popup (replaced by the side panel).

## [0.3.0] - 2026-10-12

### Added

- **JSON repair:** one click fixes trailing/missing commas, single or smart quotes, unquoted keys, comments, Markdown fences, Python/JS literals (`True`, `None`, `undefined`, `NaN`) and unclosed brackets.
- **Mask secrets:** HTTP output and DevTools "Copy as" can mask Authorization, cookies, API keys, token query parameters and password-like body fields, so requests are safe to paste into tickets.
- **DevTools "Models" tab:** generate a typed C# client and models, or TypeScript / Zod / Python / Java / Go / YAML / CSV / XML, from the _real_ response of a captured request.
- **Webhook verifier:** GitHub, Stripe, Slack, Shopify and generic HMAC-SHA256 signatures, with replay-window and whitespace warnings.
- **JWKS support:** paste a whole key set and the key is chosen by the token's `kid`.

### Changed

- JSON converters now live in one shared list used by both the JSON tab and the DevTools panel.

## [0.2.0] - 2026-10-02

### Added

- **Right-click menu:** "Inspect with DevLens" opens the right tool for selected text (JWT, JSON, UUID, timestamp, query string, URL-encoded, Base64).
- **DevTools panel:** inspect API calls, decode Bearer tokens, copy requests as cURL / C# / fetch / Python.
- **JWT:** local signature verification (HS/RS/PS/ES with a secret, PEM public key or JWK), security review (alg none, jku/x5u/jwk, missing/long exp …), HMAC test-token creator.
- **JSON:** convert to TypeScript, Zod, C# records, Python (Pydantic), Java records, Go structs, YAML, CSV and XML; XML → JSON; JSONPath.
- **Diff:** array items matched by `id`/`_id`/`key`/`uuid`, ignore rules (`updatedAt`, `items[*].id`, `**.ts`), side-by-side view, Markdown/JSON export.
- **HTTP:** form, multipart and GraphQL bodies (with query formatter); JavaScript (fetch) and Python (requests) generators; C# models + typed client + usage example; import from cURL, raw HTTP or OpenAPI; optional opt-in saved requests (secrets are stripped).
- **Tools:** query-string builder, UUID v4/v7 / ULID / random string generators, SHA and HMAC hashes, regex tester, HTTP status code reference.
- Settings: default HTTP output language, saved-requests switch, keyboard shortcut (Ctrl+Shift+L).
- Author attribution (footer, About panel, LICENSE, package metadata).
- Store tooling: `npm run package` (zip), `npm run store:assets` (screenshots and promo tiles), PRIVACY.md, store listing text, release workflow.

### Changed

- Manifest permissions are now `storage` and `contextMenus` (a test guards this); minimum Chrome 127.
- DOM tests run on happy-dom instead of jsdom.

## [0.1.0] - 2026-10-02

### Added

- Chrome extension (Manifest V3) popup with light/dark/system theme.
- JWT decoder with Bearer extraction, known-claim hints and exp/nbf/iat status.
- JSON viewer: format, minify, tree, search, copy, readable errors.
- Structural JSON diff.
- HTTP request builder with cURL and C# `HttpClient` generators.
- Base64, URL encode/decode, timestamp and UUID tools.
- Unit/component tests, ESLint, Prettier, GitHub Actions CI.
