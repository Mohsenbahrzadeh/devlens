# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.9.1] - 2026-10-16

### Changed

- **Per-pane Sender guides.** Each Sender sub-tool (Send, Fuzz, Rate limit, Security headers,
  Discover, Collections) now has its own bilingual Guide with a worked example, alongside the
  existing overview guide, instead of one combined guide for the whole tool.

## [0.9.0] - 2026-10-16

### Added

- **Bilingual in-app guides.** Every tool (JWT, JSON, Diff, HTTP, Tools, Sender, and the DevTools
  Network/Journey panel) now has a collapsible "Guide" panel with an English/Persian toggle: what
  the tool does, step-by-step usage, a worked example, and when to reach for it.
- **Bilingual README.** Added a full Persian translation ([README.fa.md](README.fa.md)) with a
  language-switch link at the top of both READMEs; the GitHub repository description is now
  bilingual too.
- **DELETE confirmation guard.** Send, Fuzz, Rate limit and Collections now show an explicit
  warning and require a checkbox acknowledgement before sending a `DELETE` request or batch,
  since it is the one HTTP method that is usually irreversible.

## [0.8.0] - 2026-10-16

### Added

- **Sender → Collections.** Save a named set of requests, each with its own assertions
  (status code, a response header, body contains, a JSON-path value, max response time), and
  run the whole set in one go — a lightweight regression check for your own endpoints. Shows a
  pass/fail summary per request and an overall count.
- **Environments.** Define named sets of `{{varName}}` variables and pick an active one; Collections
  substitutes them into the URL, headers and body of every request it runs. Separate from Fuzz's
  `{{FUZZ}}` marker, which Collections does not touch.
- **Markdown reports.** "Copy report" buttons on Fuzz, Security headers and Collection runs produce
  a ready-to-paste Markdown summary (results table / findings list / per-request pass-fail), next to
  the existing Journey report.
- **`.http` file export** in the HTTP tab's code generators, for opening a request directly in the
  VS Code REST Client or JetBrains HTTP Client.

## [0.7.0] - 2026-10-15

### Added

- **Sender → Fuzz: attack presets.** Built-in, non-destructive probe sets for SQL injection
  (error-based and time-based blind), XSS reflection, path traversal, command injection,
  SSRF/open redirect and NoSQL injection, each with a hint on how to read the results.
- **Vulnerability signal detection.** Every Fuzz response is scanned offline for known indicators
  (database error messages, stack traces, `/etc/passwd` or `win.ini` contents, shell command
  output, unescaped reflected payloads, evaluated template expressions) and flagged in a new
  Flags column; flagged rows are highlighted.
- **Sender → Discover.** Finds same-origin links from a start URL (page links, `sitemap.xml`,
  `robots.txt`), capped by depth and page count, so you can review and choose which ones to send
  to Fuzz — nothing is probed automatically.

### Not added (by design)

- No DDoS / flood capability of any kind, including for your own systems. Use the existing Rate
  limit tool (a small, bounded burst) to find a throttling point instead.

## [0.6.0] - 2026-10-15

### Added

- **Sender tab:** a new tool for testing APIs and systems you own or are explicitly authorized to test. Gated
  behind a one-time, per-session authorization notice.
  - **Send:** build and send a real request, see status, headers, timing and body.
  - **Fuzz:** put `{{FUZZ}}` anywhere in the URL, a header or the body; send one request per value from a
    wordlist or a numeric range, with bounded concurrency. Results are grouped by (status, body length) so the
    common "nothing here" response is greyed out and the interesting rows stand out.
  - **Rate limit:** send a burst of identical requests and see when (if ever) the server starts throttling —
    first 429, `Retry-After`, median/p95 latency.
  - **Security headers:** audits a response the way securityheaders.com does (CSP, HSTS, X-Frame-Options,
    Referrer-Policy, cookie flags, dangerous CORS wildcard + credentials, …), entirely offline from headers you
    already have.

### Changed

- **New permission: `host_permissions: ["<all_urls>"]`.** Every other tool is still fully offline; only the
  Sender tab makes real outbound requests, straight from your browser to the URL you give it. See PRIVACY.md.

## [0.5.0] - 2026-10-15

### Added

- **Journey tab in the DevTools Network inspector:** for any captured request, see the path it took and how it ended.
  - Final status with a plain-language diagnosis (401, 429, 502/504, failed requests with the Chrome error such as `net::ERR_NAME_NOT_RESOLVED`, slow phases).
  - Connection: server IP, HTTP/1.1 / 2 / 3, TLS or not, new or reused connection, served from cache.
  - Timing waterfall: queued, stalled, DNS, TCP, TLS, request, waiting (TTFB), download.
  - Redirect chain and CORS preflight, rebuilt from the captured requests.
  - CDNs, proxies and gateways **inferred from response headers** (Cloudflare, CloudFront, Fastly, Akamai, Vercel, Envoy, Varnish, Via hops, web server, framework), plus cache hit/miss, W3C trace ids, correlation ids and Server-Timing.
  - "Copy report" produces a Markdown summary for tickets (honours the mask-secrets switch).
  - Limits are stated in the UI: no raw packets and no router hops (traceroute is not possible from a browser extension).

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
