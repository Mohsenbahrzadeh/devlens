import { fail, ok, type Result } from '@/types/result';
import { parseJson } from './json';

export interface RepairResult {
  /** Valid, compact JSON. */
  json: string;
  /** Human-readable list of what was changed (empty when the input was already valid). */
  fixes: string[];
}

const OPEN_QUOTES: Record<string, string> = { '"': '"', "'": "'", '`': '`', '“': '”', '‘': '’' };
const LITERALS: Record<string, string> = {
  true: 'true',
  false: 'false',
  null: 'null',
  True: 'true',
  False: 'false',
  None: 'null',
  undefined: 'null',
  NaN: 'null',
  Infinity: 'null',
};
const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '\\': '\\',
  '/': '/',
  '"': '"',
};

/** Reads a quoted string starting at `start`; returns its decoded value and the index after it. */
function readString(src: string, start: number): { value: string; end: number; closed: boolean } {
  const close = OPEN_QUOTES[src[start]];
  let value = '';
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1];
      if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
        value += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      value += ESCAPES[n] ?? n;
      i += 2;
      continue;
    }
    if (c === close) return { value, end: i + 1, closed: true };
    value += c;
    i++;
  }
  return { value, end: i, closed: false };
}

/**
 * Repairs common "almost JSON": comments, single/smart quotes, unquoted keys, trailing or missing
 * commas, Python/JS literals (True, None, undefined, NaN), code fences and unclosed brackets.
 */
export function repairJson(input: string): Result<RepairResult> {
  if (!input.trim()) return fail('Empty input', 'Paste some JSON to repair.');
  const direct = parseJson(input);
  if (direct.ok) return ok({ json: JSON.stringify(direct.value), fixes: [] });

  const fixes = new Set<string>();
  let src = input.trim();
  const fenced = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i.exec(src);
  if (fenced) {
    src = fenced[1];
    fixes.add('Removed Markdown code fence');
  }

  let out = '';
  const stack: string[] = [];
  let lastIsValue = false; // the previous token ended a value (so a comma is required before the next)
  let i = 0;

  const beforeValueOrKey = () => {
    if (lastIsValue) {
      out += ',';
      fixes.add('Added missing commas');
    }
    lastIsValue = false;
  };

  while (i < src.length) {
    const c = src[i];

    if (/\s/.test(c)) {
      out += c;
      i++;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      fixes.add('Removed comments');
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      fixes.add('Removed comments');
    } else if (c === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      fixes.add('Removed comments');
    } else if (c in OPEN_QUOTES) {
      const s = readString(src, i);
      if (c !== '"') fixes.add('Converted single/smart quotes to double quotes');
      if (!s.closed) fixes.add('Closed an unterminated string');
      beforeValueOrKey();
      out += JSON.stringify(s.value);
      i = s.end;
      lastIsValue = true;
    } else if (c === '{' || c === '[') {
      beforeValueOrKey();
      stack.push(c === '{' ? '}' : ']');
      out += c;
      i++;
    } else if (c === '}' || c === ']') {
      if (/,\s*$/.test(out)) {
        out = out.replace(/,(\s*)$/, '$1');
        fixes.add('Removed trailing commas');
      }
      if (stack.includes(c)) {
        // Close any inner brackets that were left open, then the matching one.
        while (stack[stack.length - 1] !== c) {
          out += stack.pop();
          fixes.add('Closed unclosed brackets');
        }
        stack.pop();
        out += c;
        lastIsValue = true;
      } else {
        fixes.add('Dropped an unmatched closing bracket');
      }
      i++;
    } else if (c === ':' || c === ',') {
      out += c;
      i++;
      lastIsValue = false;
    } else if (/[-+.\d]/.test(c)) {
      const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i));
      if (!m) {
        return fail('Could not repair', `Unexpected character "${c}" at position ${i + 1}.`);
      }
      let num = m[0];
      if (num.startsWith('+')) num = num.slice(1);
      if (num.startsWith('.')) num = `0${num}`;
      else if (num.startsWith('-.')) num = `-0${num.slice(1)}`;
      num = num.replace(/\.($|[eE])/, '$1'); // "10." -> "10"
      if (num !== m[0]) fixes.add('Normalised number formats');
      beforeValueOrKey();
      out += num;
      i += m[0].length;
      lastIsValue = true;
    } else if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i)) as RegExpExecArray;
      const word = m[0];
      const rest = src.slice(i + word.length);
      const isKey = /^\s*:/.test(rest);
      beforeValueOrKey();
      if (isKey) {
        out += JSON.stringify(word);
        fixes.add('Quoted unquoted keys');
        lastIsValue = true;
      } else if (word in LITERALS) {
        out += LITERALS[word];
        if (LITERALS[word] !== word)
          fixes.add('Converted True/False/None/undefined/NaN to JSON literals');
        lastIsValue = true;
      } else {
        out += JSON.stringify(word);
        fixes.add('Quoted bare words');
        lastIsValue = true;
      }
      i += word.length;
    } else {
      return fail('Could not repair', `Unexpected character "${c}" at position ${i + 1}.`);
    }
  }

  if (stack.length > 0) {
    out = out.replace(/,\s*$/, '');
    out += stack.reverse().join('');
    fixes.add(`Closed ${stack.length} unclosed bracket${stack.length === 1 ? '' : 's'}`);
  }

  const check = parseJson(out);
  if (!check.ok) {
    return fail(
      'Could not repair',
      'The text is too far from valid JSON to repair automatically.',
      check.error.message,
    );
  }
  return ok({ json: JSON.stringify(check.value), fixes: [...fixes] });
}
