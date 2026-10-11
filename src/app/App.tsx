import { useEffect, useState } from 'react';
import { Icon, Logo, type IconName } from '@/components/Icon';
import { Tabs } from '@/components/Tabs';
import { detectInput } from '@/features/encoding/utils/detect';
import { TARGET_IDS, TARGET_LABELS, type Target } from '@/features/http/components/HttpTools';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { clearSavedRequests, loadPrefs, savePref, takePendingSelection } from '@/lib/storage';
import { About } from './About';
import { Footer } from './Footer';
import { routes } from './routes';

const THEMES: { id: Theme; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

interface Seed {
  tool: string;
  sub?: string;
  text: string;
}

export default function App() {
  const [active, setActive] = useState(routes[0].id);
  const [theme, setTheme] = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [defaultTarget, setDefaultTarget] = useState<Target>('curl');
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void (async () => {
      const prefs = await loadPrefs();
      if (prefs.tab && routes.some((r) => r.id === prefs.tab)) setActive(prefs.tab);
      setSavedEnabled(prefs.savedEnabled === true);
      if (prefs.defaultTarget && TARGET_IDS.includes(prefs.defaultTarget as Target)) {
        setDefaultTarget(prefs.defaultTarget as Target);
      }
      // Text selected on a page via the context menu (in-memory only, read once).
      const text = await takePendingSelection();
      if (text) {
        const d = detectInput(text);
        setActive(d.tool);
        setSeed({ tool: d.tool, sub: 'sub' in d ? d.sub : undefined, text });
      }
    })();
  }, []);

  const change = (id: string) => {
    setActive(id);
    void savePref('tab', id);
  };

  const Active = routes.find((r) => r.id === active)?.component ?? routes[0].component;
  const activeSeed = seed && seed.tool === active ? seed : null;

  return (
    <div className="flex h-screen w-full flex-col">
      <div
        aria-hidden="true"
        className="h-[3px] w-full bg-gradient-to-r from-accent via-accent2 to-accent"
      />
      <header className="flex items-center justify-between px-4 pb-1 pt-3">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <div className="leading-tight">
            <h1 className="text-[17px] font-extrabold tracking-tight">
              Dev
              <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
                Lens
              </span>
            </h1>
            <p className="flex items-center gap-1 text-[10px] font-medium text-muted">
              <Icon name="shield" size={10} className="text-good" />
              100% local · offline · private
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings(!showSettings)}
          className={`grid h-8 w-8 place-items-center rounded-lg border transition ${
            showSettings
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-line bg-surface text-muted hover:text-fg'
          }`}
        >
          <Icon name="settings" size={16} />
        </button>
      </header>

      {showSettings && (
        <div className="card animate-rise mx-4 mt-1 flex max-h-[300px] flex-col gap-3 overflow-y-auto p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span id="theme-label" className="section-title">
              Theme
            </span>
            <div role="radiogroup" aria-labelledby="theme-label" className="flex gap-1">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    theme === t.id
                      ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
                      : 'text-muted hover:bg-surface2 hover:text-fg'
                  }`}
                >
                  <Icon name={t.icon} size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="default-target" className="section-title">
              Default HTTP output
            </label>
            <select
              id="default-target"
              value={defaultTarget}
              onChange={(e) => {
                const t = e.target.value as Target;
                setDefaultTarget(t);
                void savePref('defaultTarget', t);
              }}
              className="field !w-auto"
            >
              {TARGET_IDS.map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface2/50 p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 accent-[rgb(var(--accent))]"
                checked={savedEnabled}
                onChange={(e) => {
                  setSavedEnabled(e.target.checked);
                  void savePref('savedEnabled', e.target.checked);
                }}
              />
              <span>
                <b>Enable saved requests</b> (off by default)
                <span className="block text-muted">
                  Stores method, URL and non-secret headers on this device. Authorization, cookies,
                  API keys and token query parameters are always removed; bodies only if you choose.
                </span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void clearSavedRequests().then(() => setCleared(true));
                }}
                className="text-xs font-medium text-bad underline underline-offset-2"
              >
                Delete all saved requests
              </button>
              {cleared && (
                <span role="status" className="text-xs text-good">
                  ✓ Deleted
                </span>
              )}
            </div>
          </div>

          <p className="flex items-center gap-1 text-[11px] text-muted">
            <Icon name="lock" size={11} /> Tool inputs are never stored. Shortcut: Ctrl+Shift+L
            (change it at chrome://extensions/shortcuts).
          </p>
          <About />
        </div>
      )}

      <nav className="px-4 pt-2">
        <Tabs tabs={routes} active={active} onChange={change} label="DevLens tools" />
      </nav>
      <main
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3"
      >
        <Active
          key={`${active}-${activeSeed ? 'seeded' : 'plain'}`}
          seed={activeSeed?.text}
          sub={activeSeed?.sub}
        />
      </main>
      <Footer />
    </div>
  );
}
