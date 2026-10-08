/**
 * Submitting through Codeforces' own submit form, in the user's own session. Everything here is
 * pure (documents in, data out) so it can be tested against fixtures; the content script does the
 * actual requests (src/extension/content.ts).
 */
import type { LangId } from './languages';

/** Where to submit a problem: contest, problemset and gym use different pages and fields. */
export interface SubmitTarget {
  /** Path of the submit page, e.g. "/contest/4/submit". */
  path: string;
  /** Form field naming the problem, and its value. */
  problemField: 'submittedProblemIndex' | 'submittedProblemCode';
  problemValue: string;
}

/** A problem opened from /problemset/problem/… submits through the problemset form. */
export function submitTarget(
  page: { kind: 'contest' | 'gym'; contestId: string; problemset: boolean },
  index: string,
): SubmitTarget {
  if (page.kind === 'gym') {
    return { path: `/gym/${page.contestId}/submit`, problemField: 'submittedProblemIndex', problemValue: index };
  }
  if (page.problemset) {
    return { path: '/problemset/submit', problemField: 'submittedProblemCode', problemValue: `${page.contestId}${index}` };
  }
  return { path: `/contest/${page.contestId}/submit`, problemField: 'submittedProblemIndex', problemValue: index };
}

export interface ProgramType {
  /** Codeforces' programTypeId. */
  id: string;
  label: string;
}

export interface SubmitForm {
  /** Form action, relative to the submit page (carries the CSRF token as a query parameter). */
  action: string;
  /** Every field the form would send by default (hidden inputs, defaults), in order. */
  fields: [string, string][];
  languages: ProgramType[];
  /** Problem indices offered by a contest form's problem <select>; null when it is a text field. */
  problemOptions: string[] | null;
}

/** The logged-in user's handle, from the page header ("handle | Logout"). */
export function pageHandle(doc: Document): string | null {
  const link = doc.querySelector<HTMLAnchorElement>('.lang-chooser a[href^="/profile/"]');
  const handle = link?.textContent?.trim();
  return handle && /^[\w.-]+$/.test(handle) ? handle : null;
}

/** The header offers "Enter | Register" instead of the user's handle. */
export function isLoggedOut(doc: Document): boolean {
  return !pageHandle(doc) && Boolean(doc.querySelector('a[href^="/enter"], a[href*="codeforces.com/enter"]'));
}

/** Codeforces shows one-off notices with `Codeforces.showMessage("…")` in an inline script. */
export function flashMessage(doc: Document): string | null {
  for (const script of doc.querySelectorAll('script')) {
    const m = /Codeforces\.showMessage\(\s*(["'])((?:\\.|(?!\1).)*)\1/.exec(script.textContent ?? '');
    if (m) return unescapeJs(m[2]).trim() || null;
  }
  return null;
}

function unescapeJs(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => (c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c));
}

function findSubmitForm(doc: Document): HTMLFormElement | null {
  const forms = [...doc.querySelectorAll<HTMLFormElement>('form')];
  return (
    forms.find((f) => f.querySelector('select[name="programTypeId"]') && f.querySelector('[name="source"]')) ??
    forms.find((f) => f.querySelector('select[name="programTypeId"]')) ??
    null
  );
}

/** Read the submit form: its action, default fields, the language list and the problem list. */
export function parseSubmitForm(doc: Document): SubmitForm | null {
  const form = findSubmitForm(doc);
  if (!form) return null;
  const fields: [string, string][] = [];
  for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (['submit', 'button', 'file', 'image', 'reset'].includes(el.type)) continue;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      fields.push([el.name, el.value]);
    } else if (el instanceof HTMLSelectElement) {
      fields.push([el.name, el.value]);
    } else {
      fields.push([el.name, el.value]);
    }
  }
  const select = form.querySelector<HTMLSelectElement>('select[name="programTypeId"]')!;
  const languages = [...select.options]
    .map((o) => ({ id: o.value.trim(), label: (o.textContent ?? '').replace(/\s+/g, ' ').trim() }))
    .filter((o) => /^\d+$/.test(o.id) && o.label);
  const problemSelect = form.querySelector<HTMLSelectElement>('select[name="submittedProblemIndex"]');
  const problemOptions = problemSelect
    ? [...problemSelect.options].map((o) => o.value.trim().toUpperCase()).filter(Boolean)
    : null;
  return { action: form.getAttribute('action') ?? '', fields, languages, problemOptions };
}

