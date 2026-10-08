import type { TestEvent } from './runner';
import type { Problem, TestResult } from './types';

export interface CheckOptions {
  /** Absolute/relative tolerance for numeric tokens, or null for exact comparison. */
  floatEps: number | null;
  /** The statement allows any valid answer, so a mismatch isn't necessarily wrong. */
  multipleAnswers: boolean;
}

export interface CheckResult {
  ok: boolean;
  /** 1-based lines of `actual` that differ from `expected` (line by line, whitespace-trimmed). */
  badLines: number[];
  message: string;
}

/** Work out how to compare outputs from the statement's wording. */
export function checkOptionsFor(problem: Pick<Problem, 'outputHtml' | 'legendHtml' | 'noteHtml'>): CheckOptions {
  const text = `${problem.legendHtml} ${problem.outputHtml}`.replace(/<[^>]+>/g, ' ');
  const allText = `${text} ${problem.noteHtml.replace(/<[^>]+>/g, ' ')}`;
  let floatEps: number | null = null;
  if (/(absolute|relative)\s+(or\s+(absolute|relative)\s+)?error/i.test(text)) {
    const exp = /10\s*\^\s*\{?\s*-\s*(\d+)\s*\}?/.exec(text);
    floatEps = exp ? 10 ** -Number(exp[1]) : 1e-6;
  }
  const multipleAnswers =
    /(print|output)\s+any(\s+of\s+them)?\b|any\s+of\s+them|multiple\s+(possible\s+|valid\s+|correct\s+)?(answers|solutions)|several\s+(possible\s+|valid\s+|correct\s+)?(answers|solutions)/i.test(
      allText,
    );
  return { floatEps, multipleAnswers };
}

interface Token {
  value: string;
  line: number;
}

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  s.replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      for (const value of line.split(/\s+/)) if (value) out.push({ value, line: i + 1 });
    });
  return out;
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function tokensEqual(a: string, b: string, eps: number | null): boolean {
  if (a === b) return true;
  if (eps === null || !NUMBER.test(a) || !NUMBER.test(b)) return false;
  const x = Number(a);
  const y = Number(b);
  const diff = Math.abs(x - y);
  return diff <= eps || diff <= eps * Math.abs(x);
}

/**
 * Compare program output with the expected output the way Codeforces' default checkers do:
 * whitespace-separated tokens, ignoring blank lines and spacing, optionally with a float tolerance.
 */
export function compareOutput(expected: string, actual: string, opts: CheckOptions): CheckResult {
  const exp = tokenize(expected);
  const act = tokenize(actual);
  let message = '';
  const n = Math.min(exp.length, act.length);
  for (let i = 0; i < n; i++) {
    if (!tokensEqual(exp[i].value, act[i].value, opts.floatEps)) {
      message = `Line ${act[i].line}: expected ${clip(exp[i].value)}, found ${clip(act[i].value)}`;
      break;
    }
  }
  if (!message && exp.length !== act.length) {
    message =
      act.length < exp.length
        ? `Output ended early: expected ${clip(exp[act.length].value)} on line ${exp[act.length].line}`
        : `Extra output on line ${act[exp.length].line}: ${clip(act[exp.length].value)}`;
  }
  return { ok: !message, badLines: message ? diffLines(expected, actual, opts.floatEps) : [], message };
}

/** Lines of `actual` whose tokens differ from the same line of `expected`. */
function diffLines(expected: string, actual: string, eps: number | null): number[] {
  const split = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const e = split(expected);
  const a = split(actual);
  const bad: number[] = [];
  a.forEach((line, i) => {
    const lt = line.split(/\s+/).filter(Boolean);
    const et = (e[i] ?? '').split(/\s+/).filter(Boolean);
    if (lt.length !== et.length || lt.some((t, j) => !tokensEqual(et[j], t, eps))) bad.push(i + 1);
  });
  return bad;
}

function clip(s: string): string {
  return s.length > 40 ? `"${s.slice(0, 37)}..."` : `"${s}"`;
}

/** Turn one test's run result into a verdict. */
export function judge(ev: TestEvent, expected: string, opts: CheckOptions, timeLimitMs: number): TestResult {
  const base = {
    stdout: ev.stdout,
    stderr: ev.stderr,
    exitCode: ev.exitCode,
    timeMs: ev.timeMs,
    memoryKb: ev.memoryKb,
    badLines: [],
    message: '',
  };
  if (ev.timedOut) return { ...base, verdict: 'TLE', message: `Stopped after the ${timeLimitMs} ms time limit` };
  if (ev.memoryExceeded) return { ...base, verdict: 'MLE', message: 'Used more memory than the limit' };
  if (ev.exitCode !== 0) {
    const why = ev.detail ? `Crashed: ${ev.detail}` : `Exited with code ${ev.exitCode ?? '(killed)'}`;
    return { ...base, verdict: 'RE', message: why };
  }
  if (!expected.trim()) return { ...base, verdict: 'OK', message: ev.truncated ? 'Output was cut off (too long to show)' : '' };
  const r = compareOutput(expected, ev.stdout, opts);
  if (r.ok) return { ...base, verdict: 'AC' };
  const cut = ev.truncated ? ' (your output was cut off, so this may be wrong)' : '';
  return opts.multipleAnswers
    ? { ...base, verdict: 'DIFF', badLines: r.badLines, message: `${r.message}. This problem accepts any valid answer, so check yours by hand.${cut}` }
    : { ...base, verdict: 'WA', badLines: r.badLines, message: r.message + cut };
}
