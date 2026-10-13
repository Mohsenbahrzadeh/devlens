# Privacy Policy

**DevLens** is a developer tool made by Mohsen Bahrzadeh (<Mohsen.Bahrzadeh@Gmail.com>).
_Last updated: 2026-10-13 · applies to version 0.4.0 and later._

## Summary

DevLens does not collect, transmit, sell or share any data. Everything you paste or type is processed
locally, inside your browser, and is discarded when you close the side panel or DevTools window.

## What DevLens processes

JWTs, JSON, HTTP requests, headers, bodies, encoded strings, secrets you type into the signing/verification or
hash tools, and the text you select when you use the right-click menu. All of it is processed on your device
only. DevLens has no server, no account system, no analytics, no advertising and no tracking.

## Network access

The extension's content security policy sets `connect-src 'none'`, so its pages cannot make network requests.
DevLens works fully offline. It does not download or run remote code.

## What is stored on your device

Stored with `chrome.storage.local`:

- your theme choice, the last selected tab, your default HTTP output language;
- **only if you turn on "Enable saved requests" (off by default):** requests you explicitly save. Before saving,
  DevLens removes the values of secret headers (Authorization, Cookie, API keys, tokens, …) and secret query
  parameters. Request bodies are stored only if you tick "Include the body". You can delete saved requests at any
  time in Settings.

Tool inputs (tokens, JSON, headers, bodies, keys and secrets) are **never** stored. They exist in memory only
until the side panel or DevTools window is closed or reloaded.

Text selected through the right-click menu ("Inspect … with DevLens") is placed in the browser's in-memory
`chrome.storage.session` so the side panel can read it, and is deleted as soon as the side panel has read it. It is never
written to disk.

## DevTools panel

The optional "DevLens" DevTools panel reads the network requests of the tab you are inspecting through Chrome's
DevTools API so that you can view and copy them. That data stays inside the DevTools window and is not stored or
sent anywhere.

## Permissions

| Permission     | Why                                                                              |
| -------------- | -------------------------------------------------------------------------------- |
| `storage`      | Save preferences, the optional saved requests, and pass right-click selections.  |
| `contextMenus` | Add the "Inspect with DevLens" item to the right-click menu for selected text.   |
| `sidePanel`    | Show DevLens in Chrome's side panel, docked next to the page you are working on. |

DevLens requests no host permissions and injects no scripts into web pages.

## Children

DevLens is a developer tool and is not directed at children.

## Changes

If this policy changes, the new version will be published with the extension and dated above.

## Contact

Mohsen Bahrzadeh — <Mohsen.Bahrzadeh@Gmail.com>
