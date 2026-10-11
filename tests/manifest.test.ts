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

  it('requests only storage and contextMenus, and no host access', () => {
    expect([...manifest.permissions].sort()).toEqual(['contextMenus', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it('blocks all network connections from extension pages', () => {
    const csp: string = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|https?:/);
  });

  it('declares the popup, service worker, DevTools page and shortcut', () => {
    expect(manifest.action.default_popup).toBe('index.html');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.devtools_page).toBe('devtools.html');
    expect(manifest.commands._execute_action.suggested_key.default).toBeTruthy();
  });

  it('has the icons it references', () => {
    for (const path of Object.values(manifest.icons) as string[]) {
      expect(() => readFileSync(new URL(`../public/${path}`, import.meta.url))).not.toThrow();
    }
  });
});
