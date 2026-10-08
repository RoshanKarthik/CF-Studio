/**
 * Messages between the content script (on the Codeforces page) and the IDE (an extension page
 * inside an iframe on top of it). The content script sends the page HTML, not parsed data, so the
 * IDE parses and sanitizes it itself: anything a page script manages to post still goes through
 * the sanitizer before it is rendered in the extension's origin. Likewise replies to submit and
 * status requests are treated as untrusted data by the IDE (checked, shown as text only).
 */
import type { LangId } from '../core/languages';

/**
 * IDE → page. Submit and status requests name only the problem index: the content script takes
 * the contest (and whether this is a problemset, contest or gym page) from its own page URL.
 */
export type IdeMessage =
  | { type: 'cfs:ready' }
  | { type: 'cfs:close' }
  /** Sent only after the user confirmed the submission in the IDE's dialog. */
  | { type: 'cfs:submit'; id: number; index: string; lang: LangId; code: string }
  /** The latest `count` entries of the user's `user.status`, filtered to this problem. */
  | { type: 'cfs:status'; id: number; index: string; count: number }
  /** Contest mode: the contest's phase and time (`contest.standings`, raw JSON). */
  | { type: 'cfs:contest'; id: number }
  /** Contest mode: the statements of all the contest's problems, from its /problems page. */
  | { type: 'cfs:problems'; id: number };

/** page → IDE: answer to `cfs:submit`. */
export type SubmitReply =
  | { type: 'cfs:submit-result'; id: number; ok: true; submissionId: number | null }
  | { type: 'cfs:submit-result'; id: number; ok: false; login: boolean; message: string };

/** page → IDE: answer to `cfs:status`. `data` is the raw API JSON; the IDE validates it. */
export type StatusReply =
  | { type: 'cfs:status-result'; id: number; ok: true; handle: string | null; data: unknown }
  | { type: 'cfs:status-result'; id: number; ok: false; message: string };

/** page → IDE: answer to `cfs:contest`. */
export type ContestReply =
  | { type: 'cfs:contest-result'; id: number; ok: true; data: unknown }
  | { type: 'cfs:contest-result'; id: number; ok: false; message: string };

/** page → IDE: answer to `cfs:problems`; `html` is parsed and sanitized by the IDE like the first page. */
export type ProblemsReply =
  | { type: 'cfs:problems-result'; id: number; ok: true; url: string; html: string }
  | { type: 'cfs:problems-result'; id: number; ok: false; message: string };

/** page → IDE: the IDE was shown or hidden (it stays loaded while hidden). */
export interface VisibleMessage {
  type: 'cfs:visible';
  visible: boolean;
}

export type PageMessage = InitMessage | SubmitReply | StatusReply | ContestReply | ProblemsReply | VisibleMessage;

/** page → IDE */
export interface InitMessage {
  type: 'cfs:init';
  url: string;
  html: string;
  /** Problem index to show first on a contest's all-problems page. */
  index: string | null;
}

/**
 * A Codeforces URL with this hash opens in the classic view: the IDE doesn't open by itself (the
 * launcher button and Alt+I still work). Used by "Show on Codeforces" for problems other than the
 * one the IDE was opened over.
 */
export const CLASSIC_VIEW_HASH = '#cf-studio=off';

/** Codeforces and its mirrors (m1.codeforces.com, …). */
export function isCodeforcesOrigin(origin: string): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*codeforces\.com$/.test(origin);
}
