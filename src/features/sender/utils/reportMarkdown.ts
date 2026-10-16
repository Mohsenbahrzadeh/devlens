import type { Finding } from './securityHeaders';
import type { FuzzRow } from './fuzz';
import type { RunResult } from './collections';
import { allPassed } from './collections';

export function fuzzToMarkdown(rows: FuzzRow[], marker: string, target: string): string {
  const flagged = rows.filter((r) => r.flags.length > 0);
  const lines = [
    '# Fuzz report',
    '',
    `Target: \`${target}\` (placeholder \`${marker}\`)`,
    `${rows.length} requests sent, ${flagged.length} flagged.`,
    '',
    '| Value | Status | Length | Time | Flags |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(
      (r) =>
        `| \`${r.value}\` | ${r.status || 'error'} | ${r.bodyLength} | ${r.timeMs} ms | ${r.flags.join('; ')} |`,
    ),
  ];
  return lines.join('\n') + '\n';
}

export function securityHeadersToMarkdown(url: string, findings: Finding[]): string {
  const lines = ['# Security headers report', '', `Target: \`${url}\``, ''];
  for (const f of findings) lines.push(`- **[${f.severity}]** ${f.title} — ${f.detail}`);
  return lines.join('\n') + '\n';
}

export function collectionRunToMarkdown(collectionName: string, results: RunResult[]): string {
  const lines = ['# Collection run report', '', `Collection: **${collectionName}**`, ''];
  for (const r of results) {
    const ok = !r.error && allPassed(r.assertionResults);
    lines.push(`## ${ok ? '✓' : '✗'} ${r.request.name}`);
    lines.push(
      `\`${r.request.method} ${r.request.url}\` → ${r.error ? `failed: ${r.error}` : `${r.status} in ${r.timeMs} ms`}`,
      '',
    );
    for (const a of r.assertionResults) lines.push(`- ${a.pass ? '✓' : '✗'} ${a.message}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
