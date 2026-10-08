import { Check, ChevronDown, Circle, Loader2, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ManualTest, TestResult, Verdict } from '../core/types';

export interface CaseSpec {
  id: string;
  input: string;
  expected: string;
}

export interface CompileInfo {
  ok: boolean;
  output: string;
  timeMs: number;
}

export type TestTab = 'samples' | 'manual' | 'console';

export const VERDICT_LABEL: Record<Verdict, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  DIFF: 'Different from sample answer',
  OK: 'Ran successfully',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compilation Error',
  RUNNING: 'Running…',
  PENDING: 'Waiting…',
};

export function verdictTone(v: Verdict | undefined): 'ok' | 'bad' | 'warn' | 'busy' | 'none' {
  if (!v) return 'none';
  if (v === 'AC' || v === 'OK') return 'ok';
  if (v === 'DIFF') return 'warn';
  if (v === 'RUNNING' || v === 'PENDING') return 'busy';
  return 'bad';
}

function OutputBlock({ text, badLines, placeholder }: { text: string; badLines?: number[]; placeholder: string }) {
  if (!text) return <div className="io-box empty">{placeholder}</div>;
  const bad = new Set(badLines ?? []);
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <pre className="io-box">
      {lines.map((l, i) => (
        <span key={i} className={bad.has(i + 1) ? 'line bad' : 'line'}>
          {l || ' '}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

function ResultHeader({ result }: { result: TestResult }) {
  const tone = verdictTone(result.verdict);
  const busy = tone === 'busy';
  return (
    <div className={`result-head ${tone}`}>
      <span className="result-verdict">
        {busy && <Loader2 size={15} className="spin" />}
        {VERDICT_LABEL[result.verdict]}
      </span>
      {!busy && result.verdict !== 'CE' && (
        <span className="result-stats">
          {result.timeMs} ms · {(result.memoryKb / 1024).toFixed(1)} MB
          {result.exitCode !== null && result.exitCode !== 0 && ` · exit code ${result.exitCode}`}
        </span>
      )}
      {result.message && <div className="result-msg">{result.message}</div>}
    </div>
  );
}

function CaseView({
  spec,
  result,
  manual,
  onChange,
}: {
  spec: CaseSpec;
  result?: TestResult;
  manual?: boolean;
  onChange?: (patch: Partial<ManualTest>) => void;
}) {
  const showOutput = result && result.verdict !== 'PENDING' && result.verdict !== 'RUNNING' && result.verdict !== 'CE';
  return (
    <div className="case-view">
      {result && <ResultHeader result={result} />}
      <div className="io-label">Input</div>
      {manual ? (
        <textarea
          className="io-box editable"
          value={spec.input}
          spellCheck={false}
          placeholder="Type or paste the input…"
          onChange={(e) => onChange?.({ input: e.target.value })}
        />
      ) : (
        <OutputBlock text={spec.input} placeholder="(empty)" />
      )}
      <div className="io-grid">
        <div>
          <div className="io-label">Your output</div>
          <OutputBlock
            text={showOutput ? result.stdout : ''}
            badLines={result?.badLines}
            placeholder={result?.verdict === 'CE' ? 'Did not compile — see Console' : 'Run to see your output'}
          />
        </div>
        <div>
          <div className="io-label">Expected output</div>
          {manual ? (
            <textarea
              className="io-box editable"
              value={spec.expected}
              spellCheck={false}
              placeholder="Optional — leave empty to just see your output"
              onChange={(e) => onChange?.({ expected: e.target.value })}
            />
          ) : (
            <OutputBlock text={spec.expected} placeholder="(empty)" />
          )}
        </div>
      </div>
      {showOutput && result.stderr && (
        <>
          <div className="io-label">Debug output (stderr)</div>
          <OutputBlock text={result.stderr} placeholder="" />
        </>
      )}
    </div>
  );
}

function CaseIcon({ tone }: { tone: ReturnType<typeof verdictTone> }) {
  const icon =
    tone === 'ok' ? <Check size={13} strokeWidth={3} />
    : tone === 'bad' ? <X size={13} strokeWidth={3} />
    : tone === 'warn' ? <TriangleAlert size={12} strokeWidth={2.5} />
    : tone === 'busy' ? <Loader2 size={13} className="spin" />
    : <Circle size={8} strokeWidth={3} />;
  return <span className={`case-icon ${tone}`}>{icon}</span>;
}

function CaseTabs({
  cases,
  results,
  active,
  setActive,
  onAdd,
  onRemove,
}: {
  cases: CaseSpec[];
  results: Record<string, TestResult>;
  active: number;
  setActive: (i: number) => void;
  onAdd?: () => void;
  onRemove?: (i: number) => void;
}) {
  return (
    <div className="case-tabs">
      {cases.map((c, i) => (
        <button key={c.id} className={`case-tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
          <CaseIcon tone={verdictTone(results[c.id]?.verdict)} />
          Case {i + 1}
          {onRemove && (
            <span
              className="case-remove"
              role="button"
              title="Delete this test"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
            >
              <Trash2 size={12} />
            </span>
          )}
        </button>
      ))}
      {onAdd && (
        <button className="case-tab add" onClick={onAdd} title="Add a test">
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

export function summary(cases: CaseSpec[], results: Record<string, TestResult>) {
  const done = cases.map((c) => results[c.id]).filter((r) => r && verdictTone(r.verdict) !== 'busy');
  if (!cases.length || done.length < cases.length) return null;
  const passed = done.filter((r) => verdictTone(r.verdict) === 'ok').length;
  return { passed, total: cases.length };
}

export function TestPanel({
  samples,
  manual,
  onManualChange,
  results,
  compile,
  tab,
  setTab,
  focusCase,
  onCollapse,
}: {
  samples: CaseSpec[];
  manual: ManualTest[];
  onManualChange: (tests: ManualTest[]) => void;
  results: Record<string, TestResult>;
  compile: CompileInfo | null;
  tab: TestTab;
  setTab: (t: TestTab) => void;
  /** Bumped by the parent to jump to a case (e.g. the first failing one after a run). */
  focusCase: { tab: 'samples' | 'manual'; index: number; nonce: number } | null;
  onCollapse: () => void;
}) {
  const [activeSample, setActiveSample] = useState(0);
  const [activeManual, setActiveManual] = useState(0);

  useEffect(() => {
    if (!focusCase) return;
    if (focusCase.tab === 'samples') setActiveSample(focusCase.index);
    else setActiveManual(focusCase.index);
  }, [focusCase]);

  const manualCases: CaseSpec[] = manual.map((m) => ({ id: m.id, input: m.input, expected: m.expected }));
  const sampleSum = summary(samples, results);
  const manualSum = summary(manualCases, results);
  const sampleIdx = Math.min(activeSample, Math.max(0, samples.length - 1));
  const manualIdx = Math.min(activeManual, Math.max(0, manual.length - 1));

  const addManual = () => {
    const next = [...manual, { id: `m${Date.now().toString(36)}`, input: '', expected: '' }];
    onManualChange(next);
    setActiveManual(next.length - 1);
  };

  return (
    <div className="pane test-pane">
      <div className="pane-head">
        <div className="tabs">
          <button className={`tab ${tab === 'samples' ? 'active' : ''}`} onClick={() => setTab('samples')}>
            Samples
            {sampleSum && (
              <span className={`badge ${sampleSum.passed === sampleSum.total ? 'ok' : 'bad'}`}>
                {sampleSum.passed}/{sampleSum.total}
              </span>
            )}
          </button>
          <button className={`tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>
            Custom
            {manualSum ? (
              <span className={`badge ${manualSum.passed === manualSum.total ? 'ok' : 'bad'}`}>
                {manualSum.passed}/{manualSum.total}
              </span>
            ) : (
              manual.length > 0 && <span className="badge">{manual.length}</span>
            )}
          </button>
          <button className={`tab ${tab === 'console' ? 'active' : ''}`} onClick={() => setTab('console')}>
            Console
            {compile && !compile.ok && <span className="badge bad">!</span>}
          </button>
        </div>
        <div className="pane-actions">
          <button className="icon-btn" onClick={onCollapse} title="Hide tests">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="pane-scroll tests-body">
        {tab === 'samples' &&
          (samples.length ? (
            <>
              <CaseTabs cases={samples} results={results} active={sampleIdx} setActive={setActiveSample} />
              <CaseView spec={samples[sampleIdx]} result={results[samples[sampleIdx].id]} />
            </>
          ) : (
            <div className="empty-state">This problem has no sample tests. Add your own under Custom.</div>
          ))}

        {tab === 'manual' &&
          (manual.length ? (
            <>
              <CaseTabs
                cases={manualCases}
                results={results}
                active={manualIdx}
                setActive={setActiveManual}
                onAdd={addManual}
                onRemove={(i) => onManualChange(manual.filter((_, j) => j !== i))}
              />
              <CaseView
                spec={manualCases[manualIdx]}
                result={results[manual[manualIdx].id]}
                manual
                onChange={(patch) => onManualChange(manual.map((m, j) => (j === manualIdx ? { ...m, ...patch } : m)))}
              />
            </>
          ) : (
            <div className="empty-state">
              <p>Add your own tests — edge cases, big inputs, anything the samples miss.</p>
              <button className="btn ghost" onClick={addManual}>
                <Plus size={14} /> Add a test
              </button>
            </div>
          ))}

        {tab === 'console' && (
          <div className="console">
            {!compile ? (
              <div className="empty-state">Compiler messages and warnings appear here after you run.</div>
            ) : (
              <>
                <div className={`result-head ${compile.ok ? 'ok' : 'bad'}`}>
                  <span className="result-verdict">{compile.ok ? 'Compiled' : 'Compilation Error'}</span>
                  <span className="result-stats">{compile.timeMs} ms</span>
                </div>
                <pre className="io-box console-out">{compile.output || 'No warnings.'}</pre>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
