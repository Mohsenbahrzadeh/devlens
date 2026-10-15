export const MAX_DISCOVERED = 200;

/** Resolves and keeps only same-origin http(s) links, de-duplicated, query/fragment stripped. */
export function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  const re = /(?:href|src|action)\s*=\s*["']([^"'#\s]+)/gi;
  for (const m of html.matchAll(re)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin !== base.origin || (u.protocol !== 'http:' && u.protocol !== 'https:')) continue;
      u.hash = '';
      found.add(u.href);
    } catch {
      /* ignore unparsable URLs */
    }
  }
  return [...found];
}

/** Extracts <loc> URLs from a sitemap.xml body, same-origin only. */
export function extractSitemapLinks(xml: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === base.origin) found.add(u.href);
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

/** Extracts non-comment `Disallow`/`Allow` paths from robots.txt, resolved against the origin. */
export function extractRobotsPaths(text: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:Disallow|Allow)\s*:\s*(\S+)/i.exec(line);
    if (!m || m[1] === '/' || m[1] === '*') continue;
    try {
      found.add(new URL(m[1], base).href);
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

export interface DiscoveredUrl {
  url: string;
  depth: number;
  source: 'page' | 'sitemap' | 'robots';
}

/**
 * Breadth-first, same-origin link discovery starting from `startUrl`. Also tries
 * /sitemap.xml and /robots.txt once at depth 0. Capped by `maxPages` and `maxDepth`;
 * `fetchText(url)` is injected so this stays easy to test without a real network call.
 */
export async function discoverUrls(
  startUrl: string,
  maxDepth: number,
  maxPages: number,
  fetchText: (url: string) => Promise<string | null>,
): Promise<DiscoveredUrl[]> {
  const cap = Math.min(maxPages, MAX_DISCOVERED);
  const base = new URL(startUrl);
  const seen = new Set<string>([startUrl]);
  const out: DiscoveredUrl[] = [{ url: startUrl, depth: 0, source: 'page' }];
  let queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];

  for (const [path, source] of [
    ['/sitemap.xml', 'sitemap'],
    ['/robots.txt', 'robots'],
  ] as const) {
    if (out.length >= cap) break;
    const text = await fetchText(new URL(path, base).href);
    if (!text) continue;
    const links =
      source === 'sitemap'
        ? extractSitemapLinks(text, startUrl)
        : extractRobotsPaths(text, startUrl);
    for (const url of links) {
      if (out.length >= cap || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, depth: 1, source });
      queue.push({ url, depth: 1 });
    }
  }

  while (queue.length > 0 && out.length < cap) {
    const next: typeof queue = [];
    for (const { url, depth } of queue) {
      if (depth >= maxDepth || out.length >= cap) continue;
      const html = await fetchText(url);
      if (!html) continue;
      for (const link of extractSameOriginLinks(html, url)) {
        if (out.length >= cap || seen.has(link)) continue;
        seen.add(link);
        out.push({ url: link, depth: depth + 1, source: 'page' });
        next.push({ url: link, depth: depth + 1 });
      }
    }
    queue = next;
  }
  return out;
}
