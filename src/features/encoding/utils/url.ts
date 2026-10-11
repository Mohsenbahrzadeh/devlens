import { fail, ok, type Result } from '@/types/result';

export const urlEncode = (s: string): string => encodeURIComponent(s);

export function urlDecode(s: string): Result<string> {
  try {
    return ok(decodeURIComponent(s));
  } catch (e) {
    return fail(
      'Invalid URL encoding',
      'The input contains a malformed % escape sequence.',
      String(e),
    );
  }
}
