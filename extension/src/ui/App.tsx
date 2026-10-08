import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LayoutTemplate,
  ListChecks,
  Maximize2,
  Minimize2,
  PanelLeftOpen,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkOptionsFor, judge, judgeInteraction } from '../core/checker';
import type { ContestInfo } from '../core/contest';
import type { HelperKind, Helpers } from '../core/helpers';
import { HELPER_KINDS, HELPER_LABEL, helperFileName, helperTemplate } from '../core/helpers';
import type { Judge } from '../core/judge';
import type { Family, LangId } from '../core/languages';
import { isFullPath, mirrorPath } from '../core/mirror';
import { FAMILY_LABEL, LANGUAGES, language } from '../core/languages';
import type { Runner, RunnerStatus } from '../core/runner';
import type { KV } from '../core/storage';
import { keys } from '../core/storage';
import type { Template, TemplateStore } from '../core/templates';
import { addTemplate, defaultTemplate } from '../core/templates';
import type { ManualTest, Problem, TestResult } from '../core/types';
import type { EditorOptions, MonacoEditor } from './CodeEditor';
import { CodeEditor, formatEnv } from './CodeEditor';
import { ContestClock } from './ContestClock';
import { ProblemPanel } from './ProblemPanel';
import { ConfirmDialog, Kbd, Menu, MenuItem, Splitter, Toasts, useToasts } from './primitives';
import { SettingsDialog } from './SettingsDialog';
import type { InitialState, Layout, Settings, TimerState } from './state';
import type { SubmitCheck } from './SubmitDialog';
import { SubmitDialog } from './SubmitDialog';
import { StressPanel } from './StressPanel';
import { LiveVerdict, SubmissionsPanel } from './SubmissionsPanel';
import type { CaseSpec, CompileInfo, TestTab } from './TestPanel';
import { TestPanel, summary } from './TestPanel';
import { TemplateManager } from './TemplateManager';
import { applyTheme } from './themes';
import { Timer, startTimer } from './Timer';
import { useStress } from './useStress';
import { useSubmissions } from './useSubmissions';

const EXT: Record<Family, string> = { cpp: 'cpp', java: 'java', py: 'py' };
const FILE_NAME: Record<Family, string> = { cpp: 'main.cpp', java: 'Main.java', py: 'main.py' };

export interface AppProps {
  problem: Problem;
  runner: Runner;
  kv: KV;
  initial: InitialState;
  /** Submits to Codeforces and reads the user's submissions. */
  judge: Judge;
  /** Close the IDE and show the Codeforces page (extension only). */
  onExit?: () => void;
  /** Show this problem on Codeforces itself, not in another copy of the IDE (extension only). */
  onShowOnCodeforces?: (problem: Problem) => void;
  /** Other problems of the same contest, when the page had several (or they were loaded). */
  nav?: {
    problems: { id: string; index: string; title: string }[];
    onSelect: (id: string) => void;
    /** Contest mode: load every problem of the contest as tabs (single-problem contest pages). */
    onLoadAll?: () => Promise<void>;
    loadingAll?: boolean;
  };
  /** Contest mode: the contest's timing, for the countdown. */
  contest?: ContestInfo | null;
}

type Dialog =
  | { kind: 'templates'; selected?: string }
  | { kind: 'settings' }
  | { kind: 'submit' }
  | { kind: 'replace'; template: Template; reason: 'insert' | 'reset' }
  | { kind: 'removeHelper'; helper: HelperKind }
  | null;

const HELPER_HINT: Record<HelperKind, string> = { gen: 'stress test', brute: 'stress test', interactor: 'interactive' };

