import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseProblemPage } from '../core/parseProblem';
import type { Problem } from '../core/types';
import { App } from '../ui/App';
import type { InitialState } from '../ui/state';
import { loadInitialState } from '../ui/state';
import { applyTheme } from '../ui/themes';
import '../ui/styles.css';
import { ChromeStorageKV } from './chromeKV';
import type { IdeMessage, PageMessage } from './messages';
import { isCodeforcesOrigin } from './messages';
import { NativeRunner } from './nativeRunner';
import { PageJudge } from './pageJudge';

const kv = new ChromeStorageKV();
const parentOrigin = location.ancestorOrigins?.[0] ?? '';

const runner = new NativeRunner();

function send(msg: IdeMessage) {
  window.parent.postMessage(msg, parentOrigin);
}

const judge = new PageJudge(parentOrigin, send);

function Boot({ text }: { text: string }) {
  return <div className="boot">{text}</div>;
}

function IdeRoot({ problems, startIndex }: { problems: Problem[]; startIndex: string | null }) {
  const [currentId, setCurrentId] = useState(
    () => problems.find((p) => p.index === startIndex)?.id ?? problems[0].id,
  );
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
    }),
    [problems],
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
      onExit={() => send({ type: 'cfs:close' })}
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
        <IdeRoot problems={problems} startIndex={typeof index === 'string' ? index : null} />
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
