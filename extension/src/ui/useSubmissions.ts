import { useCallback, useEffect, useState } from 'react';
import type { Judge, SubmitOutcome } from '../core/judge';
import type { Submission } from '../core/submissions';
import { findSubmitted, isPending, mergeSubmissions } from '../core/submissions';
import type { Problem } from '../core/types';

export interface SubmissionsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** null once loaded means nobody is logged in. */
  handle: string | null;
  items: Submission[];
  message: string;
}

export interface LiveSubmission {
  sent: SubmitOutcome;
  /** Latest state from Codeforces, once the submission shows up in `user.status`. */
  sub: Submission | null;
  /** Polling has stopped (final verdict, or gave up). */
  done: boolean;
  /** Why polling stopped without a verdict. */
  message: string;
}

/** How many of the user's latest submissions to read for the list, and while polling. */
const LIST_COUNT = 1000;
const POLL_COUNT = 10;
/** Codeforces' API allows one call every two seconds; the content script enforces it too. */
const POLL_MS = 2500;
const GIVE_UP_MS = 15 * 60_000;
const MAX_FAILURES = 8;

/**
 * The user's submissions for this problem (loaded when the Submissions tab is first opened) and
 * the live verdict of the one just submitted. Polling stops on a final verdict or when the IDE
 * goes away; while the IDE is hidden, the judge holds requests back.
 */
export function useSubmissions(judge: Judge, problem: Problem) {
  const [list, setList] = useState<SubmissionsState>({ status: 'idle', handle: null, items: [], message: '' });
  const [live, setLive] = useState<LiveSubmission | null>(null);

  const load = useCallback(async () => {
    setList((l) => ({ ...l, status: 'loading', message: '' }));
    try {
      const r = await judge.submissions(problem, LIST_COUNT);
      setList((l) => ({ status: 'ready', handle: r.handle, items: mergeSubmissions(l.items, r.items), message: '' }));
    } catch (e) {
      setList((l) => ({ ...l, status: 'error', message: e instanceof Error ? e.message : 'Couldn’t load submissions' }));
    }
  }, [judge, problem]);

  const track = useCallback((sent: SubmitOutcome) => setLive({ sent, sub: null, done: false, message: '' }), []);
  const dismiss = useCallback(() => setLive(null), []);

  const sent = live && !live.done ? live.sent : null;
  useEffect(() => {
    if (!sent) return;
    let stopped = false;
    const started = Date.now();
    const update = (patch: Partial<LiveSubmission>) => setLive((l) => (l && l.sent === sent ? { ...l, ...patch } : l));
    void (async () => {
      let failures = 0;
      while (!stopped) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (stopped) return;
        try {
          const r = await judge.submissions(problem, POLL_COUNT);
          if (stopped) return;
          failures = 0;
          if (r.handle === null) {
            update({ done: true, message: 'Logged out of Codeforces' });
            return;
          }
          const sub = findSubmitted(r.items, sent);
          if (sub) {
            setList((l) => (l.status === 'ready' ? { ...l, items: mergeSubmissions(l.items, [sub]) } : l));
            update({ sub, done: !isPending(sub) });
            if (!isPending(sub)) return;
          }
        } catch (e) {
          if (stopped) return;
          if (++failures >= MAX_FAILURES) {
            update({ done: true, message: e instanceof Error ? e.message : 'Lost contact with Codeforces' });
            return;
          }
        }
        if (Date.now() - started > GIVE_UP_MS) {
          update({ done: true, message: 'Stopped waiting for the verdict' });
          return;
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [sent, judge, problem]);

  return { list, load, live, track, dismiss };
}
