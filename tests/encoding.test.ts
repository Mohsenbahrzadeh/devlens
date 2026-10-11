import { describe, expect, it } from 'vitest';
import { base64ToUtf8, utf8ToBase64 } from '@/lib/base64';
import { urlDecode, urlEncode } from '@/features/encoding/utils/url';
import { convertTimestamp } from '@/features/encoding/utils/timestamp';
import { inspectUuid } from '@/features/encoding/utils/uuid';

describe('base64', () => {
  it('encodes', () => expect(utf8ToBase64('hello')).toBe('aGVsbG8='));
  it('decodes', () => {
    const r = base64ToUtf8('aGVsbG8=');
    expect(r.ok && r.value).toBe('hello');
  });
  it('round-trips UTF-8', () => {
    const r = base64ToUtf8(utf8ToBase64('héllo 🌍 世界'));
    expect(r.ok && r.value).toBe('héllo 🌍 世界');
  });
  it('accepts unpadded and URL-safe input', () => {
    const r = base64ToUtf8('aGVsbG8');
    expect(r.ok && r.value).toBe('hello');
  });
  it('returns a readable error for invalid Base64', () => {
    const r = base64ToUtf8('not*base64!');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.title).toBe('Invalid Base64');
  });
  it('rejects impossible lengths', () => expect(base64ToUtf8('a').ok).toBe(false));
});

describe('url encoding', () => {
  it('encodes', () => expect(urlEncode('hello world')).toBe('hello%20world'));
  it('decodes', () => {
    const r = urlDecode('hello%20world%26');
    expect(r.ok && r.value).toBe('hello world&');
  });
  it('reports malformed sequences', () => expect(urlDecode('%E0%A4%A').ok).toBe(false));
});

describe('timestamp', () => {
  it('converts seconds', () => {
    const r = convertTimestamp('1780230000');
    expect(r.ok && r.value.unit).toBe('seconds');
    expect(r.ok && r.value.utc).toBe('2026-05-31 12:20:00');
  });
  it('converts milliseconds', () => {
    const r = convertTimestamp('1780230000000');
    expect(r.ok && r.value.unit).toBe('milliseconds');
    expect(r.ok && r.value.iso).toBe('2026-05-31T12:20:00.000Z');
  });
  it('rejects garbage', () => expect(convertTimestamp('abc').ok).toBe(false));
});

describe('uuid', () => {
  it('detects v4', () => {
    const r = inspectUuid('550e8400-e29b-41d4-a716-446655440000');
    expect(r.ok && r.value.version).toBe(4);
    expect(r.ok && r.value.variant).toContain('RFC');
  });
  it('extracts v7 timestamp', () => {
    const r = inspectUuid('01894f4e-7e00-7000-8000-000000000000');
    expect(r.ok && r.value.version).toBe(7);
    expect(r.ok && r.value.details[0].value).toMatch(/^2023-/);
  });
  it('extracts v1 timestamp', () => {
    const r = inspectUuid('c232ab00-9414-11ec-b3c8-9f6bdeced846');
    expect(r.ok && r.value.version).toBe(1);
    expect(r.ok && r.value.details[0].value).toMatch(/^2022-02-22/);
  });
  it('rejects invalid input', () => expect(inspectUuid('xyz').ok).toBe(false));
});
