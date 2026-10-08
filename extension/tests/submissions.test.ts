import { describe, expect, it } from 'vitest';
import type { Submission } from '../src/core/submissions';
import {
  filterForProblem,
  findSubmitted,
  formatMemory,
  isPending,
  mergeSubmissions,
  parseUserStatus,
  submissionPath,
  verdictText,
  verdictTone,
} from '../src/core/submissions';

const raw = (id: number, index: string, extra: Record<string, unknown> = {}, contestId = 1000) => ({
  id,
  contestId,
  creationTimeSeconds: 1_700_000_000 + id,
  problem: { contestId, index, name: 'Some Problem', rating: 1500, tags: ['math'] },
  author: { members: [{ handle: 'test_user' }] },
  programmingLanguage: 'C++20 (GCC 13-64)',
  verdict: 'OK',
  testset: 'TESTS',
  passedTestCount: 12,
  timeConsumedMillis: 46,
  memoryConsumedBytes: 3_584_000,
  ...extra,
});

const RESPONSE = {
  status: 'OK',
  result: [raw(13, 'B', { verdict: 'TESTING', passedTestCount: 3 }), raw(12, 'A'), raw(11, 'B', { verdict: 'WRONG_ANSWER', passedTestCount: 1 }), raw(10, 'B', {}, 999)],
};

describe('parseUserStatus', () => {
  it("keeps this problem's submissions, newest first", () => {
    const r = parseUserStatus(RESPONSE, { contestId: '1000', index: 'b' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((s) => s.id)).toEqual([13, 11]);
    expect(r.items[1]).toEqual({
      id: 11,
      contestId: 1000,
      index: 'B',
      createdAt: 1_700_000_011,
      language: 'C++20 (GCC 13-64)',
      verdict: 'WRONG_ANSWER',
      passedTests: 1,
      testset: 'TESTS',
      timeMs: 46,
      memoryBytes: 3_584_000,
    });
  });

  it('treats a missing verdict as "in queue" and drops malformed entries', () => {
    const r = parseUserStatus(
      { status: 'OK', result: [raw(5, 'A', { verdict: undefined }), { id: 'x' }, null, raw(6, 'A', { verdict: '<b>bad</b>', timeConsumedMillis: -1 })] },
      { contestId: '1000', index: 'A' },
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.items.map((s) => [s.id, s.verdict, s.timeMs])).toEqual([
      [6, null, 0],
      [5, null, 46],
    ]);
  });

  it('passes on API errors', () => {
    expect(parseUserStatus({ status: 'FAILED', comment: 'handle: User with handle x not found' }, { contestId: '1', index: 'A' })).toEqual({
      ok: false,
      message: 'handle: User with handle x not found',
    });
    expect(parseUserStatus('nope', { contestId: '1', index: 'A' }).ok).toBe(false);
    expect(parseUserStatus({ status: 'OK' }, { contestId: '1', index: 'A' }).ok).toBe(false);
  });

  it('filters the raw response before it is sent to the IDE', () => {
    const filtered = filterForProblem(RESPONSE, '1000', 'B') as { status: string; result: { id: number }[] };
    expect(filtered.status).toBe('OK');
    expect(filtered.result.map((s) => s.id)).toEqual([13, 11]);
    expect(filterForProblem({ status: 'FAILED', comment: 'x' }, '1000', 'B')).toEqual({ status: 'FAILED', comment: 'x' });
  });
});

const sub = (over: Partial<Submission>): Submission => ({
  id: 1,
  contestId: 1000,
  index: 'A',
  createdAt: 1_700_000_000,
  language: 'C++20 (GCC 13-64)',
  verdict: 'OK',
  passedTests: 0,
  testset: 'TESTS',
  timeMs: 0,
  memoryBytes: 0,
  ...over,
});

describe('verdicts', () => {
  it('words verdicts like Codeforces', () => {
    expect(verdictText(sub({ verdict: null }))).toBe('In queue');
    expect(verdictText(sub({ verdict: 'TESTING', passedTests: 6 }))).toBe('Running on test 7');
    expect(verdictText(sub({ verdict: 'TESTING', passedTests: 0, testset: 'PRETESTS' }))).toBe('Running on pretest 1');
    expect(verdictText(sub({ verdict: 'OK' }))).toBe('Accepted');
    expect(verdictText(sub({ verdict: 'OK', testset: 'PRETESTS' }))).toBe('Pretests passed');
    expect(verdictText(sub({ verdict: 'WRONG_ANSWER', passedTests: 2 }))).toBe('Wrong answer on test 3');
    expect(verdictText(sub({ verdict: 'TIME_LIMIT_EXCEEDED', passedTests: 9, testset: 'PRETESTS' }))).toBe(
      'Time limit exceeded on pretest 10',
    );
    expect(verdictText(sub({ verdict: 'COMPILATION_ERROR' }))).toBe('Compilation error');
    expect(verdictText(sub({ verdict: 'SOMETHING_NEW' }))).toBe('Something new');
  });

  it('knows which are still pending and how they look', () => {
    expect(isPending(sub({ verdict: null }))).toBe(true);
    expect(isPending(sub({ verdict: 'TESTING' }))).toBe(true);
    expect(isPending(sub({ verdict: 'WRONG_ANSWER' }))).toBe(false);
    expect(verdictTone(sub({ verdict: 'OK' }))).toBe('ok');
    expect(verdictTone(sub({ verdict: 'RUNTIME_ERROR' }))).toBe('bad');
    expect(verdictTone(sub({ verdict: 'TESTING' }))).toBe('pending');
  });

  it('formats memory and links', () => {
    expect(formatMemory(512 * 1024)).toBe('512 KB');
    expect(formatMemory(3_584_000)).toBe('3.4 MB');
    expect(formatMemory(256 * 1024 * 1024)).toBe('256 MB');
    expect(submissionPath(sub({ id: 77, contestId: 1000 }))).toBe('/contest/1000/submission/77');
    expect(submissionPath(sub({ id: 78, contestId: 100001 }))).toBe('/gym/100001/submission/78');
  });
});

describe('tracking a submission', () => {
  it('finds it by id, or as the newest since the submit', () => {
    const items = [sub({ id: 30, createdAt: 2000 }), sub({ id: 20, createdAt: 1000 })];
    expect(findSubmitted(items, { submissionId: 20, submittedAt: 0 })?.id).toBe(20);
    expect(findSubmitted(items, { submissionId: 99, submittedAt: 0 })).toBeNull();
    expect(findSubmitted(items, { submissionId: null, submittedAt: 2100 })?.id).toBe(30);
    expect(findSubmitted(items, { submissionId: null, submittedAt: 9000 })).toBeNull();
  });

  it('merges updates by id', () => {
    const merged = mergeSubmissions([sub({ id: 2, verdict: null }), sub({ id: 1 })], [sub({ id: 3 }), sub({ id: 2, verdict: 'OK' })]);
    expect(merged.map((s) => [s.id, s.verdict])).toEqual([
      [3, 'OK'],
      [2, 'OK'],
      [1, 'OK'],
    ]);
  });
});
