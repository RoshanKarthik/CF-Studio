/**
 * Messages between the content script (on the Codeforces page) and the IDE (an extension page
 * inside an iframe on top of it). The content script sends the page HTML, not parsed data, so the
 * IDE parses and sanitizes it itself: anything a page script manages to post still goes through
 * the sanitizer before it is rendered in the extension's origin.
 */

/** IDE → page */
export type IdeMessage = { type: 'cfs:ready' } | { type: 'cfs:close' };

/** page → IDE */
export interface InitMessage {
  type: 'cfs:init';
  url: string;
  html: string;
  /** Problem index to show first on a contest's all-problems page. */
  index: string | null;
}

/** Codeforces and its mirrors (m1.codeforces.com, …). */
export function isCodeforcesOrigin(origin: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*codeforces\.com$/.test(origin);
}
