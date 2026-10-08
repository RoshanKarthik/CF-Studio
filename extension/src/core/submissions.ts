/**
 * The user's submissions, from Codeforces' official API (`user.status`). The response comes from
 * the page side, so every field is checked before it is used; nothing here is rendered as HTML.
 */

export interface Submission {
  id: number;
  contestId: number;
  index: string;
  /** Seconds since the epoch (Codeforces' clock). */
  createdAt: number;
  language: string;
  /** Codeforces' verdict ("OK", "WRONG_ANSWER", "TESTING", …); null while in queue. */
  verdict: string | null;
  passedTests: number;
  /** "TESTS", "PRETESTS", … */
  testset: string;
  timeMs: number;
  memoryBytes: number;
}

export type StatusResult = { ok: true; items: Submission[] } | { ok: false; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const int = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fallback);
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Keep only this problem's entries of a raw `user.status` response (to send less data around). */
export function filterForProblem(json: unknown, contestId: string, index: string): unknown {
  if (!isObj(json) || !Array.isArray(json.result)) return json;
  const wanted = index.toUpperCase();
  return {
    status: json.status,
    result: json.result.filter(
      (s) => isObj(s) && isObj(s.problem) && String(s.problem.contestId) === contestId && String(s.problem.index).toUpperCase() === wanted,
    ),
  };
}

/** Parse a `user.status` response into this problem's submissions, newest first. */
export function parseUserStatus(json: unknown, problem: { contestId: string; index: string }): StatusResult {
  if (!isObj(json)) return { ok: false, message: 'Codeforces sent an unexpected answer.' };
  if (json.status !== 'OK') {
    return { ok: false, message: str(json.comment, 300) || 'The Codeforces API returned an error.' };
  }
  if (!Array.isArray(json.result)) return { ok: false, message: 'Codeforces sent an unexpected answer.' };
  const wanted = problem.index.toUpperCase();
  const items: Submission[] = [];
  for (const raw of json.result) {
    if (!isObj(raw) || !isObj(raw.problem)) continue;
    const id = int(raw.id);
    const contestId = int(raw.problem.contestId, int(raw.contestId));
    const index = str(raw.problem.index, 8).toUpperCase();
    if (!id || String(contestId) !== problem.contestId || index !== wanted) continue;
    items.push({
      id,
      contestId,
      index,
      createdAt: int(raw.creationTimeSeconds),
      language: str(raw.programmingLanguage) || '?',
      verdict: typeof raw.verdict === 'string' && /^[A-Z_]{1,40}$/.test(raw.verdict) ? raw.verdict : null,
      passedTests: int(raw.passedTestCount),
      testset: /^[A-Z0-9_]{1,20}$/.test(str(raw.testset)) ? str(raw.testset) : 'TESTS',
      timeMs: int(raw.timeConsumedMillis),
      memoryBytes: int(raw.memoryConsumedBytes),
    });
  }
  items.sort((a, b) => b.id - a.id);
  return { ok: true, items };
}

/** Insert or replace by id, newest first. */
export function mergeSubmissions(list: readonly Submission[], updates: readonly Submission[]): Submission[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  for (const s of updates) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/** Still being judged: in queue or running. */
export function isPending(s: Pick<Submission, 'verdict'>): boolean {
  return s.verdict === null || s.verdict === 'TESTING';
}

const NAMES: Record<string, string> = {
  OK: 'Accepted',
  FAILED: 'Judgement failed',
  PARTIAL: 'Partial result',
  COMPILATION_ERROR: 'Compilation error',
  RUNTIME_ERROR: 'Runtime error',
  WRONG_ANSWER: 'Wrong answer',
  PRESENTATION_ERROR: 'Presentation error',
  TIME_LIMIT_EXCEEDED: 'Time limit exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded',
  IDLENESS_LIMIT_EXCEEDED: 'Idleness limit exceeded',
  SECURITY_VIOLATED: 'Security violated',
  CRASHED: 'Judgement crashed',
  INPUT_PREPARATION_CRASHED: 'Input preparation crashed',
  CHALLENGED: 'Hacked',
  SKIPPED: 'Skipped',
  REJECTED: 'Rejected',
};

/** Verdicts that name the test they failed on. */
const ON_TEST = new Set([
  'RUNTIME_ERROR',
  'WRONG_ANSWER',
  'PRESENTATION_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'IDLENESS_LIMIT_EXCEEDED',
  'SECURITY_VIOLATED',
]);

/** As Codeforces words it: "In queue", "Running on test 4", "Wrong answer on pretest 2", "Pretests passed". */
export function verdictText(s: Pick<Submission, 'verdict' | 'passedTests' | 'testset'>): string {
  const test = s.testset === 'PRETESTS' ? 'pretest' : 'test';
  if (s.verdict === null) return 'In queue';
  if (s.verdict === 'TESTING') return `Running on ${test} ${s.passedTests + 1}`;
  if (s.verdict === 'OK' && s.testset === 'PRETESTS') return 'Pretests passed';
  const name = NAMES[s.verdict] ?? s.verdict.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return ON_TEST.has(s.verdict) ? `${name} on ${test} ${s.passedTests + 1}` : name;
}

export type VerdictTone = 'ok' | 'bad' | 'pending' | 'neutral';

export function verdictTone(s: Pick<Submission, 'verdict'>): VerdictTone {
  if (isPending(s)) return 'pending';
  if (s.verdict === 'OK') return 'ok';
  if (s.verdict === 'SKIPPED' || s.verdict === 'PARTIAL') return 'neutral';
  return 'bad';
}

/** "46 ms" / "3.4 MB" / "512 KB", like the status table. */
export function formatMemory(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  return kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${kb} KB`;
}

/** Link to a submission on the given Codeforces origin; gym contests have ids from 100000. */
export function submissionPath(s: Pick<Submission, 'id' | 'contestId'>): string {
  return `/${s.contestId >= 100000 ? 'gym' : 'contest'}/${s.contestId}/submission/${s.id}`;
}

/**
 * The submission just made: by id when the submit response named it, else the newest one for
 * this problem created after the submit (allowing for the local clock being off).
 */
export function findSubmitted(
  items: readonly Submission[],
  sent: { submissionId: number | null; submittedAt: number },
): Submission | null {
  if (sent.submissionId !== null) return items.find((s) => s.id === sent.submissionId) ?? null;
  const recent = items.filter((s) => s.createdAt >= sent.submittedAt - 300);
  return recent.length ? recent.reduce((a, b) => (b.id > a.id ? b : a)) : null;
}
