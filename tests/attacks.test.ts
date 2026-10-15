import { describe, expect, it } from 'vitest';
import { detectSignals, PAYLOAD_SETS } from '@/features/sender/utils/payloads';
import {
  discoverUrls,
  extractRobotsPaths,
  extractSameOriginLinks,
  extractSitemapLinks,
  MAX_DISCOVERED,
} from '@/features/sender/utils/discover';

describe('PAYLOAD_SETS', () => {
  it('covers the standard probe categories with non-empty value lists', () => {
    const ids = PAYLOAD_SETS.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sqli',
        'sqli-time',
        'xss',
        'path-traversal',
        'cmd-injection',
        'ssrf',
        'nosqli',
      ]),
    );
    for (const set of PAYLOAD_SETS) {
      expect(set.values.length).toBeGreaterThan(0);
      expect(set.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('detectSignals', () => {
  const h = (pairs: [string, string][] = []) => pairs.map(([name, value]) => ({ name, value }));

  it('flags common database error messages', () => {
    expect(
      detectSignals("'", 'You have an error in your SQL syntax; check the manual', h())[0],
    ).toMatchObject({ id: 'db-error', severity: 'bad' });
    expect(detectSignals("'", 'ORA-00933: SQL command not properly ended', h())[0].label).toContain(
      'Oracle',
    );
    expect(detectSignals("'", 'org.postgresql.util.PSQLException: ERROR', h())[0].label).toContain(
      'PostgreSQL',
    );
  });
  it('flags stack traces, file disclosure and command output', () => {
    expect(
      detectSignals('x', 'Traceback (most recent call last):\n  File "app.py"', h())[0].id,
    ).toBe('stack-trace');
    expect(
      detectSignals('../../../etc/passwd', 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:', h())[0]
        .label,
    ).toContain('passwd');
    expect(detectSignals('..\\win.ini', '[fonts]\n[extensions]', h())[0].label).toContain(
      'win.ini',
    );
    expect(
      detectSignals('; id', 'uid=1000(www-data) gid=1000(www-data) groups=1000', h())[0].label,
    ).toContain('uid=');
  });
  it('flags unescaped reflected XSS markers but not escaped ones', () => {
    const hit = detectSignals(
      '<script>devlensXSS1</script>',
      'echo: <script>devlensXSS1</script>',
      h(),
    );
    expect(hit.find((s) => s.id === 'xss-reflected')).toBeTruthy();
    const escaped = detectSignals(
      '<script>devlensXSS1</script>',
      'echo: &lt;script&gt;devlensXSS1&lt;/script&gt;',
      h(),
    );
    expect(escaped.find((s) => s.id === 'xss-reflected')).toBeUndefined();
  });
  it('flags an evaluated template expression (possible SSTI)', () => {
    expect(
      detectSignals('{{7*7}}devlensXSS1', 'result: 49', h()).find((s) => s.id === 'ssti'),
    ).toBeTruthy();
    expect(
      detectSignals('{{7*7}}devlensXSS1', 'result: {{7*7}}', h()).find((s) => s.id === 'ssti'),
    ).toBeUndefined();
  });
  it('returns nothing for a clean response', () => {
    expect(detectSignals("'", '{"ok":true}', h([['Content-Type', 'application/json']]))).toEqual(
      [],
    );
  });
});

describe('extractSameOriginLinks', () => {
  it('keeps only same-origin http(s) links, resolved and de-duplicated', () => {
    const html = `
      <a href="/a">a</a>
      <a href="https://example.com/b?x=1#frag">b</a>
      <a href="https://other.example/c">cross-origin</a>
      <a href="mailto:x@example.com">mail</a>
      <a href="javascript:void(0)">js</a>
      <form action="/a"></form>
      <img src="/img.png">
    `;
    const links = extractSameOriginLinks(html, 'https://example.com/start');
    expect(links.sort()).toEqual(
      ['https://example.com/a', 'https://example.com/b?x=1', 'https://example.com/img.png'].sort(),
    );
  });
  it('treats http and https as different origins', () => {
    expect(
      extractSameOriginLinks('<a href="http://example.com/x">x</a>', 'https://example.com/'),
    ).toEqual([]);
  });
});

describe('extractSitemapLinks / extractRobotsPaths', () => {
  it('reads <loc> entries, same-origin only', () => {
    const xml =
      '<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://other.example/b</loc></url></urlset>';
    expect(extractSitemapLinks(xml, 'https://example.com/')).toEqual(['https://example.com/a']);
  });
  it('resolves Disallow/Allow paths, skipping the catch-all', () => {
    const robots = 'User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /\n';
    expect(extractRobotsPaths(robots, 'https://example.com/').sort()).toEqual(
      ['https://example.com/admin', 'https://example.com/admin/public'].sort(),
    );
  });
});

describe('discoverUrls', () => {
  it('does a breadth-first same-origin crawl up to the depth and page caps', async () => {
    const pages: Record<string, string> = {
      'https://x.io/': '<a href="/a">a</a><a href="/b">b</a>',
      'https://x.io/a': '<a href="/c">c</a><a href="/">home</a>',
      'https://x.io/b': '<a href="/d">d</a>',
      'https://x.io/c': '<a href="/e">e</a>',
    };
    const fetchText = async (u: string) => pages[u] ?? null;
    const out = await discoverUrls('https://x.io/', 2, 10, fetchText);
    const urls = out.map((o) => o.url);
    expect(urls).toContain('https://x.io/');
    expect(urls).toContain('https://x.io/a');
    expect(urls).toContain('https://x.io/c'); // depth 2, reached via /a
    expect(urls).not.toContain('https://x.io/e'); // would be depth 3
    expect(out.find((o) => o.url === 'https://x.io/c')?.depth).toBe(2);
  });

  it('also pulls sitemap.xml and robots.txt links at depth 1', async () => {
    const texts: Record<string, string> = {
      'https://x.io/': '<a href="/page">p</a>',
      'https://x.io/sitemap.xml':
        '<urlset><url><loc>https://x.io/from-sitemap</loc></url></urlset>',
      'https://x.io/robots.txt': 'Disallow: /secret\n',
    };
    const out = await discoverUrls('https://x.io/', 1, 50, async (u) => texts[u] ?? null);
    const urls = out.map((o) => o.url);
    expect(urls).toContain('https://x.io/from-sitemap');
    expect(urls).toContain('https://x.io/secret');
    expect(out.find((o) => o.url === 'https://x.io/secret')?.source).toBe('robots');
  });

  it('never exceeds the page cap or the hard MAX_DISCOVERED ceiling', async () => {
    const fetchText = async (u: string) => {
      const n = Number(new URL(u).pathname.slice(1)) || 0;
      return `<a href="/${n + 1}">next</a>`;
    };
    const out = await discoverUrls('https://x.io/0', 50, 20, fetchText);
    expect(out.length).toBeLessThanOrEqual(20);
    const out2 = await discoverUrls('https://x.io/0', 50, 10_000, fetchText);
    expect(out2.length).toBeLessThanOrEqual(MAX_DISCOVERED);
  });

  it('handles an unreachable start URL gracefully', async () => {
    const out = await discoverUrls('https://x.io/', 2, 10, async () => null);
    expect(out).toEqual([{ url: 'https://x.io/', depth: 0, source: 'page' }]);
  });
});
