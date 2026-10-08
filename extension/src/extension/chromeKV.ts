import type { KV } from '../core/storage';

/** `KV` over chrome.storage.local, shared by every Codeforces tab. */
export class ChromeStorageKV implements KV {
  async get<T>(key: string): Promise<T | undefined> {
    const items = await chrome.storage.local.get(key);
    return items[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}
