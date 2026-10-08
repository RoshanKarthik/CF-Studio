import { describe, expect, it } from 'vitest';
import { SubmitError } from '../src/core/judge';
import type { Problem } from '../src/core/types';
import type { IdeMessage } from '../src/extension/messages';
import { PageBridge } from '../src/extension/pageBridge';

const problem = { id: '1000B', contestId: '1000', index: 'B', url: 'https://codeforces.com/contest/1000/problem/B' } as Problem;

function setup() {
  const sent: IdeMessage[] = [];
  const judge = new PageBridge('https://codeforces.com', (m) => sent.push(m));
  return { judge, sent };
}

describe('PageBridge', () => {
  it('sends a submit request and resolves with the submission id', async () => {
    const { judge, sent } = setup();
    const p = judge.submit(problem, 'cpp20', 'int main() {}');
    expect(sent).toEqual([{ type: 'cfs:submit', id: 1, index: 'B', lang: 'cpp20', code: 'int main() {}' }]);
    judge.handle({ type: 'cfs:submit-result', id: 1, ok: true, submissionId: 42 });
    await expect(p).resolves.toMatchObject({ submissionId: 42 });
  });

  it("rejects with Codeforces' message, flagging logins", async () => {
    const { judge } = setup();
    const p = judge.submit(problem, 'cpp20', 'x');
    judge.handle({ type: 'cfs:submit-result', id: 1, ok: false, login: true, message: 'You are not logged in to Codeforces.' });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubmitError);
    expect(err).toMatchObject({ message: 'You are not logged in to Codeforces.', login: true });
  });

  it('ignores replies to unknown requests and of the wrong type', async () => {
    const { judge } = setup();
    const p = judge.submit(problem, 'cpp20', 'x');
    judge.handle({ type: 'cfs:submit-result', id: 7, ok: true, submissionId: 1 });
    judge.handle({ type: 'cfs:status-result', id: 1, ok: true, handle: 'u', data: null });
    await expect(p).rejects.toThrow('Unexpected reply');
  });

  it('validates status replies and waits while the IDE is hidden', async () => {
    const { judge, sent } = setup();
    judge.handle({ type: 'cfs:visible', visible: false });
    const p = judge.submissions(problem, 10);
    await Promise.resolve();
    expect(sent).toEqual([]);
    judge.handle({ type: 'cfs:visible', visible: true });
    await Promise.resolve();
    expect(sent).toEqual([{ type: 'cfs:status', id: 1, index: 'B', count: 10 }]);
    judge.handle({
      type: 'cfs:status-result',
      id: 1,
      ok: true,
      handle: 'test_user',
      data: { status: 'OK', result: [{ id: 5, problem: { contestId: 1000, index: 'B' }, verdict: 'OK', creationTimeSeconds: 1 }] },
    });
    const r = await p;
    expect(r.handle).toBe('test_user');
    expect(r.items.map((s) => s.id)).toEqual([5]);
    expect(judge.submissionUrl(r.items[0])).toBe('https://codeforces.com/contest/1000/submission/5');
  });

  it('reads contest timing and accepts only the contest problems page', async () => {
    const { judge, sent } = setup();
    const c = judge.contest();
    judge.handle({
      type: 'cfs:contest-result',
      id: 1,
      ok: true,
      data: { status: 'OK', result: { contest: { name: 'R', phase: 'CODING', durationSeconds: 7200, relativeTimeSeconds: 60 } } },
    });
    await expect(c).resolves.toMatchObject({ phase: 'CODING', relativeTimeSeconds: 60 });

    const ok = judge.allProblems();
    judge.handle({ type: 'cfs:problems-result', id: 2, ok: true, url: 'https://codeforces.com/contest/1000/problems', html: '<div></div>' });
    await expect(ok).resolves.toEqual({ url: 'https://codeforces.com/contest/1000/problems', html: '<div></div>' });
    const elsewhere = judge.allProblems();
    judge.handle({ type: 'cfs:problems-result', id: 3, ok: true, url: 'https://evil.example/contest/1000/problems', html: '' });
    await expect(elsewhere).rejects.toThrow('Unexpected problems page address');
    expect(sent.map((m) => m.type)).toEqual(['cfs:contest', 'cfs:problems', 'cfs:problems']);
  });

  it('reports a logged-out user and builds the login link itself', async () => {
    const { judge } = setup();
    const p = judge.submissions(problem, 10);
    await Promise.resolve();
    judge.handle({ type: 'cfs:status-result', id: 1, ok: true, handle: null, data: null });
    await expect(p).resolves.toEqual({ handle: null, items: [] });
    expect(judge.loginUrl(problem)).toBe('https://codeforces.com/enter?back=%2Fcontest%2F1000%2Fproblem%2FB');
  });
});
