/**
 * Requests to Codeforces, made by the content script: it runs on the Codeforces page itself, so
 * the user's own session applies. No passwords are handled; a browser check (Cloudflare) or a
 * captcha is reported to the user, never worked around.
 */
import { isLangId } from '../core/languages';
import type { LangId } from '../core/languages';
import { buildCustomTestBody, readCustomTestStart, readCustomTestVerdict } from '../core/customTest';
import { filterForProblem } from '../core/submissions';
import type { SubmitForm } from '../core/submit';
import {
  buildSubmitBody,
  isBrowserCheck,
  isLoggedOut,
  pageHandle,
  pickProgramType,
  readSubmitPage,
  readSubmitResponse,
  submitTarget,
} from '../core/submit';
import { statementHtml } from './scrape';

export interface PageProblem {
  kind: 'contest' | 'gym';
  contestId: string;
  problemset: boolean;
}

type SubmitResult = { ok: true; submissionId: number | null } | { ok: false; login: boolean; message: string };
type StatusResult = { ok: true; handle: string | null; data: unknown } | { ok: false; message: string };

const BROWSER_CHECK =
  'Codeforces is showing a browser check. Open any Codeforces page in this tab, complete the check, then submit again.';

let handle: string | null = null;

/** The logged-in handle: from this page's header, or as last seen on a page we fetched. */
function currentHandle(): string | null {
  return pageHandle(document) ?? handle;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export async function submit(page: PageProblem, index: string, lang: LangId, code: string): Promise<SubmitResult> {
  if (!/^[A-Z0-9]{1,4}$/.test(index) || !isLangId(lang) || typeof code !== 'string') {
    return { ok: false, login: false, message: 'Invalid submit request.' };
  }
  if (!code.trim()) return { ok: false, login: false, message: 'The source code is empty.' };
  const target = submitTarget(page, index);

  const formRes = await fetch(target.path, { credentials: 'same-origin' });
  const formHtml = await formRes.text();
  if (isBrowserCheck(formRes.status, formHtml)) return { ok: false, login: false, message: BROWSER_CHECK };
  if (!formRes.ok) return { ok: false, login: false, message: `Codeforces answered ${formRes.status} for the submit page.` };
  const formDoc = parseHtml(formHtml);
  handle = pageHandle(formDoc) ?? handle;
  const read = readSubmitPage(formDoc);
  if (read.kind === 'login') return { ok: false, login: true, message: 'You are not logged in to Codeforces.' };
  if (read.kind === 'error') return { ok: false, login: false, message: read.message };
  const { form } = read;

  if (form.problemOptions && !form.problemOptions.includes(index)) {
    return { ok: false, login: false, message: `Problem ${index} can't be submitted in this contest right now.` };
  }
  const program = pickProgramType(form.languages, lang);
  if (!program) {
    return { ok: false, login: false, message: "Codeforces doesn't offer this language for this problem." };
  }

  const body = new FormData();
  for (const [name, value] of buildSubmitBody(form, { target, programTypeId: program.id, source: code })) {
    body.append(name, value);
  }
  // `_tta` is computed by Codeforces' own script on the live page; send the page's value.
  if (!body.has('_tta')) {
    const tta = document.querySelector<HTMLInputElement>('input[name="_tta"]')?.value;
    if (tta) body.append('_tta', tta);
  }
  const action = new URL(form.action || target.path, new URL(formRes.url || target.path, location.href));
  if (action.origin !== location.origin) return { ok: false, login: false, message: 'Unexpected submit form address.' };

  const res = await fetch(action.href, { method: 'POST', body, credentials: 'same-origin' });
  const html = await res.text();
  if (isBrowserCheck(res.status, html)) return { ok: false, login: false, message: BROWSER_CHECK };
  if (!res.ok) return { ok: false, login: false, message: `Codeforces answered ${res.status} to the submission.` };
  const doc = parseHtml(html);
  handle = pageHandle(doc) ?? handle;
  return readSubmitResponse(res.url, doc, target, index);
}

/** Codeforces asks for at most one API call every two seconds. */
const API_GAP_MS = 2000;
let nextApiCall = 0;

/** One API call, at least API_GAP_MS after the previous one; null if the answer isn't JSON. */
async function api(path: string): Promise<{ status: number; json: unknown }> {
  const wait = nextApiCall - Date.now();
  nextApiCall = Math.max(Date.now(), nextApiCall) + API_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(path, { credentials: 'omit' });
  try {
    return { status: res.status, json: await res.json() };
  } catch {
    return { status: res.status, json: null };
  }
}

export async function status(page: PageProblem, index: string, count: number): Promise<StatusResult> {
  const user = currentHandle();
  if (!user) return { ok: true, handle: null, data: null };
  const n = Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)));
  const { status: code, json } = await api(`/api/user.status?handle=${encodeURIComponent(user)}&from=1&count=${n}`);
  if (json === null) return { ok: false, message: `The Codeforces API answered ${code}.` };
  return { ok: true, handle: user, data: filterForProblem(json, page.contestId, index) };
}

