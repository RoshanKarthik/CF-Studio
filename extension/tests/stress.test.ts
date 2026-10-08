import { describe, expect, it } from 'vitest';
import type { RunEvent, RunRequest, Runner } from '../src/core/runner';
import type { StressConfig } from '../src/core/stress';
import { stressTest } from '../src/core/stress';

type Program = (input: string) => { stdout: string; exitCode?: number; timedOut?: boolean };

/** A runner whose "programs" are JS functions, chosen by the code string. */
class FakeRunner implements Runner {
  calls: RunRequest[] = [];
  constructor(private readonly programs: Record<string, Program | 'CE'>) {}
  async status() {
    return { connected: true, detail: 'fake' };
  }
  async run(req: RunRequest, onEvent: (e: RunEvent) => void) {
    this.calls.push(req);
    const p = this.programs[req.code];
    if (p === 'CE') {
      onEvent({ type: 'compile', ok: false, output: 'error: nope', timeMs: 1 });
      return;
    }
    onEvent({ type: 'compile', ok: true, output: '', timeMs: 1 });
    for (const t of req.tests) {
      const r = p(t.input);
      onEvent({
        type: 'test',
        id: t.id,
        stdout: r.stdout,
        stderr: '',
        exitCode: r.timedOut ? null : (r.exitCode ?? 0),
        timeMs: 1,
        memoryKb: 1,
        timedOut: Boolean(r.timedOut),
        memoryExceeded: false,
      });
    }
  }
}

// The generator prints its seed; the brute force doubles it; solutions vary.
const programs: Record<string, Program | 'CE'> = {
  gen: (seed) => ({ stdout: seed }),
  brute: (x) => ({ stdout: `${Number(x) * 2}\n` }),
  good: (x) => ({ stdout: `${Number(x) * 2}\n` }),
  badAt7: (x) => ({ stdout: `${Number(x) === 7 ? 0 : Number(x) * 2}\n` }),
  genCrashAt3: (seed) => (Number(seed) === 3 ? { stdout: '', exitCode: 1 } : { stdout: seed }),
  bruteSlow: () => ({ stdout: '', timedOut: true }),
  broken: 'CE',
};

const cfg = (solution: string, extra: Partial<StressConfig> = {}): StressConfig => ({
  solution: { lang: 'cpp20', code: solution },
  gen: { lang: 'cpp20', code: 'gen' },
  brute: { lang: 'python3', code: 'brute' },
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  check: { floatEps: null, multipleAnswers: false },
  maxTests: 100,
  firstSeed: 1,
  ...extra,
});

describe('stressTest', () => {
  it('passes when every test agrees, in batches', async () => {
    const runner = new FakeRunner(programs);
    const progress: number[] = [];
    const r = await stressTest(runner, cfg('good', { maxTests: 70 }), (n) => progress.push(n), () => false);
    expect(r).toEqual({ kind: 'passed', tests: 70 });
    expect(progress).toEqual([10, 60, 70]);
    // generator, solution and brute force per batch; the generator gets the seed on stdin
    expect(runner.calls).toHaveLength(9);
    expect(runner.calls[0].tests[0]).toEqual({ id: 't1', input: '1\n' });
  });

  it('stops at the first difference and reports the test', async () => {
    const r = await stressTest(new FakeRunner(programs), cfg('badAt7'), () => {}, () => false);
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.seed).toBe(7);
    expect(r.input).toBe('7\n');
    expect(r.expected).toBe('14\n');
    expect(r.result.verdict).toBe('WA');
    expect(r.tests).toBe(7);
  });

  it('reports a failing generator or brute force, and compile errors', async () => {
    const gen = await stressTest(new FakeRunner(programs), cfg('good', { gen: { lang: 'cpp20', code: 'genCrashAt3' } }), () => {}, () => false);
    expect(gen).toMatchObject({ kind: 'error', who: 'generator', seed: 3 });
    const brute = await stressTest(new FakeRunner(programs), cfg('good', { brute: { lang: 'cpp20', code: 'bruteSlow' } }), () => {}, () => false);
    expect(brute).toMatchObject({ kind: 'error', who: 'brute force', seed: 1, input: '1\n' });
    const ce = await stressTest(new FakeRunner(programs), cfg('broken'), () => {}, () => false);
    expect(ce).toMatchObject({ kind: 'error', who: 'solution', detail: 'error: nope' });
  });

  it('stops when asked', async () => {
    let calls = 0;
    const r = await stressTest(new FakeRunner(programs), cfg('good'), () => {}, () => ++calls > 2);
    expect(r).toEqual({ kind: 'stopped', tests: 10 });
  });
});
