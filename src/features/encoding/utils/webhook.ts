import { fail, ok, type Result } from '@/types/result';
import { hmacText } from './hash';

export const WEBHOOK_PROVIDERS = [
  { id: 'github', label: 'GitHub (X-Hub-Signature-256)', needsTimestamp: false },
  { id: 'stripe', label: 'Stripe (Stripe-Signature)', needsTimestamp: false },
  { id: 'slack', label: 'Slack (X-Slack-Signature)', needsTimestamp: true },
  { id: 'shopify', label: 'Shopify (X-Shopify-Hmac-Sha256, Base64)', needsTimestamp: false },
  { id: 'hex', label: 'Generic HMAC-SHA256 (hex)', needsTimestamp: false },
  { id: 'base64', label: 'Generic HMAC-SHA256 (Base64)', needsTimestamp: false },
] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number]['id'];

export interface WebhookInput {
  provider: WebhookProvider;
  /** The exact raw request body, byte for byte. */
  payload: string;
  secret: string;
  /** The signature header value as received. */
  signature: string;
  /** Slack only: the X-Slack-Request-Timestamp header. */
  timestamp?: string;
  /** Current time in ms, used for the Stripe/Slack replay-window warnings. */
  now?: number;
}

export interface WebhookOutcome {
  valid: boolean;
  computed: string;
  expected: string;
  message: string;
  warnings: string[];
}

const REPLAY_WINDOW_SECONDS = 300;

/** Constant-time string comparison (avoids leaking how many leading characters matched). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies a webhook signature locally (HMAC-SHA256 with the provider's signing scheme). */
export async function verifyWebhook(input: WebhookInput): Promise<Result<WebhookOutcome>> {
  const { provider, payload, secret } = input;
  const signature = input.signature.trim();
  if (!secret) return fail('Secret required', 'Enter the webhook signing secret.');
  if (!signature) return fail('Signature required', 'Paste the signature header value.');
  const warnings: string[] = [];
  const nowSeconds = (input.now ?? Date.now()) / 1000;

  let signed = payload;
  let expected = signature;
  let encoding: 'hex' | 'base64' = 'hex';

  if (provider === 'github') {
    const m = /^sha256=([0-9a-f]+)$/i.exec(signature);
    if (!m) return fail('Unexpected format', 'GitHub signatures look like "sha256=<hex>".');
    expected = m[1].toLowerCase();
  } else if (provider === 'stripe') {
    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    );
    if (!parts.t || !parts.v1) {
      return fail('Unexpected format', 'Stripe signatures look like "t=<timestamp>,v1=<hex>".');
    }
    signed = `${parts.t}.${payload}`;
    expected = parts.v1.toLowerCase();
    if (Math.abs(nowSeconds - Number(parts.t)) > REPLAY_WINDOW_SECONDS) {
      warnings.push(
        'The timestamp is outside the 5-minute tolerance. Stripe libraries reject this as a possible replay.',
      );
    }
  } else if (provider === 'slack') {
    const ts = (input.timestamp ?? '').trim();
    if (!ts) return fail('Timestamp required', 'Enter the X-Slack-Request-Timestamp header value.');
    const m = /^v0=([0-9a-f]+)$/i.exec(signature);
    if (!m) return fail('Unexpected format', 'Slack signatures look like "v0=<hex>".');
    signed = `v0:${ts}:${payload}`;
    expected = m[1].toLowerCase();
    if (Math.abs(nowSeconds - Number(ts)) > REPLAY_WINDOW_SECONDS) {
      warnings.push(
        'The timestamp is more than 5 minutes old. Slack recommends rejecting such requests.',
      );
    }
  } else if (provider === 'shopify' || provider === 'base64') {
    encoding = 'base64';
  } else {
    expected = signature.replace(/^sha256=/i, '').toLowerCase();
  }

  const mac = await hmacText('SHA-256', secret, signed);
  if (!mac.ok) return mac;
  const computed = encoding === 'base64' ? mac.value.base64 : mac.value.hex;
  const valid = safeEqual(computed, expected);
  if (!valid && /\r\n/.test(payload) === false && /\s$/.test(payload)) {
    warnings.push(
      'The payload ends with whitespace. The signature covers the raw body byte for byte, so a stray newline breaks it.',
    );
  }
  return ok({
    valid,
    computed,
    expected,
    warnings,
    message: valid
      ? 'Signature matches: the payload was signed with this secret.'
      : 'Signature does NOT match. Check the secret, that the body is the exact raw payload, and the signing scheme.',
  });
}
