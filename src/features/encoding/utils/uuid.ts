import { fail, ok, type Result } from '@/types/result';

export interface UuidInfo {
  normalized: string;
  version: number | null;
  variant: string;
  details: { label: string; value: string }[];
}

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function variantOf(byte: number): string {
  if ((byte & 0x80) === 0) return 'NCS (reserved)';
  if ((byte & 0xc0) === 0x80) return 'RFC 4122 / RFC 9562';
  if ((byte & 0xe0) === 0xc0) return 'Microsoft (reserved)';
  return 'Future (reserved)';
}

export function inspectUuid(input: string): Result<UuidInfo> {
  const raw = input
    .trim()
    .replace(/^urn:uuid:/i, '')
    .replace(/^\{|\}$/g, '');
  if (!UUID_RE.test(raw)) return fail('Invalid UUID', 'A UUID has 32 hexadecimal digits.');
  const hex = raw.replace(/-/g, '').toLowerCase();
  const normalized = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
  const variant = variantOf(parseInt(hex.slice(16, 18), 16));
  const version = variant.startsWith('RFC') ? parseInt(hex[12], 16) : null;
  const details: UuidInfo['details'] = [];

  if (hex === '0'.repeat(32)) details.push({ label: 'Special', value: 'Nil UUID' });
  else if (hex === 'f'.repeat(32)) details.push({ label: 'Special', value: 'Max UUID' });

  if (version === 1) {
    // 60-bit timestamp in 100ns intervals since 1582-10-15.
    const timeHex = hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8);
    const ms = Number(BigInt('0x' + timeHex) / 10000n) - 12219292800000;
    details.push({ label: 'Timestamp (UTC)', value: new Date(ms).toISOString() });
    details.push({ label: 'Node', value: hex.slice(20).replace(/(..)(?=.)/g, '$1:') });
  } else if (version === 7) {
    const ms = parseInt(hex.slice(0, 12), 16);
    details.push({ label: 'Timestamp (UTC)', value: new Date(ms).toISOString() });
  } else if (version === 3 || version === 5) {
    details.push({ label: 'Note', value: 'Name-based hash; no metadata can be derived.' });
  } else if (version === 4) {
    details.push({ label: 'Note', value: 'Random; no metadata can be derived.' });
  }
  return ok({ normalized, version, variant, details });
}
