import { describe, expect, it } from 'vitest';
import { checkOptionsFor, compareOutput, judge } from '../src/core/checker';

const EXACT = { floatEps: null, multipleAnswers: false };

describe('compareOutput', () => {
  it('ignores spacing, blank lines and trailing newlines', () => {
    expect(compareOutput('1 2\n3\n', '1   2 \r\n\n3', EXACT).ok).toBe(true);
  });

  it('reports the first wrong token and the lines that differ', () => {
    const r = compareOutput('2\n-1\n4\n', '2\n-1\n5\n', EXACT);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Line 3: expected "4", found "5"');
    expect(r.badLines).toEqual([3]);
  });

  it('reports missing and extra output', () => {
    expect(compareOutput('1\n2\n', '1\n', EXACT).message).toMatch(/ended early/);
    expect(compareOutput('1\n', '1\n2\n', EXACT).message).toMatch(/Extra output on line 2/);
  });

  it('applies the float tolerance only when asked', () => {
    expect(compareOutput('0.3333333', '0.33333331', EXACT).ok).toBe(false);
    expect(compareOutput('0.3333333', '0.33333331', { ...EXACT, floatEps: 1e-6 }).ok).toBe(true);
    expect(compareOutput('1000000', '1000000.5', { ...EXACT, floatEps: 1e-6 }).ok).toBe(true);
    expect(compareOutput('YES', 'NO', { ...EXACT, floatEps: 1e-6 }).ok).toBe(false);
  });
});

describe('checkOptionsFor', () => {
  const opts = (outputHtml: string) => checkOptionsFor({ outputHtml, legendHtml: '', noteHtml: '' });

  it('finds the float tolerance in the statement', () => {
    expect(opts('Your answer is considered correct if its absolute or relative error does not exceed $$$10^{-9}$$$.').floatEps).toBe(1e-9);
    expect(opts('absolute or relative error at most 1e-6').floatEps).toBe(1e-6);
    expect(opts('Print the answer.').floatEps).toBeNull();
  });

  it('notices when any valid answer is accepted', () => {
    expect(opts('If there are multiple answers, print any of them.').multipleAnswers).toBe(true);
    expect(opts('If there are several solutions, output any.').multipleAnswers).toBe(true);
    expect(opts('Print the minimum number of operations.').multipleAnswers).toBe(false);
  });
});

describe('judge', () => {
  const ev = { type: 'test' as const, id: 's0', stdout: '3\n', stderr: '', exitCode: 0, timeMs: 5, memoryKb: 900, timedOut: false, memoryExceeded: false };

  it('ranks limits and crashes before comparing output', () => {
    expect(judge({ ...ev, timedOut: true }, '3', EXACT, 1000).verdict).toBe('TLE');
    expect(judge({ ...ev, memoryExceeded: true }, '3', EXACT, 1000).verdict).toBe('MLE');
    expect(judge({ ...ev, exitCode: 3 }, '3', EXACT, 1000).verdict).toBe('RE');
  });

  it('compares output, or just reports it when nothing is expected', () => {
    expect(judge(ev, '3', EXACT, 1000).verdict).toBe('AC');
    expect(judge(ev, '4', EXACT, 1000).verdict).toBe('WA');
    expect(judge(ev, '', EXACT, 1000).verdict).toBe('OK');
    expect(judge(ev, '4', { ...EXACT, multipleAnswers: true }, 1000).verdict).toBe('DIFF');
  });
});

describe('judge with runner details', () => {
  const ev = { type: 'test' as const, id: 's0', stdout: '3\n', stderr: '', exitCode: 0, timeMs: 5, memoryKb: 900, timedOut: false, memoryExceeded: false };

  it('names the crash when the runner knows it', () => {
    const r = judge({ ...ev, exitCode: -1073741571, detail: 'stack overflow' }, '3', EXACT, 1000);
    expect(r).toMatchObject({ verdict: 'RE', message: 'Crashed: stack overflow' });
  });

  it('warns that a WA on truncated output may be wrong', () => {
    expect(judge({ ...ev, stdout: '4', truncated: true }, '3', EXACT, 1000).message).toMatch(/cut off/);
  });
});
