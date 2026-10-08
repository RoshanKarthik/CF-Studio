import { describe, expect, it } from 'vitest';
import { buildCustomTestBody, customTestEvent, parseStat, readCustomTestStart, readCustomTestVerdict } from '../src/core/customTest';
import { FallbackRunner } from '../src/core/fallbackRunner';
import type { RunEvent, RunRequest, Runner, RunnerStatus } from '../src/core/runner';
import { parseSubmitForm, pickProgramType } from '../src/core/submit';

// Written for the tests; mimics the structure of Codeforces' Custom Invocation form.
const FORM = `<div class="lang-chooser"><a href="/profile/test_user">test_user</a></div>
<form action="" method="post" class="customtest">
  <input type='hidden' name='csrf_token' value='0123456789abcdef0123456789abcdef'/>
  <textarea hidden="true" id="sourceCodeTextarea" name="source"></textarea>
  <input type="checkbox" id="toggleEditorCheckbox" checked="checked"/>
  <input type="number" id="tabSizeInput" name="tabSize" value="4"/>
  <input name="submit" type="submit" value="Run">
  <select name="programTypeId">
    <option value="54">GNU G++17 7.3.0</option>
    <option value="89">GNU G++20 13.2 (64 bit, winlibs)</option>
    <option value="91" selected="selected">GNU G++23 14.2 (64 bit, msys2)</option>
    <option value="87">Java 21 64bit</option>
    <option value="31">Python 3.13.2</option>
    <option value="70">PyPy 3.10 (7.3.15, 64bit)</option>
  </select>
  <textarea name="input"></textarea>
  <input name="inputFile" type="file" value=""/>
  <textarea readonly="true" name="output"></textarea>
</form>`;

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('Custom Invocation form', () => {
  const form = parseSubmitForm(doc(FORM))!;

  it('reads the form like the submit form', () => {
    expect(form).not.toBeNull();
    expect(pickProgramType(form.languages, 'cpp20')?.id).toBe('89');
    expect(pickProgramType(form.languages, 'pypy3')?.id).toBe('70');
  });

  it('builds the request body with source, language and input', () => {
    expect(Object.fromEntries(buildCustomTestBody(form, { programTypeId: '89', source: 'int main(){}', input: '1 2\n' }))).toEqual({
      csrf_token: '0123456789abcdef0123456789abcdef',
      source: 'int main(){}',
      tabSize: '4',
      programTypeId: '89',
      input: '1 2\n',
      output: '',
      communityCode: '',
      action: 'submitSourceCode',
      sourceCode: 'int main(){}',
    });
  });
});

describe('Custom Invocation answers', () => {
  it('reads the invocation id or the refusal', () => {
    expect(readCustomTestStart({ customTestSubmitId: '123' })).toEqual({ ok: true, id: 123 });
    expect(readCustomTestStart({ error__source: 'Source should not be empty' })).toEqual({ ok: false, message: 'Source should not be empty' });
    expect(readCustomTestStart('x').ok).toBe(false);
  });

  it('waits until a verdict for this invocation arrives', () => {
    expect(readCustomTestVerdict({ customTestSubmitId: 5 }, 5)).toEqual({ done: false });
    expect(readCustomTestVerdict({ verdict: 'OK', customTestSubmitId: 4, output: 'x' }, 5)).toEqual({ done: false });
    expect(readCustomTestVerdict({ verdict: 'OK', customTestSubmitId: 5, output: '3\n', stat: '15 ms, 3400 KB' }, 5)).toEqual({
      done: true,
      result: { verdict: 'OK', output: '3\n', stat: '15 ms, 3400 KB' },
    });
  });

  it('reads time and memory', () => {
    expect(parseStat('15 ms, 3400 KB')).toEqual({ timeMs: 15, memoryKb: 3400 });
    expect(parseStat('Used: 1000 ms, 12 MB')).toEqual({ timeMs: 1000, memoryKb: 12288 });
  });

  const limits = { timeLimitMs: 1000, memoryLimitMb: 256 };

  it('maps results to test events, judged against the problem limits', () => {
    const ok = customTestEvent({ verdict: 'OK', output: '3\r\n', stat: '15 ms, 3400 KB' }, 's0', limits);
    expect(ok).toEqual({
      event: expect.objectContaining({ id: 's0', stdout: '3\n', exitCode: 0, timeMs: 15, memoryKb: 3400, timedOut: false, memoryExceeded: false }),
    });
    const slow = customTestEvent({ verdict: 'OK', output: '', stat: '1500 ms, 100 KB' }, 's0', limits);
    expect(slow).toEqual({ event: expect.objectContaining({ timedOut: true, exitCode: null }) });
    const re = customTestEvent({ verdict: 'RUNTIME_ERROR', output: 'Exit code is 3', stat: '5 ms, 1 KB' }, 's0', limits);
    expect(re).toEqual({ event: expect.objectContaining({ exitCode: 3, detail: 'runtime error on Codeforces (exit code 3)' }) });
  });

  it('spots compilation errors', () => {
    expect(customTestEvent({ verdict: 'COMPILATION_ERROR', output: "error: 'x' was not declared", stat: '' }, 's0', limits)).toEqual({
      compileError: "error: 'x' was not declared",
    });
    expect(customTestEvent({ verdict: 'FAILED', output: 'Compilation error\nfoo', stat: '' }, 's0', limits)).toEqual({
      compileError: 'Compilation error\nfoo',
    });
  });
});

class StubRunner implements Runner {
  runs = 0;
  constructor(private readonly st: RunnerStatus | Error) {}
  async status() {
    if (this.st instanceof Error) throw this.st;
    return this.st;
  }
  async run(_req: RunRequest, _onEvent: (e: RunEvent) => void) {
    this.runs++;
  }
}

describe('FallbackRunner', () => {
  const req: RunRequest = { lang: 'cpp20', code: '', tests: [], timeLimitMs: 1000, memoryLimitMb: 256 };

  it('uses the local runner when it is installed', async () => {
    const local = new StubRunner({ connected: true, detail: 'g++ 13' });
    const remote = new StubRunner({ connected: true, remote: true, detail: 'Codeforces' });
    const r = new FallbackRunner(local, remote);
    expect((await r.status()).detail).toBe('g++ 13');
    await r.run(req, () => {});
    expect([local.runs, remote.runs]).toEqual([1, 0]);
  });

  it('falls back to Codeforces when it is not, and says saving needs the runner', async () => {
    const local = new StubRunner({ connected: false, detail: 'Runner not installed' });
    const remote = new StubRunner({ connected: true, remote: true, detail: 'Codeforces' });
    const r = new FallbackRunner(local, remote);
    expect(await r.status()).toMatchObject({ remote: true });
    await r.run(req, () => {});
    expect([local.runs, remote.runs]).toEqual([0, 1]);
    await expect(r.save({ root: 'C:\\cp', folder: '1', name: 'A.cpp', code: '' })).rejects.toThrow('needs the CF Studio runner');
    const broken = new FallbackRunner(new StubRunner(new Error('boom')), remote);
    expect(await broken.status()).toMatchObject({ remote: true });
  });
});
