/**
 * Stress testing: a generator makes random tests, a brute-force solution answers them, and the
 * real solution must agree, round after round, until a test shows a difference.
 */
import type { CheckOptions } from './checker';
import { judge } from './checker';
import type { CompileEvent, RunRequest, Runner, Source, TestEvent } from './runner';
import type { TestResult } from './types';

export interface StressConfig {
  solution: Source;
  brute: Source;
  gen: Source;
  timeLimitMs: number;
  memoryLimitMb: number;
  check: CheckOptions;
  /** Stop after this many tests if nothing differs. */
  maxTests: number;
  /** Seed of the first test; test i uses firstSeed + i. */
  firstSeed: number;
}

export type StressOutcome =
  /** The solution's answer differs from the brute force's (or it failed) on this test. */
  | { kind: 'found'; seed: number; input: string; expected: string; result: TestResult; tests: number }
  | { kind: 'passed'; tests: number }
  | { kind: 'stopped'; tests: number }
  /** A helper (or the solution) didn't compile, or a helper failed on a test. */
  | { kind: 'error'; who: 'generator' | 'brute force' | 'solution'; message: string; detail: string; seed?: number; input?: string; tests: number };

/** Generous limits for the helpers: they only need to finish, not be fast. */
const HELPER_TIME_MS = 10_000;
const HELPER_MEMORY_MB = 1024;

interface Collected {
  compile: CompileEvent | null;
  tests: Map<string, TestEvent>;
}

async function runAll(runner: Runner, req: RunRequest): Promise<Collected> {
  const out: Collected = { compile: null, tests: new Map() };
  await runner.run(req, (ev) => {
    if (ev.type === 'compile') out.compile = ev;
    else out.tests.set(ev.id, ev);
  });
  return out;
}

/** Why a helper's run doesn't count, or null if it ran fine. */
function helperFailure(ev: TestEvent | undefined): string | null {
  if (!ev) return 'produced no result';
  if (ev.timedOut) return `took longer than ${HELPER_TIME_MS / 1000} s`;
  if (ev.memoryExceeded) return `used more than ${HELPER_MEMORY_MB} MB`;
  if (ev.exitCode !== 0) return ev.detail ? `crashed: ${ev.detail}` : `exited with code ${ev.exitCode}`;
  return null;
}

/** Batch sizes: a small first round for quick feedback, then larger ones. */
export function batchSize(done: number): number {
  return done === 0 ? 10 : 50;
}

/**
 * Run rounds until a difference is found, `maxTests` pass, or `shouldStop()` says so (checked
 * between rounds). Helpers are compiled once by the runner and reused from its build cache.
 */
export async function stressTest(
  runner: Runner,
  cfg: StressConfig,
  onProgress: (tests: number) => void,
  shouldStop: () => boolean,
): Promise<StressOutcome> {
  let done = 0;
  while (done < cfg.maxTests) {
    if (shouldStop()) return { kind: 'stopped', tests: done };
    const size = Math.min(batchSize(done), cfg.maxTests - done);
    const seeds = Array.from({ length: size }, (_, i) => cfg.firstSeed + done + i);

    const gen = await runAll(runner, {
      ...cfg.gen,
      tests: seeds.map((s) => ({ id: `t${s}`, input: `${s}\n` })),
      timeLimitMs: HELPER_TIME_MS,
      memoryLimitMb: HELPER_MEMORY_MB,
    });
    if (!gen.compile?.ok) {
      return { kind: 'error', who: 'generator', message: "The generator doesn't compile.", detail: gen.compile?.output ?? '', tests: done };
    }
    const inputs: { id: string; seed: number; input: string }[] = [];
    for (const seed of seeds) {
      const ev = gen.tests.get(`t${seed}`);
      const why = helperFailure(ev);
      if (why) return { kind: 'error', who: 'generator', message: `The generator ${why} (seed ${seed}).`, detail: ev?.stderr ?? '', seed, tests: done };
      inputs.push({ id: `t${seed}`, seed, input: ev!.stdout });
    }
    if (shouldStop()) return { kind: 'stopped', tests: done };

    const tests = inputs.map(({ id, input }) => ({ id, input }));
    const sol = await runAll(runner, { ...cfg.solution, tests, timeLimitMs: cfg.timeLimitMs, memoryLimitMb: cfg.memoryLimitMb });
    if (!sol.compile?.ok) {
      return { kind: 'error', who: 'solution', message: "Your solution doesn't compile.", detail: sol.compile?.output ?? '', tests: done };
    }
    const brute = await runAll(runner, { ...cfg.brute, tests, timeLimitMs: HELPER_TIME_MS, memoryLimitMb: HELPER_MEMORY_MB });
    if (!brute.compile?.ok) {
      return { kind: 'error', who: 'brute force', message: "The brute force doesn't compile.", detail: brute.compile?.output ?? '', tests: done };
    }

    for (const t of inputs) {
      const b = brute.tests.get(t.id);
      const why = helperFailure(b);
      if (why) {
        return { kind: 'error', who: 'brute force', message: `The brute force ${why}.`, detail: b?.stderr ?? '', seed: t.seed, input: t.input, tests: done };
      }
      const s = sol.tests.get(t.id);
      if (!s) return { kind: 'error', who: 'solution', message: 'Your solution produced no result.', detail: '', seed: t.seed, input: t.input, tests: done };
      done++;
      const result = judge(s, b!.stdout, cfg.check, cfg.timeLimitMs);
      if (result.verdict !== 'AC' && result.verdict !== 'OK') {
        return { kind: 'found', seed: t.seed, input: t.input, expected: b!.stdout, result, tests: done };
      }
    }
    onProgress(done);
  }
  return { kind: 'passed', tests: done };
}
