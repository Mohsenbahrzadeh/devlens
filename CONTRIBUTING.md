# Contributing to DevLens

Thanks for helping! Before you start, the guiding question for every feature: **does it help a developer inspect, debug or transform API-related data faster?** If not, it likely does not belong here.

## Setup

```bash
npm install
npm run dev
```

## Before opening a pull request

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs the same commands and fails the PR if any of them fail.

## Guidelines

- Keep business logic in small pure functions (`utils/`, `generators/`, `lib/`) and cover them with tests in `tests/`.
- No backend, accounts, analytics or network requests. User input must never leave the popup or be persisted.
- Never log user input, and never use `eval`, `new Function` or `dangerouslySetInnerHTML`.
- Do not store tool input in `chrome.storage` or `localStorage`; only UI preferences are allowed.
- Show errors in plain language (`Result<T>` + `ErrorMessage`); raw errors go behind "Details".
- Keep the UI accessible: labels, visible focus, and no colour-only status.
- Do not add dependencies without a strong reason.

## Commits

Use meaningful, imperative messages (e.g. `Add UUID v6 inspection`). Follow semantic versioning and update `CHANGELOG.md`.
