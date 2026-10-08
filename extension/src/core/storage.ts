/**
 * Async key-value store. The preview page uses localStorage; the extension will use
 * chrome.storage.local (same interface), so the UI never touches either directly.
 */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStorageKV implements KV {
  constructor(private readonly prefix = 'cfstudio:') {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the session still works, it just won't persist.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      // ignore
    }
  }
}

/** In-memory store, for tests. */
export class MemoryKV implements KV {
  private readonly data = new Map<string, string>();

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.data.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/** Storage keys, in one place so the extension migration later is easy to audit. */
export const keys = {
  code: (problemId: string, family: string) => `code:${problemId}:${family}`,
  manualTests: (problemId: string) => `manual:${problemId}`,
  timer: (problemId: string) => `timer:${problemId}`,
  templates: 'templates',
  settings: 'settings',
  layout: 'layout',
};
