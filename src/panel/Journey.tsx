import { useMemo, type ReactNode } from 'react';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { Icon, type IconName } from '@/components/Icon';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { maskForSharing } from '@/features/collections/redact';
import {
  journeyToMarkdown,
  summarizeJourney,
  type Hop,
  type HopKind,
  type JourneyEntry,
  type Severity,
  type StageId,
} from '@/features/http/utils/journey';

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  ok: 'good',
  info: 'info',
  warn: 'warn',
  error: 'bad',
};

const STAGE_COLOR: Record<StageId, string> = {
  queue: 'bg-muted/40',
  stalled: 'bg-muted/70',
  dns: 'bg-warn',
  tcp: 'bg-accent',
  tls: 'bg-accent2',
  send: 'bg-good/60',
  wait: 'bg-good',
  receive: 'bg-accent/60',
};

const HOP_LABEL: Record<HopKind, string> = {
  cdn: 'CDN',
  proxy: 'Proxy / cache',
  gateway: 'Gateway',
  platform: 'Platform',
  server: 'Web server',
  framework: 'Framework',
};

interface Step {
  icon: IconName;
  title: string;
  detail?: string;
  badge?: string;
  tone?: 'good' | 'warn' | 'bad' | 'muted';
  /** Rendered under the detail line (e.g. chips). */
  extra?: ReactNode;
}

