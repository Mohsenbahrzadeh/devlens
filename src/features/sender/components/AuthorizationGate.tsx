import { useState, type ReactNode } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';

const KEY = 'devlens-sender-authorized';

function isAuthorized(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Gates the Sender tool behind a one-time-per-session acknowledgement, since it sends real
 * network traffic. The flag lives in sessionStorage only (gone when the browser restarts) and
 * is never written to chrome.storage.
 */
export function AuthorizationGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(isAuthorized);
  const [checked, setChecked] = useState(false);

  if (ok) return <>{children}</>;

  return (
    <div className="card animate-rise flex flex-col gap-3 border-warn/30 bg-warn/5 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
          <Icon name="alert" size={20} />
        </span>
        <div>
          <h3 className="text-[15px] font-bold">Sender sends real requests</h3>
          <p className="mt-1 text-xs text-muted">
            Unlike the rest of DevLens, this tool makes outbound network requests from your browser
            — including repeated requests (Fuzz) and bursts of requests (Rate limit). Only point it
            at systems you own or are explicitly authorized to test. Sending unauthorized traffic to
            a system you do not control can be illegal.
          </p>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5 accent-[rgb(var(--warn))]"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>I own this target, or I am explicitly authorized to test it.</span>
      </label>
      <div>
        <Button
          variant="primary"
          disabled={!checked}
          onClick={() => {
            try {
              sessionStorage.setItem(KEY, '1');
            } catch {
              /* ignore */
            }
            setOk(true);
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
