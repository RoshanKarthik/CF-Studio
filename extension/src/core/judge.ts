import type { LangId } from './languages';
import { language } from './languages';
import type { Submission } from './submissions';
import type { Problem } from './types';

export interface SubmitOutcome {
  /** From Codeforces' redirect page; null if it couldn't be read (then matched by time). */
  submissionId: number | null;
  /** Local time of the submit, in seconds. */
  submittedAt: number;
}

/** A failed submit, with Codeforces' own message when there was one. */
export class SubmitError extends Error {
  constructor(
    message: string,
    /** The user isn't logged in; the UI offers a login link. */
    readonly login = false,
  ) {
    super(message);
  }
}

export interface SubmissionList {
  /** The logged-in user, or null when nobody is logged in. */
  handle: string | null;
  items: Submission[];
}

/** Talks to Codeforces: submits code and reads the user's submissions. */
export interface Judge {
  /** Rejects with SubmitError. Called only after the user confirmed in the submit dialog. */
  submit(problem: Problem, lang: LangId, code: string): Promise<SubmitOutcome>;
  /** The user's submissions for this problem, newest first; looks at the latest `count` overall. */
  submissions(problem: Problem, count: number): Promise<SubmissionList>;
  /** Where to see a submission, or null if there is nothing to link to. */
  submissionUrl(s: Submission): string | null;
  /** Codeforces' login page, coming back to this problem. */
  loginUrl(problem: Problem): string | null;
  /** Shown next to the verdict, e.g. "simulated". */
  note?: string;
}

/**
 * Stand-in for the preview page: nothing is sent anywhere. A submission waits in queue briefly,
 * runs through a few tests and is accepted, so every verdict view can be seen.
 */
export class SimulatedJudge implements Judge {
  readonly note = 'Preview — simulated, nothing was sent';
  private made: { id: number; at: number; lang: LangId; problem: Problem }[] = [];
  private nextId = 100_000_001;

  async submit(problem: Problem, lang: LangId, code: string): Promise<SubmitOutcome> {
    await sleep(500);
    if (!code.trim()) throw new SubmitError('Source code is empty (simulated).');
    const id = this.nextId++;
    this.made.push({ id, at: Date.now(), lang, problem });
    return { submissionId: id, submittedAt: Math.floor(Date.now() / 1000) };
  }

  async submissions(problem: Problem): Promise<SubmissionList> {
    await sleep(300);
    const contestId = Number(problem.contestId);
    const old: Submission = {
      id: 100_000_000,
      contestId,
      index: problem.index,
      createdAt: Math.floor(Date.now() / 1000) - 3 * 86400,
      language: 'C++20 (GCC 13-64)',
      verdict: 'WRONG_ANSWER',
      passedTests: 2,
      testset: 'TESTS',
      timeMs: 15,
      memoryBytes: 3_600_000,
    };
    const tests = 6;
    const live = this.made
      .filter((m) => m.problem.id === problem.id)
      .map((m): Submission => {
        const step = Math.floor((Date.now() - m.at) / 900) - 2;
        const done = step >= tests;
        return {
          id: m.id,
          contestId,
          index: problem.index,
          createdAt: Math.floor(m.at / 1000),
          language: language(m.lang).label,
          verdict: step < 0 ? null : done ? 'OK' : 'TESTING',
          passedTests: Math.max(0, Math.min(step, tests)),
          testset: 'TESTS',
          timeMs: done ? 46 : 0,
          memoryBytes: done ? 3_480_000 : 0,
        };
      });
    return { handle: 'preview', items: [...live.reverse(), old] };
  }

  submissionUrl(): string | null {
    return null;
  }

  loginUrl(): string | null {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