const TONE_CLASS = {
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  muted: 'bg-surface2 text-muted',
};

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line"
            />
          )}
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${TONE_CLASS[s.tone ?? 'muted']}`}
          >
            <Icon name={s.icon} size={14} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold">{s.title}</span>
              {s.badge && (
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {s.badge}
                </span>
              )}
            </div>
            {s.detail && <p className="break-all text-xs text-muted">{s.detail}</p>}
            {s.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}

function HopChip({ hop }: { hop: Hop }) {
  return (
    <span
      title={hop.evidence.join('\n')}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2/60 px-2 py-1 text-xs"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
        {HOP_LABEL[hop.kind]}
      </span>
      <span className="font-semibold">{hop.name}</span>
      {hop.detail && <span className="text-muted">· {hop.detail}</span>}
    </span>
  );
}

interface Props {
  entry: JourneyEntry;
  /** Every captured request, used to rebuild redirect chains and find CORS preflights. */
  all: JourneyEntry[];
  /** Hide secrets (token query parameters) in URLs shown and copied. */
  mask: boolean;
  hasBearer: boolean;
}

export function JourneyView({ entry, all, mask, hasBearer }: Props) {
  const j = useMemo(() => summarizeJourney(entry, all, hasBearer), [entry, all, hasBearer]);
  const show = (url: string) =>
    mask ? maskForSharing({ method: 'GET', url, headers: [], body: '' }).url : url;
  const c = j.connection;

  const steps: Step[] = [
    {
      icon: 'code',
      title: 'Your browser',
      detail: `${j.method} ${show(j.url)} — started by ${j.initiator}`,
      tone: 'muted',
    },
  ];
  if (j.preflight) {
    steps.push({
      icon: 'shield',
      title: `CORS preflight: ${j.preflight.status}`,
      detail:
        [
          j.preflight.allowOrigin && `allow-origin ${j.preflight.allowOrigin}`,
          j.preflight.allowMethods && `methods ${j.preflight.allowMethods}`,
          j.preflight.maxAge && `cached ${j.preflight.maxAge}s`,
        ]
          .filter(Boolean)
          .join(' · ') || 'The browser asked permission before sending this request.',
      tone: j.preflight.status >= 200 && j.preflight.status < 300 ? 'good' : 'bad',
      badge: 'OPTIONS',
    });
  }
  if (c.fromCache) {
    steps.push({
      icon: 'download',
      title: 'Answered from the browser cache',
      detail: j.cache.detail,
      tone: 'good',
      badge: 'no network',
    });
  } else {
    steps.push({
      icon: 'send',
      title: c.ip ? `Connected to ${c.ip}` : 'Connected to the server',
      detail: `${c.protocol} ${c.secure ? 'over TLS' : '(not encrypted)'} · ${
        c.reused === null
          ? 'connection reuse unknown'
          : c.reused
            ? 'reused an existing connection'
            : 'new connection (DNS + TCP' + (c.secure ? ' + TLS)' : ')')
      }`,
      tone: c.secure ? 'good' : 'warn',
    });
    if (j.hops.length > 0) {
      steps.push({
        icon: 'tool',
        title: 'Intermediaries on the way back',
        detail:
          'Inferred from response headers; they can be missing or spoofed, and are not measured hops.',
        tone: 'muted',
        badge: 'inferred',
        extra: (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Detected intermediaries">
            {j.hops.map((h) => (
              <HopChip key={`${h.kind}-${h.name}`} hop={h} />
            ))}
          </div>
        ),
      });
    }
    steps.push({
      icon: 'key',
      title: 'Response',
      detail: `${j.status || 'failed'} ${j.statusName}${j.total ? ` · ${j.total} ms` : ''}`,
      tone:
        j.diagnosis.severity === 'ok'
          ? 'good'
          : j.diagnosis.severity === 'info'
            ? 'muted'
            : j.diagnosis.severity === 'warn'
              ? 'warn'
              : 'bad',
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Final status"
        icon="check"
        actions={<CopyButton label="Copy report" text={journeyToMarkdown(j, show)} />}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SEVERITY_TONE[j.diagnosis.severity]}>
              {j.diagnosis.title}
            </StatusBadge>
            {j.total > 0 && <span className="text-xs text-muted">{j.total} ms total</span>}
          </div>
          {j.diagnosis.advice.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs">
              {j.diagnosis.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Path" icon="send">
        <Stepper steps={steps} />
        {j.cache.state !== 'unknown' && !c.fromCache && (
          <p className="mt-3 text-xs text-muted">
            <b className="text-fg">Cache:</b> {j.cache.detail}
          </p>
        )}
      </Card>

      {j.chain.length > 0 && (
        <Card title={`Redirects (${j.chain.length} requests)`} icon="chevron">
          <ol className="flex flex-col gap-1.5">
            {j.chain.map((h, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-lg px-2 py-1 text-xs ${h.current ? 'bg-accent/10 ring-1 ring-accent/30' : 'bg-surface2/50'}`}
              >
                <span className="w-5 shrink-0 text-muted">{i + 1}.</span>
                <span
                  className={`w-9 shrink-0 font-mono font-bold ${h.status >= 400 || h.status === 0 ? 'text-bad' : h.status >= 300 ? 'text-warn' : 'text-good'}`}
                >
                  {h.status || '—'}
                </span>
                <span className="w-12 shrink-0 font-mono text-[10px] font-bold text-accent">
                  {h.method}
                </span>
                <span className="min-w-0 flex-1 break-all font-mono">{show(h.url)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {j.stages.length > 0 && (
        <Card title="Timing" icon="clock">
          <div className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={`Timing breakdown, ${j.total} milliseconds in total`}
              className="flex h-5 w-full overflow-hidden rounded-md bg-surface2"
            >
              {j.stages.map((s) => (
                <span
                  key={s.id}
                  title={`${s.label}: ${s.ms} ms`}
                  className={`${STAGE_COLOR[s.id]} h-full`}
                  style={{ width: `${Math.max(1.5, (s.ms / (j.total || 1)) * 100)}%` }}
                />
              ))}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {j.stages.map((s) => (
                  <tr key={s.id} title={s.hint} className="border-t border-line first:border-0">
                    <td className="py-1 pr-2">
                      <span
                        className={`mr-2 inline-block h-2.5 w-2.5 rounded-sm ${STAGE_COLOR[s.id]}`}
                        aria-hidden="true"
                      />
                      {s.label}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono">{s.ms} ms</td>
                    <td className="w-12 py-1 text-right font-mono text-muted">
                      {Math.round((s.ms / (j.total || 1)) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted">
              Hover a row for what the phase means. “Waiting (TTFB)” combines network latency and
              server processing; the Server-Timing header below (if present) splits out the server
              part.
            </p>
          </div>
        </Card>
      )}

      {(j.trace.ids.length > 0 || j.serverTiming.length > 0) && (
        <Card title="Correlation and server timing" icon="search">
          <div className="flex flex-col gap-3">
            {j.trace.traceparent && (
              <p className="text-xs">
                <b>W3C trace</b> {j.trace.traceparent.sampled ? '(sampled)' : '(not sampled)'}
                <br />
                <span className="font-mono text-muted">
                  trace {j.trace.traceparent.traceId} · span {j.trace.traceparent.spanId}
                </span>
              </p>
            )}
            {j.trace.ids.length > 0 && (
              <dl className="divide-y divide-line">
                {j.trace.ids.map((t, i) => (
                  <div key={i} className="grid grid-cols-[minmax(110px,30%)_1fr] gap-2 py-1">
                    <dt className="break-all font-mono text-xs font-semibold text-accent">
                      {t.name} <span className="font-normal text-muted">({t.source})</span>
                    </dt>
                    <dd className="break-all font-mono text-xs">{t.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {j.serverTiming.length > 0 && (
              <div>
                <p className="section-title mb-1">Server-Timing</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {j.serverTiming.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono font-semibold">{s.name}</span>
                      {s.durationMs !== undefined && (
                        <span className="font-mono">{s.durationMs} ms</span>
                      )}
                      {s.description && <span className="text-muted">{s.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-muted">
        DevLens shows what Chrome reports for this one HTTP request. It cannot see raw packets or
        the routers between you and the server (like traceroute); the “intermediaries” are inferred
        from headers.
      </p>
    </div>
  );
}
