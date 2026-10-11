import { fail, ok, type Result } from '@/types/result';

const TOKEN =
  /\s+|#[^\n]*|"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|\.\.\.|[{}()[\]:=!@$&|,]|[^\s{}()[\]:=!@$&|,"#]+/y;

type Tok = { text: string; kind: 'comment' | 'punct' | 'word' };

function tokenize(src: string): Result<Tok[]> {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(src);
    if (!m || m.index !== i) {
      return fail('Invalid GraphQL', `Unexpected character at position ${i + 1}.`);
    }
    i += m[0].length;
    const t = m[0];
    if (/^\s/.test(t)) continue;
    if (t.startsWith('#')) out.push({ text: t, kind: 'comment' });
    else if (/^[{}()[\]:=!@$&|,]$|^\.\.\.$/.test(t)) out.push({ text: t, kind: 'punct' });
    else out.push({ text: t, kind: 'word' });
  }
  return ok(out);
}

/** Pretty-prints a GraphQL document (queries, mutations, fragments, variables, directives). */
export function formatGraphQL(src: string): Result<string> {
  if (!src.trim()) return fail('Empty input', 'Enter a GraphQL document.');
  const tokens = tokenize(src);
  if (!tokens.ok) return tokens;

  const lines: string[] = [];
  let line = '';
  let depth = 0;
  let parens = 0;
  let brackets = 0;
  let objectDepth = 0; // object literals inside arguments
  let spread = 0; // 1: expecting `on` or a fragment name, 2: expecting the type condition
  let attach = false; // next token attaches without a space ($var, @directive)
  let prev: Tok | null = null;
  const pad = () => '  '.repeat(depth);
  const flush = () => {
    if (line.trim()) lines.push(pad() + line.trim());
    line = '';
  };
  const space = () =>
    line && !line.endsWith(' ') && !line.endsWith('(') && !line.endsWith('[') ? ' ' : '';

  for (const t of tokens.value) {
    const x = t.text;
    if (t.kind === 'comment') {
      flush();
      lines.push(pad() + x);
      prev = t;
      continue;
    }
    const inArgs = parens > 0 || brackets > 0 || objectDepth > 0;
    if (x === ',') {
      // Commas are insignificant in GraphQL; keep them only inside arguments and lists.
      if (inArgs) line = line.trimEnd() + ', ';
      continue;
    }
    if (x === '{' && !inArgs) {
      line = `${line}${line && !line.endsWith(' ') ? ' ' : ''}{`;
      flush();
      depth++;
      spread = 0;
    } else if (x === '}' && !inArgs) {
      flush();
      depth = Math.max(0, depth - 1);
      line = '}';
      flush();
    } else if (x === '{') {
      line += `${line && !/[ ([]$/.test(line) ? ' ' : ''}{ `;
      objectDepth++;
    } else if (x === '}') {
      line = line.trimEnd() + ' }';
      objectDepth = Math.max(0, objectDepth - 1);
    } else if (x === '(') {
      line += '(';
      parens++;
    } else if (x === ')') {
      line = line.trimEnd() + ')';
      parens = Math.max(0, parens - 1);
    } else if (x === '[') {
      line += space() === ' ' && !line.endsWith(': ') ? ' [' : '[';
      brackets++;
    } else if (x === ']') {
      line = line.trimEnd() + ']';
      brackets = Math.max(0, brackets - 1);
    } else if (x === ':') {
      line = line.trimEnd() + ': ';
    } else if (x === '!') {
      line = line.trimEnd() + '!';
    } else if (x === '$') {
      line += `${space()}$`;
      attach = true;
    } else if (x === '@') {
      line += `${space()}@`;
      attach = true;
    } else if (x === '=') {
      line = `${line.trimEnd()} = `;
    } else if (x === '...') {
      if (!inArgs) flush();
      line += '...';
      spread = 1;
    } else {
      const endsSelection =
        prev !== null &&
        (prev.kind === 'word' || prev.text === ')' || prev.text === ']' || prev.text === '!');
      const newSelection =
        depth > 0 && !inArgs && spread === 0 && !attach && endsSelection && prev?.text !== ':';
      if (spread === 1) {
        if (x === 'on') {
          line += ' on';
          spread = 2;
        } else {
          line += x;
          spread = 0;
        }
      } else if (spread === 2) {
        line += ` ${x}`;
        spread = 0;
      } else if (newSelection) {
        flush();
        line = x;
      } else {
        line += attach ? x : `${space()}${x}`;
      }
      attach = false;
    }
    prev = t;
  }
  flush();
  if (depth !== 0 || parens !== 0 || brackets !== 0) {
    return fail('Invalid GraphQL', 'Braces, parentheses or brackets are not balanced.');
  }
  return ok(lines.join('\n') + '\n');
}
