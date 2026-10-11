# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

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
