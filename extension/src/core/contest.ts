/**
 * Contest mode: the contest's phase and time from Codeforces' official API
 * (`contest.standings?contestId=…&count=1`), shown as a countdown in the IDE.
 */

export type ContestPhase = 'BEFORE' | 'CODING' | 'PENDING_SYSTEM_TEST' | 'SYSTEM_TEST' | 'FINISHED';

export interface ContestInfo {
  name: string;
  phase: ContestPhase;
  durationSeconds: number;
  /** Seconds since the start (negative before it), as of `fetchedAt`. */
  relativeTimeSeconds: number;
  /** Local time (ms) of the API answer; time is counted from it, so the local clock can be off. */
  fetchedAt: number;
}

const PHASES: readonly ContestPhase[] = ['BEFORE', 'CODING', 'PENDING_SYSTEM_TEST', 'SYSTEM_TEST', 'FINISHED'];

/** The contest from a `contest.standings` response, or null if it isn't one. */
export function parseContest(json: unknown, fetchedAt: number): ContestInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const { status, result } = json as Record<string, unknown>;
  if (status !== 'OK' || typeof result !== 'object' || result === null) return null;
  const contest = (result as Record<string, unknown>).contest;
  if (typeof contest !== 'object' || contest === null) return null;
  const c = contest as Record<string, unknown>;
  const phase = PHASES.find((p) => p === c.phase);
  if (!phase || typeof c.durationSeconds !== 'number' || !Number.isFinite(c.durationSeconds)) return null;
  const relative = typeof c.relativeTimeSeconds === 'number' && Number.isFinite(c.relativeTimeSeconds) ? c.relativeTimeSeconds : null;
  if (relative === null && (phase === 'BEFORE' || phase === 'CODING')) return null;
  return {
    name: typeof c.name === 'string' ? c.name.slice(0, 200) : '',
    phase,
    durationSeconds: c.durationSeconds,
    relativeTimeSeconds: relative ?? 0,
    fetchedAt,
  };
}

export type ContestClock =
  | { kind: 'before'; seconds: number }
  | { kind: 'running'; seconds: number }
  | { kind: 'over' }
  | { kind: 'testing' }
  | { kind: 'finished' };

/** Where the contest stands at local time `now` (ms). */
export function contestClock(info: ContestInfo, now: number): ContestClock {
  const elapsed = info.relativeTimeSeconds + Math.floor((now - info.fetchedAt) / 1000);
  if (info.phase === 'FINISHED') return { kind: 'finished' };
  if (info.phase === 'PENDING_SYSTEM_TEST' || info.phase === 'SYSTEM_TEST') return { kind: 'testing' };
  if (elapsed < 0) return { kind: 'before', seconds: -elapsed };
  if (elapsed < info.durationSeconds) return { kind: 'running', seconds: info.durationSeconds - elapsed };
  return { kind: 'over' };
}

/** "1:05:09", "05:09". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
