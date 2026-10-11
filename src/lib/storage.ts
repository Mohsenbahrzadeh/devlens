/**
 * Preference storage. Only non-sensitive UI preferences may be written to chrome.storage.local.
 * Tool inputs (JWTs, JSON, headers, bodies) are never stored. Saved requests are an explicit,
 * opt-in feature that stores redacted data (see features/collections/redact.ts).
 */
import type { SavedRequest } from '@/features/collections/redact';

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  tab: string;
  savedEnabled: boolean;
  defaultTarget: string;
};

const PREF_KEYS: (keyof Prefs)[] = ['theme', 'tab', 'savedEnabled', 'defaultTarget'];
const SAVED_KEY = 'savedRequests';

const hasLocal = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;
const hasSession = () => typeof chrome !== 'undefined' && !!chrome.storage?.session;

export async function loadPrefs(): Promise<Partial<Prefs>> {
  try {
    if (hasLocal()) return (await chrome.storage.local.get(PREF_KEYS)) as Partial<Prefs>;
  } catch {
    /* ignore */
  }
  return {};
}

export async function savePref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  try {
    if (hasLocal()) await chrome.storage.local.set({ [key]: value });
  } catch {
    /* ignore */
  }
}

export async function loadSavedRequests(): Promise<SavedRequest[]> {
  try {
    if (hasLocal()) {
      const r = await chrome.storage.local.get(SAVED_KEY);
      return Array.isArray(r[SAVED_KEY]) ? (r[SAVED_KEY] as SavedRequest[]) : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export async function storeSavedRequests(items: SavedRequest[]): Promise<void> {
  try {
    if (hasLocal()) await chrome.storage.local.set({ [SAVED_KEY]: items });
  } catch {
    /* ignore */
  }
}

export async function clearSavedRequests(): Promise<void> {
  try {
    if (hasLocal()) await chrome.storage.local.remove(SAVED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Text selected on a page via the context menu. It lives in in-memory session storage only
 * and is deleted as soon as the popup has read it.
 */
export async function takePendingSelection(): Promise<string | null> {
  try {
    if (!hasSession()) return null;
    const r = await chrome.storage.session.get('pending');
    await chrome.storage.session.remove('pending');
    try {
      await chrome.action?.setBadgeText({ text: '' });
    } catch {
      /* ignore */
    }
    return typeof r.pending === 'string' ? r.pending : null;
  } catch {
    return null;
  }
}
