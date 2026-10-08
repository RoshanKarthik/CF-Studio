/**
 * Runs on Codeforces problem pages. Opens the IDE (ide.html, an extension page) in a full-page
 * iframe on top of the page, and leaves a small launcher button to reopen it after switching back
 * to the classic page. Alt+I toggles between the two.
 */
import { parseProblemUrl } from '../core/parseProblem';
import * as codeforces from './codeforces';
import type { IdeMessage, InitMessage, PageMessage } from './messages';
import { CLASSIC_VIEW_HASH } from './messages';
import { statementHtml } from './scrape';

const LAUNCHER_CSS = `
  :host { all: initial; }
  button {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
    display: flex; align-items: center; gap: 9px;
    height: 42px; padding: 0 16px 0 10px; border: 0; border-radius: 999px;
    background: #161616; color: #f0f0f0; cursor: pointer;
    font: 600 13.5px/1 'Segoe UI', system-ui, sans-serif;
    box-shadow: 0 10px 30px -8px #000a, 0 0 0 1px #ffffff1a;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  button:hover { transform: translateY(-2px); box-shadow: 0 14px 34px -8px #000c, 0 0 0 1px #3fa25a; }
  kbd {
    font: 600 11px/1 Consolas, monospace; padding: 4px 6px; border-radius: 6px;
    background: #ffffff14; color: #b7b7b7;
  }
  svg { width: 24px; height: 24px; }
`;

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="7" fill="#3fa25a"/>
  <path d="M9.5 8 5.5 12l4 4M14.5 8l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function createLauncher(onClick: () => void) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${LAUNCHER_CSS}</style><button type="button" title="Open CF Studio (Alt+I)">${LOGO}CF Studio <kbd>Alt+I</kbd></button>`;
  root.querySelector('button')!.addEventListener('click', onClick);
  host.style.display = 'none';
  document.documentElement.appendChild(host);
  return {
    show: () => (host.style.display = ''),
    hide: () => (host.style.display = 'none'),
  };
}

async function shouldAutoOpen(): Promise<boolean> {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return (settings as { autoOpen?: boolean } | undefined)?.autoOpen !== false;
  } catch {
    return true;
  }
}

function main() {
  const ref = parseProblemUrl(location.href);
  if (!ref) return;
  // Pages like "problem not found" or "log in to view" have no statement: leave them alone.
  const html = statementHtml();
  if (!html) return;

  const ideUrl = chrome.runtime.getURL('ide.html');
  const ideOrigin = new URL(ideUrl).origin;
  const page: codeforces.PageProblem = {
    kind: ref.kind,
    contestId: ref.contestId,
    problemset: location.pathname.startsWith('/problemset/'),
  };
  let frame: HTMLIFrameElement | null = null;
  let isOpen = false;
  let pageOverflow = '';
  const launcher = createLauncher(() => open());

  function open() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.src = ideUrl;
      frame.title = 'CF Studio';
      frame.allow = 'fullscreen; clipboard-write';
      Object.assign(frame.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        border: '0',
        margin: '0',
        zIndex: '2147483647',
        background: '#0d0d0d',
      });
      document.documentElement.appendChild(frame);
    }
    if (isOpen) return;
    isOpen = true;
    frame.style.display = 'block';
    post({ type: 'cfs:visible', visible: true });
    pageOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    launcher.hide();
    frame.focus();
  }

  function close() {
    if (!frame || !isOpen) return;
    isOpen = false;
    frame.style.display = 'none';
    post({ type: 'cfs:visible', visible: false });
    document.documentElement.style.overflow = pageOverflow;
    launcher.show();
  }

  function post(msg: PageMessage) {
    frame?.contentWindow?.postMessage(msg, ideOrigin);
  }

  const failed = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Network error');

  window.addEventListener('message', (e: MessageEvent<IdeMessage>) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ideOrigin) return;
    const data = e.data;
    if (data?.type === 'cfs:ready') {
      const msg: InitMessage = { type: 'cfs:init', url: location.href, html, index: ref.index };
      post(msg);
    } else if (data?.type === 'cfs:close') {
      close();
    } else if (data?.type === 'cfs:submit') {
      // Only the IDE sends this, after the user confirmed in its submit dialog.
      const { id, index, lang, code } = data;
      void codeforces
        .submit(page, index, lang, code)
        .catch((err: unknown) => ({ ok: false as const, login: false, message: `Couldn't reach Codeforces: ${failed(err)}` }))
        .then((r) => post({ type: 'cfs:submit-result', id, ...r }));
    } else if (data?.type === 'cfs:status') {
      const { id, index, count } = data;
      if (typeof index !== 'string' || !/^[A-Z0-9]{1,4}$/.test(index)) return;
      void codeforces
        .status(page, index, count)
        .catch((err: unknown) => ({ ok: false as const, message: `Couldn't reach the Codeforces API: ${failed(err)}` }))
        .then((r) => post({ type: 'cfs:status-result', id, ...r }));
    } else if (data?.type === 'cfs:customtest') {
      // Only the IDE sends this, when the user pressed Run and no local runner is installed.
      const { id, lang, code, input } = data;
      void codeforces
        .customTest(lang, code, input)
        .catch((err: unknown) => ({ ok: false as const, login: false, message: `Couldn't reach Codeforces: ${failed(err)}` }))
        .then((r) => post({ type: 'cfs:customtest-result', id, ...r }));
    } else if (data?.type === 'cfs:contest') {
      const { id } = data;
      void codeforces
        .contest(page)
        .catch((err: unknown) => ({ ok: false as const, message: failed(err) }))
        .then((r) => post({ type: 'cfs:contest-result', id, ...r }));
    } else if (data?.type === 'cfs:problems') {
      const { id } = data;
      void codeforces
        .allProblems(page)
        .catch((err: unknown) => ({ ok: false as const, message: failed(err) }))
        .then((r) => post({ type: 'cfs:problems-result', id, ...r }));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      if (isOpen) close();
      else open();
    }
  });

  if (location.hash === CLASSIC_VIEW_HASH) launcher.show();
  else void shouldAutoOpen().then((yes) => (yes ? open() : launcher.show()));
}

main();
