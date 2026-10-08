import { describe, expect, it } from 'vitest';
import type { ProgramType } from '../src/core/submit';
import {
  buildSubmitBody,
  flashMessage,
  formErrors,
  isBrowserCheck,
  isLoggedOut,
  pageHandle,
  parseSubmitForm,
  pickProgramType,
  readSubmitPage,
  readSubmitResponse,
  submitTarget,
} from '../src/core/submit';
import FORM from './fixtures/submit-form.html?raw';

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const LOGGED_OUT = `<div class="lang-chooser"><a href="/enter?back=%2Fcontest%2F1000%2Fsubmit">Enter</a> | <a href="/register">Register</a></div>`;

describe('submitTarget', () => {
  it('uses the contest, problemset or gym form', () => {
    expect(submitTarget({ kind: 'contest', contestId: '1000', problemset: false }, 'B')).toEqual({
      path: '/contest/1000/submit',
      problemField: 'submittedProblemIndex',
      problemValue: 'B',
    });
    expect(submitTarget({ kind: 'contest', contestId: '1000', problemset: true }, 'C1')).toEqual({
      path: '/problemset/submit',
      problemField: 'submittedProblemCode',
      problemValue: '1000C1',
    });
    expect(submitTarget({ kind: 'gym', contestId: '100001', problemset: false }, 'A').path).toBe('/gym/100001/submit');
  });
});

describe('parseSubmitForm', () => {
  const form = parseSubmitForm(doc(FORM))!;

  it('finds the submit form, not the search form', () => {
    expect(form.action).toBe('/contest/1000/submit?csrf_token=0123456789abcdef0123456789abcdef');
  });

  it('keeps the default fields, without buttons and file inputs', () => {
    const names = form.fields.map(([n]) => n);
    expect(names).toEqual([
      'csrf_token',
      'ftaa',
      'bfaa',
      'action',
      'submittedProblemIndex',
      'programTypeId',
      'source',
      'tabSize',
      'sourceCodeConfirmed',
    ]);
    expect(Object.fromEntries(form.fields).programTypeId).toBe('54');
  });

  it('reads the language options and problem indices', () => {
    expect(form.languages).toContainEqual({ id: '89', label: 'GNU G++20 13.2 (64 bit, winlibs)' });
    expect(form.languages).toHaveLength(17);
    expect(form.problemOptions).toEqual(['A', 'B', 'C1']);
  });

  it('returns null without a submit form', () => {
    expect(parseSubmitForm(doc('<form action="/search"><input name="query"></form>'))).toBeNull();
  });
});

describe('pickProgramType', () => {
  const options = parseSubmitForm(doc(FORM))!.languages;

  it('maps each language to the newest matching compiler', () => {
    expect(pickProgramType(options, 'cpp20')?.id).toBe('89');
    expect(pickProgramType(options, 'java21')?.id).toBe('87');
    expect(pickProgramType(options, 'python3')?.id).toBe('31');
    expect(pickProgramType(options, 'pypy3')?.id).toBe('70');
  });

  it('prefers the newest version among several matches', () => {
    const o = (id: string, label: string): ProgramType => ({ id, label });
    expect(pickProgramType([o('1', 'GNU G++20 11.2 (64 bit, winlibs)'), o('2', 'GNU G++20 13.2 (64 bit, winlibs)')], 'cpp20')?.id).toBe('2');
    expect(pickProgramType([o('1', 'Python 3.8.10'), o('2', 'Python 3.13.1'), o('3', 'Python 2.7.18')], 'python3')?.id).toBe('2');
    expect(pickProgramType([o('1', 'PyPy 3-64'), o('2', 'PyPy 3')], 'pypy3')?.id).toBe('1');
    expect(pickProgramType([o('1', 'Java 17 64bit'), o('2', 'Java 8 32bit')], 'java21')?.id).toBe('1');
  });

  it('falls back to a newer C++ standard, never to clang or C++17', () => {
    const o = (id: string, label: string): ProgramType => ({ id, label });
    expect(pickProgramType([o('1', 'GNU G++17 7.3.0'), o('2', 'GNU G++23 14.2 (64 bit, msys2)')], 'cpp20')?.id).toBe('2');
    expect(pickProgramType([o('1', 'GNU G++17 7.3.0'), o('2', 'Clang++20 Diagnostics')], 'cpp20')).toBeNull();
  });

  it('understands the short names too', () => {
    const o = (id: string, label: string): ProgramType => ({ id, label });
    const short = [o('54', 'C++17 (GCC 7-32)'), o('89', 'C++20 (GCC 13-64)'), o('91', 'C++23 (GCC 14-64, msys2)')];
    expect(pickProgramType(short, 'cpp20')?.id).toBe('89');
  });
});

