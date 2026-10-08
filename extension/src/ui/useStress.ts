import { useCallback, useEffect, useRef, useState } from 'react';
import type { Runner } from '../core/runner';
import type { StressConfig, StressOutcome } from '../core/stress';
import { stressTest } from '../core/stress';

export interface StressState {
  running: boolean;
  /** Tests that agreed so far in the current (or last) session. */
  tests: number;
  outcome: StressOutcome | null;
}

/** Runs a stress test in the background; stopped when asked or when the IDE goes away. */
export function useStress(runner: Runner) {
  const [state, setState] = useState<StressState>({ running: false, tests: 0, outcome: null });
  const stopRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const start = useCallback(
    async (cfg: Omit<StressConfig, 'firstSeed'>) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopRef.current = false;
      setState({ running: true, tests: 0, outcome: null });
      // A fresh random range each session, so repeated sessions try new tests.
      const firstSeed = 1 + Math.floor(Math.random() * 1e9);
      let outcome: StressOutcome;
      try {
        outcome = await stressTest(
          runner,
          { ...cfg, firstSeed },
          (tests) => setState((s) => ({ ...s, tests })),
          () => stopRef.current,
        );
      } catch (e) {
        outcome = { kind: 'error', who: 'solution', message: e instanceof Error ? e.message : 'The runner failed', detail: '', tests: 0 };
      }
      runningRef.current = false;
      setState({ running: false, tests: outcome.tests, outcome });
    },
    [runner],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { state, start, stop };
}
