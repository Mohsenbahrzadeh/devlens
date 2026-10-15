import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const manifest = read('public/manifest.json');
const pkg = read('package.json');

/** Guards the privacy promises made in README.md, PRIVACY.md and the store listing. */
describe('manifest', () => {
  it('uses Manifest V3 and matches the package version', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
  });

  it('requests only storage, contextMenus and sidePanel, plus all-origin host access for Sender', () => {
    expect([...manifest.permissions].sort()).toEqual(['contextMenus', 'sidePanel', 'storage']);
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it('restricts extension pages to self-hosted script and allows only http(s) connections', () => {
    const csp: string = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'self'");
    expect(csp).toMatch(/connect-src https: http:/);
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline/);
  });

  it('declares the side panel (no popup), service worker, DevTools page and shortcut', () => {
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.devtools_page).toBe('devtools.html');
    expect(manifest.commands['open-side-panel'].suggested_key.default).toBeTruthy();
  });

  it('has the icons it references', () => {
    for (const path of Object.values(manifest.icons) as string[]) {
      expect(() => readFileSync(new URL(`../public/${path}`, import.meta.url))).not.toThrow();
    }
  });
});