describe('buildSubmitBody', () => {
  const form = parseSubmitForm(doc(FORM))!;

  it('fills in problem, language and source, keeping the hidden fields', () => {
    const target = submitTarget({ kind: 'contest', contestId: '1000', problemset: false }, 'B');
    const body = Object.fromEntries(buildSubmitBody(form, { target, programTypeId: '89', source: 'int main() {}\n' }));
    expect(body).toEqual({
      csrf_token: '0123456789abcdef0123456789abcdef',
      ftaa: 'abcdefghijklmnopqr',
      bfaa: '00112233445566778899aabbccddeeff',
      action: 'submitSolutionFormSubmitted',
      submittedProblemIndex: 'B',
      programTypeId: '89',
      source: 'int main() {}\n',
      tabSize: '4',
      sourceCodeConfirmed: 'false',
    });
  });

  it('adds fields the form lacks (problemset form)', () => {
    const target = submitTarget({ kind: 'contest', contestId: '1000', problemset: true }, 'A');
    const body = buildSubmitBody({ ...form, fields: [['csrf_token', 'x']] }, { target, programTypeId: '31', source: 'print(1)' });
    expect(body).toEqual([
      ['csrf_token', 'x'],
      ['action', 'submitSolutionFormSubmitted'],
      ['submittedProblemCode', '1000A'],
      ['programTypeId', '31'],
      ['source', 'print(1)'],
    ]);
  });
});

describe('reading Codeforces pages', () => {
  it('reads the handle, or sees that nobody is logged in', () => {
    expect(pageHandle(doc(FORM))).toBe('test_user');
    expect(isLoggedOut(doc(FORM))).toBe(false);
    expect(pageHandle(doc(LOGGED_OUT))).toBeNull();
    expect(isLoggedOut(doc(LOGGED_OUT))).toBe(true);
  });

  it('classifies the submit page', () => {
    expect(readSubmitPage(doc(FORM)).kind).toBe('form');
    expect(readSubmitPage(doc(LOGGED_OUT))).toEqual({ kind: 'login' });
    const closed = `<div class="lang-chooser"><a href="/profile/u">u</a></div><script>
      $(function() { Codeforces.showMessage("You are not allowed to view the requested page"); });</script>`;
    expect(readSubmitPage(doc(closed))).toEqual({ kind: 'error', message: 'You are not allowed to view the requested page' });
  });

  it('reads flash messages with escapes', () => {
    expect(flashMessage(doc(`<script>Codeforces.showMessage('Contest \\'X\\' isn\\u0027t running');</script>`))).toBe(
      "Contest 'X' isn't running",
    );
    expect(flashMessage(doc('<script>var x = 1;</script>'))).toBeNull();
  });

  it('reads form errors such as duplicate code', () => {
    const page = FORM.replace(
      '<span class="error for__source"></span>',
      '<span class="error for__source">You have submitted exactly the same code before</span>',
    );
    expect(formErrors(doc(page))).toEqual(['You have submitted exactly the same code before']);
  });

  it('spots a browser check', () => {
    expect(isBrowserCheck(403, '<title>Just a moment...</title>')).toBe(true);
    expect(isBrowserCheck(200, '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>')).toBe(false);
  });
});

describe('readSubmitResponse', () => {
  const target = submitTarget({ kind: 'contest', contestId: '1000', problemset: false }, 'B');
  const MY = `<div class="lang-chooser"><a href="/profile/test_user">test_user</a></div>
    <table class="status-frame-datatable">
      <tr><th>#</th></tr>
      <tr data-submission-id="555"><td><a href="/contest/1000/problem/A">A</a></td></tr>
      <tr data-submission-id="554"><td><a href="/contest/1000/problem/B">B</a></td></tr>
    </table>`;

  it('succeeds on the "my submissions" page and finds the new submission', () => {
    expect(readSubmitResponse('https://codeforces.com/contest/1000/my', doc(MY), target, 'B')).toEqual({ ok: true, submissionId: 554 });
    expect(readSubmitResponse('https://codeforces.com/problemset/status?my=on', doc(MY), target, 'A')).toEqual({
      ok: true,
      submissionId: 555,
    });
    expect(readSubmitResponse('https://codeforces.com/contest/1000/my', doc('<p></p>'), target, 'B')).toEqual({
      ok: true,
      submissionId: null,
    });
  });

  it('reports form errors, a logged-out page or a notice', () => {
    const dup = FORM.replace(
      '<span class="error for__source"></span>',
      '<span class="error for__source">You have submitted exactly the same code before</span>',
    );
    expect(readSubmitResponse('https://codeforces.com/contest/1000/submit', doc(dup), target, 'B')).toEqual({
      ok: false,
      login: false,
      message: 'You have submitted exactly the same code before',
    });
    expect(readSubmitResponse('https://codeforces.com/', doc(LOGGED_OUT), target, 'B')).toMatchObject({ ok: false, login: true });
    expect(
      readSubmitResponse('https://codeforces.com/contests', doc('<script>Codeforces.showMessage("Contest is over");</script>'), target, 'B'),
    ).toEqual({ ok: false, login: false, message: 'Contest is over' });
  });
});
