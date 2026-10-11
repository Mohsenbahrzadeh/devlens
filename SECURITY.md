# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through the repository's "Report a vulnerability" (GitHub Security Advisories) feature rather than a public issue. Include steps to reproduce and the affected version. Do not include real tokens or secrets in reports.

## Security model

- DevLens processes everything locally in the extension popup; it has no backend and its content security policy blocks all network connections (`connect-src 'none'`).
- It requests only the `storage` and `contextMenus` permissions (preferences, optional saved requests, and the right-click menu). No host permissions are requested.
- Tool inputs (JWTs, JSON, headers, bodies) are never persisted or logged.
- JWT signatures are **not** verified. A decoded token is not proof of authenticity.
- User-supplied strings are rendered through React only; `eval`, `new Function` and raw HTML injection are not used.