/** Error notes Codeforces puts next to form fields, e.g. "You have submitted exactly the same code before". */
export function formErrors(doc: Document): string[] {
  const form = findSubmitForm(doc);
  const scope: ParentNode = form ?? doc;
  return [...scope.querySelectorAll('.error')]
    .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export type SubmitPage =
  | { kind: 'form'; form: SubmitForm }
  | { kind: 'login' }
  | { kind: 'error'; message: string };

/** What a GET of the submit page (after redirects) turned out to be. */
export function readSubmitPage(doc: Document): SubmitPage {
  const form = parseSubmitForm(doc);
  if (form) return { kind: 'form', form };
  if (isLoggedOut(doc)) return { kind: 'login' };
  return {
    kind: 'error',
    message: flashMessage(doc) ?? "Codeforces didn't show a submit form for this problem (is the contest open for submissions?).",
  };
}

export type SubmitResponse = { ok: true; submissionId: number | null } | { ok: false; login: boolean; message: string };

/**
 * What the POST led to. On success Codeforces redirects to the user's submissions ("/my" or
 * "status?my=on"); on failure it shows the form again with error notes, or another page with a
 * notice.
 */
export function readSubmitResponse(finalUrl: string, doc: Document, target: SubmitTarget, index: string): SubmitResponse {
  let path = '';
  let query = '';
  try {
    const u = new URL(finalUrl);
    path = u.pathname;
    query = u.search;
  } catch {
    // Treated as "not a submissions page" below.
  }
  const onMy = /\/my\/?$/.test(path) || (/\/status\/?$/.test(path) && /[?&]my=on\b/.test(query));
  if (onMy) return { ok: true, submissionId: newestSubmissionId(doc, index) };
  if (isLoggedOut(doc)) return { ok: false, login: true, message: 'You are not logged in to Codeforces.' };
  const errors = formErrors(doc);
  if (errors.length) return { ok: false, login: false, message: errors.join(' ') };
  const flash = flashMessage(doc);
  if (flash) return { ok: false, login: false, message: flash };
  return {
    ok: false,
    login: false,
    message: path.endsWith(target.path) ? "Codeforces didn't accept the submission." : "Codeforces didn't confirm the submission.",
  };
}

/** The first row of the submissions table that is for this problem. */
function newestSubmissionId(doc: Document, index: string): number | null {
  const wanted = index.toUpperCase();
  for (const row of doc.querySelectorAll('tr[data-submission-id]')) {
    const link = row.querySelector<HTMLAnchorElement>('a[href*="/problem/"]');
    const linkIndex = /\/problem\/(?:\d+\/)?([A-Za-z0-9]+)\/?$/.exec(link?.getAttribute('href') ?? '')?.[1];
    if (linkIndex && linkIndex.toUpperCase() !== wanted) continue;
    const id = Number(row.getAttribute('data-submission-id'));
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

/** The fields to POST: the form's own defaults, with language, source and problem filled in. */
export function buildSubmitBody(
  form: SubmitForm,
  fill: { target: SubmitTarget; programTypeId: string; source: string; tabSize?: number },
): [string, string][] {
  const set = new Map<string, string>([
    ['action', 'submitSolutionFormSubmitted'],
    [fill.target.problemField, fill.target.problemValue],
    ['programTypeId', fill.programTypeId],
    ['source', fill.source],
  ]);
  if (fill.tabSize) set.set('tabSize', String(fill.tabSize));
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

// --- language mapping ------------------------------------------------------------------------

type Version = number[];

function version(text: string | undefined): Version {
  return (text ?? '').split('.').map(Number).filter((n) => Number.isFinite(n));
}

function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

interface Candidate {
  option: ProgramType;
  /** Compared left to right, bigger wins. */
  rank: number[];
}

const is64 = (label: string) => (/64/.test(label) ? 1 : 0);

/**
 * Rank a language option for one of our languages, or null if it doesn't fit. Handles both the
 * submit form's labels ("GNU G++20 13.2 (64 bit, winlibs)", "Java 21 64bit", "PyPy 3.10 (7.3.15,
 * 64bit)") and the short names used elsewhere ("C++20 (GCC 13-64)", "PyPy 3-64").
 */
function rankOption(lang: LangId, option: ProgramType): number[] | null {
  const label = option.label;
  switch (lang) {
    case 'cpp20': {
      if (/clang|ms\s*c\+\+|visual|msvc/i.test(label)) return null;
      const std = /(?:G\+\+|C\+\+)\s*(\d{2})\b/i.exec(label);
      if (!std) return null;
      const year = Number(std[1]);
      if (year < 20) return null;
      // Exactly C++20 first, then newer standards (they compile C++20 code too), oldest first.
      const stdRank = year === 20 ? 1000 : 1000 - year;
      const compiler = /(?:GCC\s*|G\+\+\d{2}\s+)(\d+(?:\.\d+)*)/i.exec(label)?.[1];
      return [stdRank, ...pad(version(compiler)), is64(label)];
    }
    case 'java21': {
      const m = /^Java\s+(\d+)(?:\.(\d+))?/i.exec(label);
      if (!m) return null;
      const v = Number(m[1]);
      return [v === 21 ? 1 : 0, v, is64(label)];
    }
    case 'python3': {
      const m = /^Python\s*(3(?:\.\d+)*)/i.exec(label);
      return m ? [...pad(version(m[1])), is64(label)] : null;
    }
    case 'pypy3': {
      const m = /^PyPy\s*(3(?:\.\d+)*)/i.exec(label);
      return m ? [...pad(version(m[1])), is64(label)] : null;
    }
  }
}

/** Fixed-length version so ranks compare position by position. */
function pad(v: Version): number[] {
  return [...v, 0, 0, 0, 0].slice(0, 4);
}

/** The Codeforces compiler to submit with: the newest one that matches our language. */
export function pickProgramType(options: readonly ProgramType[], lang: LangId): ProgramType | null {
  let best: Candidate | null = null;
  for (const option of options) {
    const rank = rankOption(lang, option);
    if (!rank) continue;
    if (!best || compareVersions(rank, best.rank) > 0) best = { option, rank };
  }
  return best?.option ?? null;
}

/** A browser check (Cloudflare) instead of a Codeforces page. We never try to get past it. */
export function isBrowserCheck(status: number, html: string): boolean {
  return (status === 403 || status === 503) && /cf-chl|challenge-platform|Just a moment/i.test(html);
}