/** Debounced write of `value` to storage whenever it changes (skips the initial value). */
function usePersist<T>(kv: KV, key: string, value: T, delay = 300) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => void kv.set(key, value), delay);
    return () => clearTimeout(id);
  }, [kv, key, value, delay]);
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--accent)" />
      <path d="M9.5 8 5.5 12l4 4M14.5 8l4 4-4 4" fill="none" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function App({ problem, runner, kv, initial, judge: cf, onExit, onShowOnCodeforces, nav, contest }: AppProps) {
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [layout, setLayout] = useState<Layout>(initial.layout);
  const [templates, setTemplates] = useState<TemplateStore>(initial.templates);
  const [manual, setManual] = useState<ManualTest[]>(initial.manualTests);
  const [helpers, setHelpers] = useState<Helpers>(initial.helpers);
  const [activeFile, setActiveFile] = useState<'main' | HelperKind>('main');
  const [timer, setTimer] = useState<TimerState>(initial.timer);
  const [codes, setCodes] = useState<Record<Family, string>>(() => {
    const start = (f: Family) => initial.code[f] ?? defaultTemplate(initial.templates, f)?.code ?? '';
    return { cpp: start('cpp'), java: start('java'), py: start('py') };
  });
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [compile, setCompile] = useState<CompileInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{ lang: LangId; code: string } | null>(null);
  const [testTab, setTestTab] = useState<TestTab>('samples');
  const [focusCase, setFocusCase] = useState<{ tab: 'samples' | 'manual'; index: number; nonce: number } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus | null>(null);
  const [saved, setSaved] = useState(true);
  const { toasts, push } = useToasts();
  const editorRef = useRef<MonacoEditor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const lang = language(settings.lang);
  const family = lang.family;
  const code = codes[family];
  const checkOpts = useMemo(() => checkOptionsFor(problem), [problem]);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  // --- persistence -----------------------------------------------------------------------
  usePersist(kv, keys.settings, settings, 0);
  usePersist(kv, keys.layout, layout);
  usePersist(kv, keys.templates, templates);
  usePersist(kv, keys.manualTests(problem.id), manual);
  usePersist(kv, keys.helpers(problem.id), helpers);
  usePersist(kv, keys.timer(problem.id), timer, 0);

  // Code is saved only once edited, so an untouched problem follows the registered template.
  const editedFamilies = useRef(new Set<Family>());
  useEffect(() => {
    if (!editedFamilies.current.size) return;
    setSaved(false);
    const id = setTimeout(() => {
      for (const f of editedFamilies.current) void kv.set(keys.code(problem.id, f), codes[f]);
      setSaved(true);
    }, 400);
    return () => clearTimeout(id);
  }, [codes, kv, problem.id]);

  const setCode = useCallback(
    (value: string, f: Family = family) => {
      editedFamilies.current.add(f);
      setCodes((c) => (c[f] === value ? c : { ...c, [f]: value }));
    },
    [family],
  );

  const onEdit = useCallback(
    (value: string) => {
      setCode(value);
      if (settings.autoStartTimer) setTimer((t) => (t.startedAt === null && t.elapsedMs === 0 ? startTimer(t) : t));
    },
    [setCode, settings.autoStartTimer],
  );

  // --- runner --------------------------------------------------------------------------
  useEffect(() => {
    void runner.status().then(setRunnerStatus, () => setRunnerStatus({ connected: false, detail: 'Runner not available' }));
  }, [runner]);

  const sampleCases: CaseSpec[] = useMemo(
    () => problem.samples.map((s, i) => ({ id: `s${i}`, input: s.input, expected: s.output })),
    [problem.samples],
  );

  const interactor = helpers.interactor ?? null;

  const run = useCallback(async () => {
    if (running) return;
    // With an interactor, custom tests are the interactor's test data; samples aren't run.
    const interactive = interactor !== null;
    const manualCases = manual.map((m) => ({ id: m.id, input: m.input, expected: m.expected }));
    const cases: CaseSpec[] = interactive ? manualCases : [...sampleCases, ...manualCases];
    if (!cases.length) {
      push('info', interactive ? 'Add a test under Custom: the data your interactor reads' : 'No tests to run — add one under Custom');
      setTestTab('manual');
      return;
    }
    setRunning(true);
    setLayout((l) => (l.testsOpen ? l : { ...l, testsOpen: true }));
    setCompile(null);
    setResults(Object.fromEntries(cases.map((c) => [c.id, pending('RUNNING')])));
    const snapshot = { lang: settings.lang, code };
    const got: Record<string, TestResult> = {};
    let compiled = true;
    try {
      await runner.run(
        {
          lang: settings.lang,
          code,
          tests: cases.map((c) => ({ id: c.id, input: c.input })),
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          interactor: interactor ?? undefined,
        },
        (ev) => {
          if (ev.type === 'compile' && ev.target === 'interactor') {
            setCompile((c) => ({
              ok: ev.ok,
              output: [c?.output, ev.output && `Interactor:\n${ev.output}`].filter(Boolean).join('\n'),
              timeMs: (c?.timeMs ?? 0) + ev.timeMs,
              title: ev.ok ? undefined : "The interactor didn't compile",
            }));
            if (!ev.ok) {
              compiled = false;
              setResults(Object.fromEntries(cases.map((c) => [c.id, pending('CE')])));
            }
            return;
          }
          if (ev.type === 'compile') {
            setCompile({ ok: ev.ok, output: ev.output, timeMs: ev.timeMs });
            if (!ev.ok) {
              compiled = false;
              setResults(Object.fromEntries(cases.map((c) => [c.id, pending('CE')])));
            }
            return;
          }
          const spec = cases.find((c) => c.id === ev.id);
          if (!spec) return;
          got[ev.id] = interactive ? judgeInteraction(ev, problem.timeLimitMs) : judge(ev, spec.expected, checkOpts, problem.timeLimitMs);
          setResults((r) => ({ ...r, [ev.id]: got[ev.id] }));
        },
      );
      setLastRun(snapshot);
      if (!compiled) {
        setTestTab('console');
        return;
      }
      const failingSample = interactive ? -1 : sampleCases.findIndex((c) => !isPass(got[c.id]));
      const failingManual = manual.findIndex((m) => !isPass(got[m.id]));
      if (failingSample >= 0) {
        setTestTab('samples');
        setFocusCase({ tab: 'samples', index: failingSample, nonce: Date.now() });
      } else if (failingManual >= 0) {
        setTestTab('manual');
        setFocusCase({ tab: 'manual', index: failingManual, nonce: Date.now() });
      } else {
        push('ok', `All ${cases.length} test${cases.length === 1 ? '' : 's'} passed`);
      }
    } catch (e) {
      setResults({});
      push('error', e instanceof Error ? e.message : 'The runner failed');
    } finally {
      setRunning(false);
    }
  }, [running, interactor, sampleCases, manual, settings.lang, code, runner, problem, checkOpts, push]);

  // --- submit ----------------------------------------------------------------------------
  const submitCheck = useMemo<SubmitCheck>(() => {
    const upToDate = lastRun?.code === code && lastRun.lang === settings.lang;
    const sum = summary(sampleCases, results);
    const warnings: string[] = [];
    if (upToDate && sum && sum.passed < sum.total) warnings.push('Some sample tests fail.');
    if (family === 'cpp' && /\bfreopen\s*\(/.test(code) && problem.inputFile === 'standard input') {
      warnings.push('Your code calls freopen, but this problem reads standard input.');
    }
    if (family === 'java' && /^\s*package\s+[\w.]+\s*;/m.test(code)) {
      warnings.push('Remove the package line — Codeforces compiles a single file.');
    }
    if (code.trim() === (defaultTemplate(templates, family)?.code ?? '').trim()) {
      warnings.push('This is still your unchanged template.');
    }
    return { samplesPassed: sum?.passed ?? 0, samplesTotal: sampleCases.length, upToDate: Boolean(upToDate && sum), warnings };
  }, [lastRun, code, settings.lang, sampleCases, results, family, problem.inputFile, templates]);

  const submissions = useSubmissions(cf, problem);

  // Errors are shown in the dialog (with a login link when needed), so it stays open.
  const doSubmit = async () => {
    const sent = await cf.submit(problem, settings.lang, code);
    setDialog(null);
    push('ok', 'Submitted — waiting for the verdict');
    submissions.track(sent);
  };

  // --- helper files (generator, brute force, interactor) ---------------------------------
  const userTemplate = useCallback((f: Family) => defaultTemplate(templates, f)?.code ?? '', [templates]);

  const createHelper = (kind: HelperKind) => {
    setHelpers((h) => (h[kind] ? h : { ...h, [kind]: { lang: settings.lang, code: helperTemplate(kind, family, userTemplate(family)) } }));
    setActiveFile(kind);
  };

  const setHelperLang = (kind: HelperKind, next: LangId) =>
    setHelpers((h) => {
      const cur = h[kind];
      if (!cur) return h;
      const from = language(cur.lang).family;
      const to = language(next).family;
      // An untouched starter follows the language; anything the user wrote is kept.
      const untouched = cur.code === helperTemplate(kind, from, userTemplate(from));
      return { ...h, [kind]: { lang: next, code: from !== to && untouched ? helperTemplate(kind, to, userTemplate(to)) : cur.code } };
    });

  const helperFile = activeFile === 'main' ? undefined : helpers[activeFile];
  const fileKind: 'main' | HelperKind = helperFile ? activeFile : 'main';
  const editLang = helperFile ? language(helperFile.lang) : lang;

  const onHelperEdit = useCallback(
    (value: string) => {
      if (fileKind === 'main') return;
      setHelpers((h) => {
        const cur = h[fileKind];
        return cur && cur.code !== value ? { ...h, [fileKind]: { ...cur, code: value } } : h;
      });
    },
    [fileKind],
  );

  // --- stress testing --------------------------------------------------------------------
  const stress = useStress(runner);
  const startStress = (maxTests: number) => {
    if (!helpers.gen || !helpers.brute) return;
    void stress.start({
      solution: { lang: settings.lang, code },
      gen: helpers.gen,
      brute: helpers.brute,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      check: checkOpts,
      maxTests,
    });
  };
  const addCustomTest = (input: string, expected: string) => {
    setManual((m) => [...m, { id: `m${Date.now().toString(36)}`, input, expected }]);
    setTestTab('manual');
    setFocusCase({ tab: 'manual', index: manual.length, nonce: Date.now() });
    push('ok', 'Added as a custom test');
  };

  // --- solutions mirrored to disk (through the runner) -------------------------------------
  const mirrorRoot = settings.solutionsFolder.trim();
  const [mirrored, setMirrored] = useState<string | null>(null);
  const mirrorError = useRef('');
  useEffect(() => {
    if (!mirrorRoot || !isFullPath(mirrorRoot) || !runner.save || !editedFamilies.current.has(family)) return;
    const save = runner.save.bind(runner);
    const id = setTimeout(() => {
      save({ root: mirrorRoot, ...mirrorPath(problem, family), code }).then(
        (path) => {
          mirrorError.current = '';
          setMirrored(path);
        },
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          if (message !== mirrorError.current) push('error', `Couldn't save to disk: ${message}`);
          mirrorError.current = message;
          setMirrored(null);
        },
      );
    }, 1500);
    return () => clearTimeout(id);
  }, [code, family, mirrorRoot, runner, problem, push]);

  // --- editor actions --------------------------------------------------------------------
  useEffect(() => {
    formatEnv.tabSize = settings.tabSize;
    formatEnv.onError = (m) => push('error', `Couldn't format: ${m}`);
  }, [settings.tabSize, push]);

  const format = () => void editorRef.current?.getAction('editor.action.formatDocument')?.run();

  const isUntouched = (c: string) => !c.trim() || templates.templates.some((t) => t.code === c);

  const insertTemplate = (t: Template) => {
    const target = t.family;
    if (target !== family) {
      const l = LANGUAGES.find((x) => x.family === target);
      if (l) setSettings((s) => ({ ...s, lang: l.id }));
    }
    setCode(t.code, target);
    setDialog(null);
    push('info', `Inserted "${t.name}" — Ctrl+Z to undo`);
  };

  const requestInsert = (t: Template, reason: 'insert' | 'reset') => {
    if (isUntouched(codes[t.family])) insertTemplate(t);
    else setDialog({ kind: 'replace', template: t, reason });
  };

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => push('error', 'Full screen is not allowed here'));
  }, [push]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // --- keyboard shortcuts (capture phase, so they work inside Monaco too) -----------------
  const shortcuts = useRef({
    run,
    openSubmit: () => {},
    openSettings: () => {},
    toggleStatement: () => {},
    toggleFullscreen,
    saved: () => {},
  });
  shortcuts.current = {
    run,
    openSubmit: () => setDialog({ kind: 'submit' }),
    openSettings: () => setDialog({ kind: 'settings' }),
    toggleStatement: () => setLayout((l) => ({ ...l, statementOpen: !l.statementOpen })),
    toggleFullscreen,
    saved: () => push('ok', 'Saved — your code is saved automatically'),
  };
  const dialogOpen = dialog !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || dialogOpen) return;
      const k = e.key.toLowerCase();
      const s = shortcuts.current;
      const act =
        k === "'" && !e.shiftKey ? s.run
        : k === 'enter' && !e.shiftKey ? s.openSubmit
        : k === 's' && !e.shiftKey ? s.saved
        : k === 'b' && !e.shiftKey ? s.toggleStatement
        : k === ',' && !e.shiftKey ? s.openSettings
        : k === 'f' && e.shiftKey ? s.toggleFullscreen
        : null;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      void act();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialogOpen]);

  const editorOptions: EditorOptions = {
    fontSize: settings.fontSize,
    tabSize: settings.tabSize,
    minimap: settings.minimap,
    wordWrap: settings.wordWrap,
    ligatures: settings.ligatures,
  };
  const familyTemplates = templates.templates.filter((t) => t.family === family);
  const registered = defaultTemplate(templates, family);
  const contestLabel = `${problem.kind === 'gym' ? 'Gym' : 'Contest'} ${problem.contestId}`;

  // --- render ----------------------------------------------------------------------------
  return (
    <div className={`app ${fullscreen ? 'is-fullscreen' : ''}`} ref={rootRef}>
      <header className="topbar">
        <div className="topbar-left">
          <Logo />
          <span className="brand">CF Studio</span>
          <span className="crumbs">
            <ChevronRight size={14} />
            <span className="crumb-muted">{contestLabel}</span>
            <ChevronRight size={14} />
            {nav && nav.problems.length > 1 && (
              <span className="problem-tabs">
                {nav.problems.map((p) => (
                  <button
                    key={p.id}
                    className={p.id === problem.id ? 'active' : ''}
                    title={p.title}
                    onClick={() => p.id !== problem.id && nav.onSelect(p.id)}
                  >
                    {p.index}
                  </button>
                ))}
              </span>
            )}
            <span className="crumb-title">{problem.title}</span>
            {nav?.onLoadAll && (
              <button
                className="tb-btn"
                disabled={nav.loadingAll}
                title="Open every problem of this contest as tabs (loads the contest's problems page once)"
                onClick={() => void nav.onLoadAll?.().catch((e: unknown) => push('error', e instanceof Error ? e.message : 'Couldn’t load the problems'))}
              >
                <ListChecks size={14} /> {nav.loadingAll ? 'Loading…' : 'All problems'}
              </button>
            )}
          </span>
        </div>

        <div className="topbar-center">
          <Timer state={timer} onChange={setTimer} />
          {contest && <ContestClock info={contest} />}
          {submissions.live && <LiveVerdict live={submissions.live} judge={cf} onDismiss={submissions.dismiss} />}
        </div>

        <div className="topbar-right">
          <span
            className={`runner-dot ${runnerStatus?.remote ? 'remote' : runnerStatus?.connected ? 'ok' : 'bad'}`}
            title={runnerStatus ? runnerStatus.detail : 'Checking runner…'}
          >
            <span className="dot" />
            <span className="runner-text">{runnerStatus ? runnerStatus.detail : 'Checking runner…'}</span>
          </span>
          <button className="icon-btn" onClick={() => setDialog({ kind: 'settings' })} title="Settings (Ctrl+,)">
            <SettingsIcon size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={toggleFullscreen}
            title={fullscreen ? 'Exit focus mode (Ctrl+Shift+F)' : 'Focus mode (Ctrl+Shift+F)'}
          >
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          {onExit && (
            <button className="icon-btn" onClick={onExit} title="Back to the Codeforces page (Alt+I)">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="workspace">
        {layout.statementOpen ? (
          <>
            <div className="col-left" style={{ width: `${layout.left}%` }}>
              <ProblemPanel
                problem={problem}
                showTags={settings.showTags}
                onCollapse={() => setLayout((l) => ({ ...l, statementOpen: false }))}
                onOpenSubmissions={() => submissions.list.status === 'idle' && void submissions.load()}
                onShowOnCodeforces={onShowOnCodeforces && (() => onShowOnCodeforces(problem))}
                submissions={
                  <SubmissionsPanel
                    state={submissions.list}
                    judge={cf}
                    loginUrl={cf.loginUrl(problem)}
                    liveId={submissions.live?.sub?.id ?? null}
                    onRefresh={() => void submissions.load()}
                  />
                }
              />
            </div>
            <Splitter direction="row" min={22} max={70} onResize={(left) => setLayout((l) => ({ ...l, left }))} />
          </>
        ) : (
          <button className="rail" onClick={() => setLayout((l) => ({ ...l, statementOpen: true }))} title="Show statement (Ctrl+B)">
            <PanelLeftOpen size={16} />
            <span className="rail-title">{problem.title}</span>
          </button>
        )}

        <div className="col-right">
          <div className="pane editor-pane" style={layout.testsOpen ? { height: `${layout.editor}%` } : { flex: 1 }}>
            <div className="editor-head">
              <div className="file-tabs">
                <button
                  className={`file-tab ${fileKind === 'main' ? 'active' : ''}`}
                  onClick={() => setActiveFile('main')}
                  title="Your solution — Run and Submit use this file"
                >
                  <span className={`lang-dot ${family}`} />
                  {FILE_NAME[family]}
                  {!saved && <span className="unsaved" title="Saving…" />}
                </button>
                {HELPER_KINDS.map((k) => {
                  const h = helpers[k];
                  if (!h) return null;
                  const name = helperFileName(k, h.lang);
                  return (
                    <button key={k} className={`file-tab ${fileKind === k ? 'active' : ''}`} onClick={() => setActiveFile(k)} title={HELPER_LABEL[k]}>
                      <span className={`lang-dot ${language(h.lang).family}`} />
                      {name}
                      <span
                        className="file-close"
                        role="button"
                        title={`Delete ${name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDialog({ kind: 'removeHelper', helper: k });
                        }}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  );
                })}
                {HELPER_KINDS.some((k) => !helpers[k]) && (
                  <Menu className="file-add" title="Add a generator, brute force or interactor" trigger={<Plus size={15} />}>
                    {(close) =>
                      HELPER_KINDS.filter((k) => !helpers[k]).map((k) => (
                        <MenuItem
                          key={k}
                          hint={HELPER_HINT[k]}
                          onClick={() => {
                            close();
                            createHelper(k);
                          }}
                        >
                          {HELPER_LABEL[k]}
                        </MenuItem>
                      ))
                    }
                  </Menu>
                )}
              </div>
              <Menu
                className="lang-menu"
                title="Language"
                trigger={
                  <>
                    {editLang.label} <ChevronDown size={13} />
                  </>
                }
              >
                {(close) =>
                  LANGUAGES.map((l) => (
                    <MenuItem
                      key={l.id}
                      selected={l.id === editLang.id}
                      onClick={() => {
                        if (fileKind === 'main') setSettings((s) => ({ ...s, lang: l.id }));
                        else setHelperLang(fileKind, l.id);
                        close();
                      }}
                    >
                      {l.label}
                    </MenuItem>
                  ))
                }
              </Menu>
              <span className="spacer" />
              {fileKind === 'main' && (
                <Menu
                  align="right"
                  title="Templates"
                  trigger={
                    <>
                      <LayoutTemplate size={14} /> <span className="tb-label">Templates</span>
                    </>
                  }
                >
                  {(close) => (
                    <>
                      <div className="menu-title">{FAMILY_LABEL[family]} templates</div>
                      {familyTemplates.length === 0 && <div className="menu-empty">None yet</div>}
                      {familyTemplates.map((t) => (
                        <MenuItem
                          key={t.id}
                          onClick={() => {
                            close();
                            requestInsert(t, 'insert');
                          }}
                          hint={t.id === registered?.id ? <Star size={12} fill="currentColor" /> : undefined}
                        >
                          {t.name}
                        </MenuItem>
                      ))}
                      <div className="menu-sep" />
                      <MenuItem
                        onClick={() => {
                          close();
                          const next = addTemplate(templates, { name: `My ${FAMILY_LABEL[family]} template`, family, code });
                          setTemplates(next);
                          setDialog({ kind: 'templates', selected: next.templates[next.templates.length - 1].id });
                        }}
                      >
                        Save current code as template…
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          close();
                          setDialog({ kind: 'templates' });
                        }}
                      >
                        Manage templates…
                      </MenuItem>
                    </>
                  )}
                </Menu>
              )}
              <button className="tb-btn" onClick={format} title="Format code (Shift+Alt+F)">
                <Wand2 size={14} /> <span className="tb-label">Format</span>
              </button>
              {fileKind === 'main' && (
                <button
                  className="tb-btn icon"
                  title="Reset to your default template"
                  onClick={() => registered && requestInsert(registered, 'reset')}
                  disabled={!registered}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>

            <div className="editor-host">
              <CodeEditor
                path={
                  fileKind === 'main'
                    ? `file:///problems/${problem.id}/main.${EXT[family]}`
                    : `file:///problems/${problem.id}/${fileKind}.${EXT[editLang.family]}`
                }
                language={editLang.monaco}
                value={helperFile ? helperFile.code : code}
                onChange={fileKind === 'main' ? onEdit : onHelperEdit}
                options={editorOptions}
                onReady={(ed) => {
                  editorRef.current = ed;
                  ed.focus();
                }}
                onCursor={(line, column) => setCursor({ line, column })}
              />
            </div>
            <div className="statusbar">
              <span>
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span>Spaces: {settings.tabSize}</span>
              <span className="spacer" />
              <span title={mirrored ? `Also saved to ${mirrored}` : undefined}>
                {saved ? (mirrored ? 'Saved · on disk' : 'Saved') : 'Saving…'}
              </span>
              <button className="status-btn" onClick={() => setLayout((l) => ({ ...l, testsOpen: !l.testsOpen }))}>
                {layout.testsOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />} Tests
              </button>
            </div>
          </div>

          {layout.testsOpen && (
            <>
              <Splitter direction="column" min={25} max={85} onResize={(editor) => setLayout((l) => ({ ...l, editor }))} />
              <TestPanel
                samples={sampleCases}
                manual={manual}
                onManualChange={setManual}
                results={results}
                compile={compile}
                tab={testTab}
                setTab={setTestTab}
                focusCase={focusCase}
                onCollapse={() => setLayout((l) => ({ ...l, testsOpen: false }))}
                interactive={interactor !== null}
                notice={
                  interactor ? (
                    <div className="notice">
                      <span>
                        Interactive mode: <b>Run</b> sends each <b>Custom</b> test to your interactor (
                        {helperFileName('interactor', interactor.lang)}) and shows the conversation. Samples aren't run.
                      </span>
                    </div>
                  ) : problem.interactive ? (
                    <div className="notice">
                      <span>This is an interactive problem. To test it here, add an interactor that plays the judge's side.</span>
                      <button className="btn ghost small" onClick={() => createHelper('interactor')}>
                        <Plus size={13} /> Create interactor
                      </button>
                    </div>
                  ) : null
                }
                stressBusy={stress.state.running}
                stress={
                  <StressPanel
                    state={stress.state}
                    hasGen={Boolean(helpers.gen)}
                    hasBrute={Boolean(helpers.brute)}
                    interactive={problem.interactive || interactor !== null}
                    remote={Boolean(runnerStatus?.remote)}
                    onCreate={createHelper}
                    onOpen={setActiveFile}
                    onStart={startStress}
                    onStop={stress.stop}
                    onAddTest={addCustomTest}
                  />
                }
              />
            </>
          )}

          <div className="action-bar">
            <button className="btn run" onClick={() => void run()} disabled={running} title="Run all tests (Ctrl+')">
              <Play size={15} className={running ? 'spin-slow' : ''} /> {running ? 'Running' : 'Run'}
              <Kbd>Ctrl '</Kbd>
            </button>
            <button className="btn primary" onClick={() => setDialog({ kind: 'submit' })} title="Submit (Ctrl+Enter)">
              <Send size={15} /> Submit
              <Kbd>Ctrl ↵</Kbd>
            </button>
          </div>
        </div>
      </div>

      {dialog?.kind === 'settings' && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'templates' && (
        <TemplateManager
          store={templates}
          onChange={setTemplates}
          family={family}
          initialSelected={dialog.selected}
          editorOptions={editorOptions}
          onInsert={(t) => requestInsert(t, 'insert')}
          onClose={() => setDialog(null)}
          notify={push}
        />
      )}
      {dialog?.kind === 'replace' && (
        <ConfirmDialog
          title={dialog.reason === 'reset' ? 'Reset your code?' : 'Replace your code?'}
          message={
            <>
              Your current {FAMILY_LABEL[dialog.template.family]} code will be replaced with <b>{dialog.template.name}</b>. You
              can get it back with Ctrl+Z.
            </>
          }
          confirmLabel={dialog.reason === 'reset' ? 'Reset' : 'Replace'}
          onCancel={() => setDialog(null)}
          onConfirm={() => insertTemplate(dialog.template)}
        />
      )}
      {dialog?.kind === 'removeHelper' && (
        <ConfirmDialog
          title={`Delete the ${HELPER_LABEL[dialog.helper].toLowerCase()}?`}
          message={<>Its code ({helperFileName(dialog.helper, helpers[dialog.helper]?.lang ?? settings.lang)}) will be deleted.</>}
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const kind = dialog.helper;
            setHelpers((h) => {
              const next = { ...h };
              delete next[kind];
              return next;
            });
            setActiveFile('main');
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'submit' && (
        <SubmitDialog
          problem={problem}
          languageLabel={lang.label}
          check={submitCheck}
          loginUrl={cf.loginUrl(problem)}
          onCancel={() => setDialog(null)}
          onConfirm={doSubmit}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}

function pending(verdict: 'RUNNING' | 'CE'): TestResult {
  return { verdict, stdout: '', stderr: '', exitCode: null, timeMs: 0, memoryKb: 0, badLines: [], message: '' };
}

function isPass(r: TestResult | undefined): boolean {
  return r?.verdict === 'AC' || r?.verdict === 'OK';
}
