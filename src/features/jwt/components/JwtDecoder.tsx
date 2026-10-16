import { useState } from 'react';
import type { ToolProps } from '@/app/seed';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Guide } from '@/components/Guide';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { JsonTree } from '@/components/JsonTree';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import type { AppError, Result } from '@/types/result';
import type { DecodedJwt } from '../types';
import { reviewToken } from '../utils/security';
import { KNOWN_CLAIMS, decodeJwt, extractToken, getTimeInfo } from '../utils/token';
import { signJwt, verifyJwt, type VerifyOutcome } from '../utils/verify';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface2/70 px-2.5 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs">{value}</dd>
    </div>
  );
}

function VerifyCard({ token, alg }: { token: string; alg: string }) {
  const [key, setKey] = useState('');
  const [isBase64, setIsBase64] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const symmetric = alg.startsWith('HS');

  const run = async () => {
    const r = await verifyJwt(token, key, { secretIsBase64: isBase64 });
    setOutcome(r.ok ? r.value : null);
    setError(r.ok ? null : r.error);
  };

  return (
    <Card title="Verify signature" icon="shield">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          Checked locally with Web Crypto. Algorithm:{' '}
          <b className="font-mono text-fg">{alg || '—'}</b>.{' '}
          {symmetric
            ? 'Enter the shared secret.'
            : 'Paste the issuer’s PUBLIC key (PEM “BEGIN PUBLIC KEY”), a JWK, or a whole JWKS (the key is picked by the token’s kid). Never paste a private key.'}
        </p>
        {symmetric ? (
          <Input
            type="password"
            aria-label="Shared secret"
            autoComplete="off"
            placeholder="Shared secret"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        ) : (
          <TextArea
            label="Public key (PEM, JWK or JWKS)"
            rows={4}
            placeholder={'-----BEGIN PUBLIC KEY-----\n...'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
        {symmetric && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="accent-[rgb(var(--accent))]"
              checked={isBase64}
              onChange={(e) => setIsBase64(e.target.checked)}
            />
            Secret is Base64 / Base64URL encoded
          </label>
        )}
        <div>
          <Button variant="primary" icon="shield" onClick={() => void run()}>
            Verify
          </Button>
        </div>
        {outcome && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-xl border p-2.5 ${
              outcome.valid ? 'border-good/30 bg-good/10' : 'border-bad/30 bg-bad/10'
            }`}
          >
            <StatusBadge tone={outcome.valid ? 'good' : 'bad'}>
              {outcome.valid ? 'Signature valid' : 'Signature invalid'}
            </StatusBadge>
            <span className="text-xs">{outcome.message}</span>
          </div>
        )}
        {error && <ErrorMessage error={error} />}
      </div>
    </Card>
  );
}

function Decode({ seed }: { seed?: string }) {
  const [input, setInput] = useState(seed ?? '');
  const [result, setResult] = useState<Result<DecodedJwt> | null>(() =>
    seed?.trim() ? decodeJwt(seed) : null,
  );

  const decode = () => setResult(input.trim() ? decodeJwt(input) : null);
  const clear = () => {
    setInput('');
    setResult(null);
  };
  useCtrlEnter(decode);

  const decoded = result?.ok ? result.value : null;
  const time = decoded ? getTimeInfo(decoded.payload) : null;
  const notes = decoded ? reviewToken(decoded.header, decoded.payload) : [];
  const parts = decoded ? extractToken(input).split('.') : [];

  return (
    <div className="flex flex-col gap-3">
      <TextArea
        label="JSON Web Token"
        rows={4}
        placeholder="Paste JWT token here..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" icon="sparkles" onClick={decode}>
          Decode
        </Button>
        <Button icon="eraser" onClick={clear}>
          Clear
        </Button>
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/10 p-2.5 text-xs">
        <Icon name="lock" size={14} className="mt-0.5 text-accent" />
        <span>
          Decoding happens locally; your token is never uploaded.{' '}
          <strong className="text-accent">Signature is not verified</strong> unless you use the
          verify section below.
        </span>
      </p>

      {result && !result.ok && <ErrorMessage error={result.error} />}
      {!result && <EmptyState icon="key">Paste a token and press Decode to inspect it.</EmptyState>}

      {decoded && time && (
        <>
          <Card title="Token status" icon="clock">
            <div className="flex flex-col gap-3">
              {time.exp ? (
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
                      time.exp.status === 'valid' ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
                    }`}
                  >
                    <Icon name={time.exp.status === 'valid' ? 'check' : 'x'} size={22} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {time.exp.status === 'valid' ? (
                        <StatusBadge tone="good">Valid</StatusBadge>
                      ) : (
                        <StatusBadge tone="bad">Expired</StatusBadge>
                      )}
                      <span className="text-sm font-semibold">
                        {time.exp.status === 'valid'
                          ? `${time.exp.relative} remaining`
                          : time.exp.relative}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted">
                      {time.exp.status === 'valid' ? 'Expires' : 'Expired'} {time.exp.date}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted">No exp claim: this token does not expire.</p>
              )}
              {(time.nbf || time.iat) && (
                <dl className="grid grid-cols-2 gap-2">
                  {time.nbf && (
                    <div className="rounded-lg bg-surface2/70 px-2.5 py-1.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Not before
                      </dt>
                      <dd className="mt-0.5 font-mono text-xs">{time.nbf.date}</dd>
                      <dd className="mt-1">
                        {time.nbf.status === 'not-yet-active' ? (
                          <StatusBadge tone="warn">Not active yet</StatusBadge>
                        ) : (
                          <StatusBadge tone="good">Active</StatusBadge>
                        )}
                      </dd>
                    </div>
                  )}
                  {time.iat && <Fact label="Issued at" value={time.iat.date} />}
                </dl>
              )}
              <p className="text-[11px] text-muted">Times are shown in your local timezone.</p>
            </div>
          </Card>

          {notes.length > 0 && (
            <Card title="Security review" icon="alert">
              <ul className="flex flex-col gap-1.5">
                {notes.map((n) => (
                  <li key={n.text} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0">
                      <StatusBadge tone={n.level === 'warn' ? 'warn' : 'info'}>
                        {n.level === 'warn' ? 'Warning' : 'Note'}
                      </StatusBadge>
                    </span>
                    <span className="pt-0.5">{n.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <VerifyCard token={extractToken(input)} alg={String(decoded.header.alg ?? '')} />

          <Card title="Token anatomy" icon="key">
            <p className="break-all font-mono text-xs leading-relaxed" aria-label="Token segments">
              <span className="text-bad">{parts[0]}</span>
              <span className="text-muted">.</span>
              <span className="text-accent2">{parts[1]}</span>
              <span className="text-muted">.</span>
              <span className="text-accent">{parts[2]}</span>
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>
                <b className="text-bad">●</b> Header
              </span>
              <span>
                <b className="text-accent2">●</b> Payload
              </span>
              <span>
                <b className="text-accent">●</b> Signature
              </span>
            </p>
          </Card>

          <Card
            title="Header"
            icon="code"
            actions={
              <CopyButton text={JSON.stringify(decoded.header, null, 2)} label="Copy JSON" />
            }
          >
            <JsonTree value={decoded.header} />
          </Card>

          <Card
            title="Payload"
            icon="code"
            actions={
              <CopyButton text={JSON.stringify(decoded.payload, null, 2)} label="Copy JSON" />
            }
          >
            <JsonTree value={decoded.payload} hints={KNOWN_CLAIMS} />
          </Card>
        </>
      )}
    </div>
  );
}

const ALGS = ['HS256', 'HS384', 'HS512'] as const;

function Create({ onOpen }: { onOpen: (token: string) => void }) {
  const [header, setHeader] = useState('{\n  "typ": "JWT"\n}');
  const [payload, setPayload] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify(
      { sub: '1234567890', name: 'Test User', iat: now, exp: now + 3600 },
      null,
      2,
    );
  });
  const [alg, setAlg] = useState<(typeof ALGS)[number]>('HS256');
  const [secret, setSecret] = useState('');
  const [isBase64, setIsBase64] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  const sign = async () => {
    const r = await signJwt({ header, payload, secret, alg, secretIsBase64: isBase64 });
    setToken(r.ok ? r.value : '');
    setError(r.ok ? null : r.error);
  };
  useCtrlEnter(() => void sign());

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/10 p-2.5 text-xs">
        <Icon name="lock" size={14} className="mt-0.5 text-accent" />
        <span>
          Creates HMAC-signed test tokens locally. Use throwaway secrets, not production keys.
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <TextArea
          label="Header (JSON)"
          rows={5}
          value={header}
          onChange={(e) => setHeader(e.target.value)}
        />
        <TextArea
          label="Payload (JSON)"
          rows={5}
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <select
          aria-label="Algorithm"
          value={alg}
          onChange={(e) => setAlg(e.target.value as (typeof ALGS)[number])}
          className="field w-28 shrink-0 font-mono"
        >
          {ALGS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <Input
          type="password"
          aria-label="Signing secret"
          autoComplete="off"
          placeholder="Signing secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="accent-[rgb(var(--accent))]"
          checked={isBase64}
          onChange={(e) => setIsBase64(e.target.checked)}
        />
        Secret is Base64 / Base64URL encoded
      </label>
      <div className="flex items-center gap-2">
        <Button variant="primary" icon="key" onClick={() => void sign()}>
          Sign token
        </Button>
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>
      {error && <ErrorMessage error={error} />}
      {token && (
        <Card
          title="Signed token"
          icon="key"
          actions={
            <div className="flex gap-1.5">
              <Button className="!px-2.5 !py-1 text-xs" onClick={() => onOpen(token)}>
                Open in decoder
              </Button>
              <CopyButton text={token} />
            </div>
          }
        >
          <p className="break-all font-mono text-xs">{token}</p>
        </Card>
      )}
    </div>
  );
}

const JWT_GUIDE = {
  en: {
    what: 'Decodes a JWT (header + payload) entirely in your browser, highlights claim meanings and expiry, checks common security pitfalls, verifies a signature, and can create a test token signed with your own secret or key.',
    steps: [
      'Paste a token (raw, "Bearer <token>", or a quoted/escaped value is fine — DevLens extracts it).',
      'Read the decoded header/payload and the exp/nbf/iat status shown in your local time.',
      'Open "Verify" and paste the matching secret (HS*) or public key / JWK (RS*/PS*/ES*) to check the signature.',
      'Switch to "Create test token" to sign your own payload with an HMAC secret for local testing.',
    ],
    example:
      'Paste: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MzAwMDAwMDB9.dGVzdA\n→ DevLens shows header {"alg":"HS256"}, payload {"sub":"123","exp":...} and flags whether it has expired.',
    useCase:
      'Debugging an auth bug ("why is this API returning 401?"), inspecting a token a teammate sent you, or signing a throwaway token to test an endpoint locally — all without sending the token anywhere.',
  },
  fa: {
    what: 'یک JWT (هدر + payload) را کاملاً داخل مرورگر خودتان رمزگشایی می‌کند، معنی claimها و زمان انقضا را نشان می‌دهد، چند مشکل امنیتی رایج را بررسی می‌کند، امضا را تأیید می‌کند و می‌تواند یک توکن آزمایشی با کلید/رمز خودتان بسازد.',
    steps: [
      'توکن را پیست کنید (خام، به‌صورت "Bearer <token>"، یا حتی داخل گیومه — DevLens خودش استخراج می‌کند).',
      'هدر/payload رمزگشایی‌شده و وضعیت exp/nbf/iat را به وقت محلی خودتان ببینید.',
      'بخش «Verify» را باز کنید و رمز مشترک (HS*) یا کلید عمومی/JWK (RS*/PS*/ES*) را برای بررسی امضا وارد کنید.',
      'به «Create test token» بروید تا یک payload دلخواه را با یک رمز HMAC امضا کنید، برای تست محلی.',
    ],
    example:
      'پیست کنید: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MzAwMDAwMDB9.dGVzdA\n← DevLens هدر {"alg":"HS256"}، payload {"sub":"123","exp":...} را نشان می‌دهد و می‌گوید آیا منقضی شده یا نه.',
    useCase:
      'وقتی می‌خواهید بفهمید چرا یک API خطای ۴۰۱ می‌دهد، وقتی یک همکار توکنی برایتان فرستاده و می‌خواهید محتوایش را ببینید، یا وقتی می‌خواهید یک توکن آزمایشی برای تست محلی یک اندپوینت بسازید — بدون اینکه توکن جایی ارسال شود.',
  },
};

export function JwtDecoder({ seed }: ToolProps) {
  const [mode, setMode] = useState<'decode' | 'create'>('decode');
  const [opened, setOpened] = useState<string | undefined>(seed);
  const [nonce, setNonce] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <Guide en={JWT_GUIDE.en} fa={JWT_GUIDE.fa} />
      <Tabs
        tabs={[
          { id: 'decode', label: 'Decode & verify', icon: 'sparkles' },
          { id: 'create', label: 'Create test token', icon: 'key' },
        ]}
        active={mode}
        onChange={(m) => setMode(m as 'decode' | 'create')}
        label="JWT modes"
        size="sm"
      />
      {mode === 'decode' ? (
        <Decode key={nonce} seed={opened} />
      ) : (
        <Create
          onOpen={(t) => {
            setOpened(t);
            setNonce((n) => n + 1);
            setMode('decode');
          }}
        />
      )}
    </div>
  );
}
