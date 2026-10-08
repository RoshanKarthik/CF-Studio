/**
 * Requests to Codeforces, made by the content script: it runs on the Codeforces page itself, so
 * the user's own session applies. No passwords are handled; a browser check (Cloudflare) or a
 * captcha is reported to the user, never worked around.
 */
import { isLangId } from '../core/languages';
import type { LangId } from '../core/languages';
import { filterForProblem } from '../core/submissions';
import {
  buildSubmitBody,
  isBrowserCheck,
  pageHandle,
  pickProgramType,
  readSubmitPage,
  readSubmitResponse,
  submitTarget,
} from '../core/submit';

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

export async function status(page: PageProblem, index: string, count: number): Promise<StatusResult> {
  const user = currentHandle();
  if (!user) return { ok: true, handle: null, data: null };
  const n = Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)));
  const wait = nextApiCall - Date.now();
  nextApiCall = Math.max(Date.now(), nextApiCall) + API_GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`/api/user.status?handle=${encodeURIComponent(user)}&from=1&count=${n}`, { credentials: 'omit' });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: `The Codeforces API answered ${res.status}.` };
  }
  return { ok: true, handle: user, data: filterForProblem(json, page.contestId, index) };
}
