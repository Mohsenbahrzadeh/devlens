/**
 * Preference storage. Only non-sensitive UI preferences may be written to chrome.storage.local.
 * Tool inputs (JWTs, JSON, headers, bodies) are never stored. Saved requests are an explicit,
 * opt-in feature that stores redacted data (see features/collections/redact.ts).
 *
 * Sender collections and environments are a separate, explicit opt-in (inside the already-gated
 * Sender tool): unlike saved requests, environment variable values are stored as typed — including
 * tokens you deliberately put there to test your own systems — since that is the point of an
 * environment. They are still local-only and never sent anywhere except in requests you send
 * yourself through Sender.
 */
import type { SavedRequest } from '@/features/collections/redact';
import type { Collection } from '@/features/sender/utils/collections';
import type { Environment } from '@/features/sender/utils/environments';

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

const COLLECTIONS_KEY = 'senderCollections';
const ENVIRONMENTS_KEY = 'senderEnvironments';
const ACTIVE_ENV_KEY = 'senderActiveEnvironment';

async function loadArray<T>(key: string): Promise<T[]> {
  try {
    if (hasLocal()) {
      const r = await chrome.storage.local.get(key);
      return Array.isArray(r[key]) ? (r[key] as T[]) : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}
async function storeArray<T>(key: string, items: T[]): Promise<void> {
  try {
    if (hasLocal()) await chrome.storage.local.set({ [key]: items });
  } catch {
    /* ignore */
  }
}

export const loadCollections = (): Promise<Collection[]> => loadArray<Collection>(COLLECTIONS_KEY);
export const storeCollections = (items: Collection[]): Promise<void> =>
  storeArray(COLLECTIONS_KEY, items);
export const loadEnvironments = (): Promise<Environment[]> =>
  loadArray<Environment>(ENVIRONMENTS_KEY);
export const storeEnvironments = (items: Environment[]): Promise<void> =>
  storeArray(ENVIRONMENTS_KEY, items);

export async function loadActiveEnvironmentId(): Promise<string | null> {
  try {
    if (hasLocal()) {
      const r = await chrome.storage.local.get(ACTIVE_ENV_KEY);
      return typeof r[ACTIVE_ENV_KEY] === 'string' ? r[ACTIVE_ENV_KEY] : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}
export async function storeActiveEnvironmentId(id: string | null): Promise<void> {
  try {
    if (hasLocal()) await chrome.storage.local.set({ [ACTIVE_ENV_KEY]: id });
  } catch {
    /* ignore */
  }
}

/**
 * Text selected on a page via the context menu. It lives in in-memory session storage only
 * and is deleted as soon as the side panel has read it.
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
