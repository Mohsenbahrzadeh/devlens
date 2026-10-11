import { base64ToUtf8 } from '@/lib/base64';
import { parseJson } from '@/lib/json';
import { decodeJwt } from '@/features/jwt/utils/token';

export type Detected =
  | { tool: 'jwt' }
  | { tool: 'json' }
  | { tool: 'tools'; sub: 'uuid' | 'timestamp' | 'query' | 'url' | 'base64' };

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Guesses which DevLens tool fits a piece of selected text (used by the context menu). */
export function detectInput(raw: string): Detected {
  const text = raw.trim();
  if (decodeJwt(text).ok) return { tool: 'jwt' };
  if (/^[{[]/.test(text) && parseJson(text).ok) return { tool: 'json' };
  if (UUID.test(text.replace(/^urn:uuid:/i, '').replace(/^\{|\}$/g, ''))) {
    return { tool: 'tools', sub: 'uuid' };
  }
  if (/^\d{10}(\d{3})?$/.test(text)) return { tool: 'tools', sub: 'timestamp' };
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(text) && text.includes('?')) {
    return { tool: 'tools', sub: 'query' };
  }
  if (/^(\??[^\s=&]+=[^\s&]*)(&[^\s=&]+=[^\s&]*)+$/.test(text))
    return { tool: 'tools', sub: 'query' };
  if (/%[0-9a-f]{2}/i.test(text)) return { tool: 'tools', sub: 'url' };
  if (/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(text) && text.length % 4 !== 1) {
    const decoded = base64ToUtf8(text);
    // eslint-disable-next-line no-control-regex
    if (decoded.ok && !/[\x00-\x08\x0e-\x1f]/.test(decoded.value))
      return { tool: 'tools', sub: 'base64' };
  }
  return { tool: 'json' };
}
