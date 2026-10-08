import { describe, expect, it } from 'vitest';
import { judgeInteraction } from '../src/core/checker';
import { contestClock, formatCountdown, parseContest } from '../src/core/contest';
import { helperFileName, helperTemplate, parseHelpers } from '../src/core/helpers';
import { isFullPath, mirrorPath } from '../src/core/mirror';
import type { TestEvent } from '../src/core/runner';

describe('helper files', () => {
  it('names files by kind and language', () => {
    expect(helperFileName('gen', 'cpp20')).toBe('gen.cpp');
    expect(helperFileName('brute', 'pypy3')).toBe('brute.py');
    expect(helperFileName('interactor', 'java21')).toBe('interactor.java');
  });

  it('starts generators and interactors from examples, a brute force from your template', () => {
    expect(helperTemplate('gen', 'cpp')).toContain('mt19937_64 rng(seed)');
    expect(helperTemplate('gen', 'py')).toContain('random.seed(int(sys.stdin.readline()))');
    expect(helperTemplate('interactor', 'cpp')).toContain('ifstream test(argv[1])');
    expect(helperTemplate('interactor', 'py')).toContain('sys.argv[1]');
    expect(helperTemplate('brute', 'cpp', 'int main() {}\n')).toMatch(/^\/\/ Brute force.*\nint main\(\) \{\}\n$/);
  });

  it('drops malformed stored helpers', () => {
    expect(parseHelpers({ gen: { lang: 'cpp20', code: 'x' }, brute: { lang: 'rust', code: 'y' }, interactor: 'no' })).toEqual({
      gen: { lang: 'cpp20', code: 'x' },
    });
    expect(parseHelpers(null)).toEqual({});
  });
});

const event = (over: Partial<TestEvent>): TestEvent => ({
  type: 'test',
  id: 'a',
  stdout: '',
  stderr: '',
  exitCode: 0,
  timeMs: 10,
  memoryKb: 100,
  timedOut: false,
  memoryExceeded: false,
  interactor: { exitCode: 0, stderr: 'ok 7 queries\n', timedOut: false },
  transcript: [{ from: 'solution', text: '? 1\n' }],
  ...over,
});

describe('judgeInteraction', () => {
  it("accepts when the interactor exits 0, with its message and the transcript", () => {
    const r = judgeInteraction(event({}), 1000);
    expect(r.verdict).toBe('AC');
    expect(r.message).toBe('ok 7 queries');
    expect(r.transcript).toEqual([{ from: 'solution', text: '? 1\n' }]);
  });

  it("uses the interactor's reason for a wrong answer", () => {
    const r = judgeInteraction(event({ interactor: { exitCode: 1, stderr: '\nwrong answer: expected 5, found 4\n', timedOut: false } }), 1000);
    expect(r).toMatchObject({ verdict: 'WA', message: 'wrong answer: expected 5, found 4' });
    expect(judgeInteraction(event({ interactor: { exitCode: 3, stderr: 'bad test', timedOut: false } }), 1000).message).toBe(
      'The interactor failed (exit code 3): bad test',
    );
  });

  it("puts the solution's own failures first", () => {
    expect(judgeInteraction(event({ idle: true, timedOut: true, exitCode: null }), 1000)).toMatchObject({ verdict: 'TLE' });
    expect(judgeInteraction(event({ idle: true, timedOut: true, exitCode: null }), 1000).message).toMatch(/Idleness.*Flush/);
    expect(judgeInteraction(event({ timedOut: true, exitCode: null }), 1000).verdict).toBe('TLE');
    expect(judgeInteraction(event({ exitCode: 3, detail: 'aborted' }), 1000)).toMatchObject({ verdict: 'RE', message: 'Crashed: aborted' });
  });

  it('accepts a solution that was stopped after a successful interaction', () => {
    const r = judgeInteraction(event({ exitCode: null, detail: 'stopped: still running after the interactor finished' }), 1000);
    expect(r.verdict).toBe('AC');
    expect(r.message).toContain('kept running');
  });

  it("reports an interactor that didn't finish", () => {
    expect(judgeInteraction(event({ interactor: { exitCode: null, stderr: '', timedOut: true } }), 1000).verdict).toBe('WA');
  });
});

describe('mirroring solutions', () => {
  it('puts each solution in a folder per contest', () => {
    expect(mirrorPath({ kind: 'contest', contestId: '1915', index: 'A' }, 'cpp')).toEqual({ folder: '1915', name: 'A.cpp' });
    expect(mirrorPath({ kind: 'gym', contestId: '100001', index: 'B1' }, 'py')).toEqual({ folder: 'gym100001', name: 'B1.py' });
  });

  it('wants a full path', () => {
    expect(isFullPath('C:\\cp\\codeforces')).toBe(true);
    expect(isFullPath('d:/cp')).toBe(true);
    expect(isFullPath('\\\\server\\share\\cp')).toBe(true);
    expect(isFullPath('/home/me/cp')).toBe(true);
    expect(isFullPath('cp\\codeforces')).toBe(false);
    expect(isFullPath('C:cp')).toBe(false);
  });
});

describe('contest mode', () => {
  const api = (contest: Record<string, unknown>) => ({ status: 'OK', result: { contest, problems: [], rows: [] } });

  it('reads the contest from contest.standings', () => {
    const info = parseContest(api({ id: 1, name: 'Round 1', phase: 'CODING', durationSeconds: 7200, relativeTimeSeconds: 600 }), 1000);
    expect(info).toEqual({ name: 'Round 1', phase: 'CODING', durationSeconds: 7200, relativeTimeSeconds: 600, fetchedAt: 1000 });
    expect(parseContest({ status: 'FAILED', comment: 'contestId: Contest with id 1 not found' }, 0)).toBeNull();
    expect(parseContest(api({ phase: 'WEIRD', durationSeconds: 1 }), 0)).toBeNull();
  });

  it('counts down from the API time, not the local clock', () => {
    const info = parseContest(api({ name: 'R', phase: 'CODING', durationSeconds: 7200, relativeTimeSeconds: 600 }), 50_000)!;
    expect(contestClock(info, 50_000)).toEqual({ kind: 'running', seconds: 6600 });
    expect(contestClock(info, 50_000 + 6600_000)).toEqual({ kind: 'over' });
    const before = parseContest(api({ name: 'R', phase: 'BEFORE', durationSeconds: 7200, relativeTimeSeconds: -90 }), 0)!;
    expect(contestClock(before, 30_000)).toEqual({ kind: 'before', seconds: 60 });
    expect(contestClock(parseContest(api({ phase: 'SYSTEM_TEST', durationSeconds: 1 }), 0)!, 0)).toEqual({ kind: 'testing' });
  });

  it('formats countdowns', () => {
    expect(formatCountdown(3909)).toBe('1:05:09');
    expect(formatCountdown(309)).toBe('05:09');
    expect(formatCountdown(3 * 86400 + 7200)).toBe('3d 2h');
  });
});
