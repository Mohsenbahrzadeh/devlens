import { fail, ok, type Result } from '@/types/result';

export interface RegexMatch {
  index: number;
  text: string;
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

export interface RegexResult {
  matches: RegexMatch[];
  truncated: boolean;
}

export const MAX_TEXT = 100_000;
export const MAX_MATCHES = 200;

/**
 * Runs a JavaScript regular expression against sample text. Patterns with catastrophic
 * backtracking can still be slow; input size is capped to limit the damage.
 */
export function testRegex(pattern: string, flags: string, text: string): Result<RegexResult> {
  if (!pattern) return fail('Empty pattern', 'Enter a regular expression.');
  if (text.length > MAX_TEXT) {
    return fail(
      'Text too long',
      `Sample text is limited to ${MAX_TEXT.toLocaleString()} characters.`,
    );
  }
  const clean = [...new Set(flags.replace(/[^dgimsuvy]/g, ''))].join('');
  let re: RegExp;
  try {
    re = new RegExp(pattern, clean.includes('g') ? clean : `${clean}g`);
  } catch (e) {
    return fail(
      'Invalid regular expression',
      e instanceof Error
        ? e.message.replace(/^Invalid regular expression: /, '')
        : 'The pattern is not valid.',
    );
  }
  const matches: RegexMatch[] = [];
  let truncated = false;
  for (const m of text.matchAll(re)) {
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    matches.push({
      index: m.index ?? 0,
      text: m[0],
      groups: m.slice(1),
      named: { ...(m.groups ?? {}) },
    });
  }
  return ok({ matches, truncated });
}