type Failure = { ok: false; message: string };

// --- Custom Invocation (running code on Codeforces when there's no local runner) ------------

const CUSTOM_TEST_PAGE = '/problemset/customtest';
const CUSTOM_TEST_POLL_MS = 2000;
const CUSTOM_TEST_TIMEOUT_MS = 120_000;

type CustomTestResult =
  | { ok: true; verdict: string; output: string; stat: string }
  | { ok: false; login: boolean; message: string };

let customForm: Promise<SubmitForm> | null = null;
let customQueue: Promise<unknown> = Promise.resolve();

/** The Custom Invocation form (CSRF token, language list), read once per page. */
async function readCustomForm(): Promise<SubmitForm> {
  const res = await fetch(CUSTOM_TEST_PAGE, { credentials: 'same-origin' });
  const html = await res.text();
  if (isBrowserCheck(res.status, html)) throw new Error(BROWSER_CHECK);
  const page = readSubmitPage(parseHtml(html));
  if (page.kind === 'login') throw new LoginError();
  if (page.kind === 'error') throw new Error(page.message);
  return page.form;
}

class LoginError extends Error {
  constructor() {
    super('You are not logged in to Codeforces.');
  }
}

async function postCustomTest(body: FormData | URLSearchParams): Promise<unknown> {
  const res = await fetch('/data/customtest', { method: 'POST', body, credentials: 'same-origin' });
  const text = await res.text();
  if (isBrowserCheck(res.status, text)) throw new Error(BROWSER_CHECK);
  try {
    return JSON.parse(text);
  } catch {
    if (isLoggedOut(parseHtml(text))) throw new LoginError();
    throw new Error(`Codeforces answered ${res.status} to the test run.`);
  }
}

/** Run code once on Codeforces with this input. Runs are queued, one at a time. */
export function customTest(lang: LangId, code: string, input: string): Promise<CustomTestResult> {
  const run = customQueue.then(() => customTestNow(lang, code, input));
  customQueue = run.catch(() => {});
  return run;
}

async function customTestNow(lang: LangId, code: string, input: string): Promise<CustomTestResult> {
  if (!isLangId(lang) || typeof code !== 'string' || typeof input !== 'string') {
    return { ok: false, login: false, message: 'Invalid run request.' };
  }
  try {
    customForm ??= readCustomForm();
    let form: SubmitForm;
    try {
      form = await customForm;
    } catch (e) {
      customForm = null;
      throw e;
    }
    const program = pickProgramType(form.languages, lang);
    if (!program) return { ok: false, login: false, message: "Codeforces' Custom Invocation doesn't offer this language." };
    const body = new FormData();
    for (const [name, value] of buildCustomTestBody(form, { programTypeId: program.id, source: code, input })) body.append(name, value);
    const start = readCustomTestStart(await postCustomTest(body));
    if (!start.ok) {
      customForm = null; // a stale token is the usual cause; read the form again next time
      return { ok: false, login: false, message: start.message };
    }
    const csrf = form.fields.find(([n]) => n === 'csrf_token')?.[1] ?? '';
    const deadline = Date.now() + CUSTOM_TEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, CUSTOM_TEST_POLL_MS));
      const poll = new URLSearchParams({ csrf_token: csrf, communityCode: '', action: 'getVerdict', customTestSubmitId: String(start.id) });
      const verdict = readCustomTestVerdict(await postCustomTest(poll), start.id);
      if (verdict.done) return { ok: true, ...verdict.result };
    }
    return { ok: false, login: false, message: 'Codeforces took too long to run the code.' };
  } catch (e) {
    if (e instanceof LoginError) return { ok: false, login: true, message: e.message };
    return { ok: false, login: false, message: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Contest mode: the contest's phase and timing (the IDE parses it). */
export async function contest(page: PageProblem): Promise<{ ok: true; data: unknown } | Failure> {
  if (page.problemset) return { ok: false, message: 'Not a contest page.' };
  const { status: code, json } = await api(`/api/contest.standings?contestId=${page.contestId}&from=1&count=1`);
  if (json === null) return { ok: false, message: `The Codeforces API answered ${code}.` };
  return { ok: true, data: json };
}

/** Contest mode: every problem's statement, from the contest's own /problems page (one request). */
export async function allProblems(page: PageProblem): Promise<{ ok: true; url: string; html: string } | Failure> {
  if (page.problemset) return { ok: false, message: 'Not a contest page.' };
  const path = `/${page.kind}/${page.contestId}/problems`;
  const res = await fetch(path, { credentials: 'same-origin' });
  const text = await res.text();
  if (isBrowserCheck(res.status, text)) return { ok: false, message: BROWSER_CHECK };
  if (!res.ok) return { ok: false, message: `Codeforces answered ${res.status} for the problems page.` };
  const html = statementHtml(parseHtml(text));
  if (!html) return { ok: false, message: "Couldn't find the statements on the contest's problems page." };
  return { ok: true, url: new URL(path, location.origin).href, html };
}
