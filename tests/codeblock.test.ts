import { describe, expect, it } from 'vitest';
import { tokenize } from '@/components/CodeBlock';

const kinds = (code: string, lang: Parameters<typeof tokenize>[1]) =>
  tokenize(code, lang)
    .filter((t) => t.kind !== 'plain')
    .map((t) => `${t.kind}:${t.text}`);

describe('tokenize', () => {
  it('highlights shell flags, strings and the command', () => {
    expect(kinds("curl -X POST 'https://a.io' -H 'A: b'", 'bash')).toEqual([
      'keyword:curl',
      'flag:-X',
      'type:POST',
      "string:'https://a.io'",
      'flag:-H',
      "string:'A: b'",
    ]);
  });
  it('does not treat # inside a quoted string as a comment', () => {
    expect(kinds("curl 'https://a.io/#x'", 'bash')).toContain("string:'https://a.io/#x'");
  });
  it('highlights C# keywords, strings and numbers', () => {
    const k = kinds('var x = await client.GetAsync("u", 5); // done', 'csharp');
    expect(k).toContain('keyword:var');
    expect(k).toContain('keyword:await');
    expect(k).toContain('string:"u"');
    expect(k).toContain('number:5');
    expect(k).toContain('comment:// done');
  });
  it('never drops or alters characters', () => {
    const code = 'const a = "x\\"y"; // c\n<script>alert(1)</script>';
    expect(
      tokenize(code, 'javascript')
        .map((t) => t.text)
        .join(''),
    ).toBe(code);
  });
});
