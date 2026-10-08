/**
 * Running code on Codeforces' own servers through its Custom Invocation page, in the user's own
 * session — the fallback when the local runner isn't installed. One test per invocation.
 *
 * The page posts to /data/customtest: `action=submitSourceCode` (the form's fields plus
 * `sourceCode`, `programTypeId`) answers `{customTestSubmitId}`, then `action=getVerdict` is
 * polled until it answers `{verdict, output, stat}`, where stat reads like "15 ms, 3400 KB".
 */
import type { TestEvent } from './runner';
import type { SubmitForm } from './submit';

/** The fields to POST: the form's own (CSRF token included), with source, language and input. */
export function buildCustomTestBody(form: SubmitForm, fill: { programTypeId: string; source: string; input: string }): [string, string][] {
  const set = new Map<string, string>([
    ['source', fill.source],
    ['programTypeId', fill.programTypeId],
    ['input', fill.input],
    ['communityCode', ''],
    ['action', 'submitSourceCode'],
    ['sourceCode', fill.source],
  ]);
  const body: [string, string][] = [];
  const seen = new Set<string>();
  for (const [name, value] of form.fields) {
    if (seen.has(name)) continue;
    seen.add(name);
    body.push([name, set.has(name) ? set.get(name)! : value]);
  }
  for (const [name, value] of set) if (!seen.has(name)) body.push([name, value]);
  return body;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Error notes in an AJAX form answer (keys like "error__source"), joined. */
function ajaxErrors(json: Record<string, unknown>): string {
  return Object.entries(json)
    .filter(([k, v]) => /error/i.test(k) && typeof v === 'string' && v.trim())
    .map(([, v]) => (v as string).trim())
    .join(' ');
}

/** Answer to submitSourceCode: the invocation's id, or why it was refused. */
export function readCustomTestStart(json: unknown): { ok: true; id: number } | { ok: false; message: string } {
  if (!isObj(json)) return { ok: false, message: 'Codeforces sent an unexpected answer.' };
  const id = Number(json.customTestSubmitId);
  if (Number.isSafeInteger(id) && id > 0) return { ok: true, id };
  return { ok: false, message: ajaxErrors(json) || 'Codeforces refused to run the code.' };
}

export interface CustomTestResult {
  verdict: string;
  output: string;
  stat: string;
}

/** Answer to getVerdict: still running, or the result. */
export function readCustomTestVerdict(json: unknown, id: number): { done: false } | { done: true; result: CustomTestResult } {
  if (!isObj(json) || json.verdict === null || json.verdict === undefined) return { done: false };
  if (json.customTestSubmitId !== undefined && Number(json.customTestSubmitId) !== id) return { done: false };
  return {
    done: true,
    result: {
      verdict: String(json.verdict).slice(0, 60),
      output: typeof json.output === 'string' ? json.output : '',
      stat: typeof json.stat === 'string' ? json.stat.slice(0, 200) : '',
    },
  };
}

/** "15 ms, 3400 KB" → time and memory. */
export function parseStat(stat: string): { timeMs: number; memoryKb: number } {
  const ms = /(\d+)\s*ms/i.exec(stat);
  const kb = /(\d+)\s*KB/i.exec(stat);
  const mb = /(\d+(?:\.\d+)?)\s*MB/i.exec(stat);
  return { timeMs: ms ? Number(ms[1]) : 0, memoryKb: kb ? Number(kb[1]) : mb ? Math.round(Number(mb[1]) * 1024) : 0 };
}

const COMPILE_ERROR = /compil(ation|e) error/i;

/**
 * Turn a Custom Invocation result into what a local run would report: a compile error, or one
 * test's event. Time and memory are judged against the problem's limits here, since Custom
 * Invocation runs with its own (more generous) ones.
 */
export function customTestEvent(
  result: CustomTestResult,
  testId: string,
  limits: { timeLimitMs: number; memoryLimitMb: number },
): { compileError: string } | { event: TestEvent } {
  const v = result.verdict.toUpperCase();
  const output = result.output.replace(/\r\n/g, '\n');
  if (v.includes('COMPILATION') || (v !== 'OK' && COMPILE_ERROR.test(output.slice(0, 200)))) {
    return { compileError: output.trim() || 'Compilation error' };
  }
  const { timeMs, memoryKb } = parseStat(result.stat);
  const exit = /exit code (?:is |was )?(-?\d+)/i.exec(output);
  const timedOut = v.includes('TIME_LIMIT') || v.includes('IDLENESS') || timeMs > limits.timeLimitMs;
  const memoryExceeded = v.includes('MEMORY_LIMIT') || memoryKb > limits.memoryLimitMb * 1024;
  const crashed = v.includes('RUNTIME') || v.includes('CRASH');
  return {
    event: {
      type: 'test',
      id: testId,
      stdout: output,
      stderr: '',
      exitCode: timedOut ? null : crashed ? (exit ? Number(exit[1]) : 1) : 0,
      timeMs,
      memoryKb,
      timedOut,
      memoryExceeded,
      detail: crashed ? `runtime error on Codeforces${exit ? ` (exit code ${exit[1]})` : ''}` : undefined,
    },
  };
}
