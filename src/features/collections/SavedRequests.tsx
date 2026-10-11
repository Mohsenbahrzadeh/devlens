import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import type { HttpRequestSpec } from '@/features/http/types';
import { clearSavedRequests, loadSavedRequests, storeSavedRequests } from '@/lib/storage';
import { sanitizeForSave, type SavedRequest } from './redact';

interface Props {
  /** Returns the request currently in the form (or null when it is incomplete). */
  getSpec: () => HttpRequestSpec | null;
  onLoad: (req: SavedRequest) => void;
}

/**
 * Opt-in saved requests. Secret headers and secret query parameters are blanked before anything
 * is written; request bodies are stored only when the user ticks "Include body".
 */
export function SavedRequests({ getSpec, onLoad }: Props) {
  const [items, setItems] = useState<SavedRequest[]>([]);
  const [name, setName] = useState('');
  const [includeBody, setIncludeBody] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    void loadSavedRequests().then(setItems);
  }, []);

  const persist = (next: SavedRequest[]) => {
    setItems(next);
    void storeSavedRequests(next);
  };

  const save = () => {
    const spec = getSpec();
    if (!spec) {
      setNote('Enter a URL first.');
      return;
    }
    persist([sanitizeForSave(spec, name, includeBody), ...items].slice(0, 50));
    setName('');
    setNote('Saved. Secret headers and tokens in the URL were removed.');
  };

  return (
    <Card title="Saved requests" icon="download">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            aria-label="Request name"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button icon="plus" onClick={save}>
            Save
          </Button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-[rgb(var(--accent))]"
            checked={includeBody}
            onChange={(e) => setIncludeBody(e.target.checked)}
          />
          Include the body (stored only on this device)
        </label>
        {note && (
          <p role="status" className="text-xs text-muted">
            {note}
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-xs text-muted">Nothing saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2 py-1"
              >
                <span className="w-14 shrink-0 font-mono text-[10px] font-bold text-accent">
                  {r.method}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs" title={r.url}>
                  {r.name}
                </span>
                <Button className="!px-2 !py-0.5 text-xs" onClick={() => onLoad(r)}>
                  Load
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-0.5 text-xs"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => persist(items.filter((x) => x.id !== r.id))}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setItems([]);
                void clearSavedRequests();
              }}
            >
              Delete all saved requests
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
