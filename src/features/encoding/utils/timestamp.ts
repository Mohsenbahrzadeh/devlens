import { fail, ok, type Result } from '@/types/result';

export interface TimestampInfo {
  unit: 'seconds' | 'milliseconds';
  utc: string;
  local: string;
  iso: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Values with an absolute magnitude >= 1e11 are treated as milliseconds, otherwise seconds. */
export function convertTimestamp(input: string): Result<TimestampInfo> {
  const t = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return fail('Invalid timestamp', 'Enter a numeric Unix timestamp.');
  }
  const n = Number(t);
  const unit = Math.abs(n) >= 1e11 ? 'milliseconds' : 'seconds';
  const d = new Date(unit === 'seconds' ? n * 1000 : n);
  if (isNaN(d.getTime())) return fail('Invalid timestamp', 'The timestamp is out of range.');
  const utc =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const local =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return ok({ unit, utc, local, iso: d.toISOString() });
}
