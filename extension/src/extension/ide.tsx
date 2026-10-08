import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ContestInfo } from '../core/contest';
import { contestClock } from '../core/contest';
import { parseProblemPage, parseProblemUrl } from '../core/parseProblem';
import type { Problem } from '../core/types';
import { App } from '../ui/App';
import type { InitialState } from '../ui/state';
import { loadInitialState } from '../ui/state';
import { applyTheme } from '../ui/themes';
import '../ui/styles.css';
import { ChromeStorageKV } from './chromeKV';
import type { IdeMessage, PageMessage } from './messages';
import { CLASSIC_VIEW_HASH, isCodeforcesOrigin } from './messages';
import { NativeRunner } from './nativeRunner';
import { PageBridge } from './pageBridge';

const kv = new ChromeStorageKV();
const parentOrigin = location.ancestorOrigins?.[0] ?? '';

const runner = new NativeRunner();

function send(msg: IdeMessage) {
  window.parent.postMessage(msg, parentOrigin);
}

const judge = new PageBridge(parentOrigin, send);

function Boot({ text }: { text: string }) {
  return <div className="boot">{text}</div>;
}

function IdeRoot({ initialProblems, startIndex, pageUrl }: { initialProblems: Problem[]; startIndex: string | null; pageUrl: string }) {
  const [problems, setProblems] = useState(initialProblems);
  const [currentId, setCurrentId] = useState(
    () => problems.find((p) => p.index === startIndex)?.id ?? problems[0].id,
  );
  const [contest, setContest] = useState<ContestInfo | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const isContestPage = !new URL(pageUrl).pathname.startsWith('/problemset/');

  // Contest mode: the other problems' statements come from the contest's /problems page (one
  // request). Problems already open keep their objects (and so their tags and state).
  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const { url, html } = await judge.allProblems();
      // Parsed (and sanitized) here, like the first page.
      const all = parseProblemPage(new DOMParser().parseFromString(html, 'text/html'), url);
      if (!all.length) throw new Error("Couldn't read the contest's problems.");
      setProblems((cur) => {
        const merged = all.map((p) => cur.find((c) => c.id === p.id) ?? p);
        for (const c of cur) if (!merged.some((p) => p.id === c.id)) merged.push(c);
        return merged;
      });
    } finally {
      setLoadingAll(false);
    }
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !isContestPage) return;
    started.current = true;
    judge.contest().then(
      (info) => {
        setContest(info);
        // During the contest, open every problem's tab right away.
        if (info && contestClock(info, Date.now()).kind === 'running' && initialProblems.length === 1) {
          void loadAll().catch(() => {});
        }
      },
      () => {},
    );
  }, [isContestPage, loadAll, initialProblems.length]);
  const problem = problems.find((p) => p.id === currentId) ?? problems[0];
  const [loaded, setLoaded] = useState<{ id: string; state: InitialState } | null>(null);

  useEffect(() => {
    let live = true;
    void loadInitialState(kv, problem).then((state) => {
      if (!live) return;
      applyTheme(state.settings.theme);
      setLoaded({ id: problem.id, state });
    });
    return () => {
      live = false;
    };
  }, [problem]);

  const nav = useMemo(
    () => ({
      problems: problems.map((p) => ({ id: p.id, index: p.index, title: p.title })),
      onSelect: setCurrentId,
      onLoadAll: isContestPage && problems.length === 1 ? loadAll : undefined,
      loadingAll,
    }),
    [problems, isContestPage, loadAll, loadingAll],
  );

  if (!loaded || loaded.id !== problem.id) return <Boot text="Loading…" />;
  return (
    <App
      key={problem.id}
      problem={problem}
      runner={runner}
      kv={kv}
      initial={loaded.state}
      judge={judge}
      contest={contest}
      onExit={() => send({ type: 'cfs:close' })}
      onShowOnCodeforces={(p) => {
        // The page under the IDE already shows this problem: just switch to it.
        const page = parseProblemUrl(pageUrl);
        if (page && (page.index === null || page.index === p.index)) {
          send({ type: 'cfs:close' });
          return;
        }
        // Another problem of the contest: its own page in a new tab, without the IDE on top.
        const url = new URL(`/${p.kind}/${p.contestId}/problem/${p.index}`, pageUrl);
        url.hash = CLASSIC_VIEW_HASH;
        window.open(url.href, '_blank', 'noopener');
      }}
      nav={nav}
    />
  );
}

const root = createRoot(document.getElementById('root')!);

if (!isCodeforcesOrigin(parentOrigin)) {
  root.render(<Boot text="Open a Codeforces problem page to use CF Studio." />);
} else {
  root.render(<Boot text="Loading…" />);
  let started = false;
  window.addEventListener('message', (e: MessageEvent<PageMessage>) => {
    if (e.source !== window.parent || e.origin !== parentOrigin || typeof e.data?.type !== 'string') return;
    if (e.data.type !== 'cfs:init') {
      judge.handle(e.data);
      return;
    }
    if (started) return;
    const { url, html, index } = e.data;
    if (typeof url !== 'string' || typeof html !== 'string' || new URL(url).origin !== parentOrigin) return;
    started = true;
    // Parsed (and sanitized) here, in the extension's own page — see messages.ts.
    const problems = parseProblemPage(new DOMParser().parseFromString(html, 'text/html'), url);
    if (!problems.length) {
      root.render(<Boot text="Couldn't read a problem statement on this page." />);
      return;
    }
    root.render(
      <StrictMode>
        <IdeRoot initialProblems={problems} startIndex={typeof index === 'string' ? index : null} pageUrl={url} />
      </StrictMode>,
    );
  });
  // Alt+I goes back to the Codeforces page, same as on the page itself.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        send({ type: 'cfs:close' });
      }
    },
    true,
  );
  send({ type: 'cfs:ready' });
}
