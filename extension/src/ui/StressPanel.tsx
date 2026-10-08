import { CheckCircle2, Download, FilePlus2, Loader2, Play, Plus, Square, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { HelperKind } from '../core/helpers';
import { HELPER_LABEL } from '../core/helpers';
import { RELEASES_URL } from '../core/links';
import type { StressOutcome } from '../core/stress';
import { OutputBlock, ResultHeader } from './TestPanel';
import type { StressState } from './useStress';

const LIMITS = [100, 1000, 10000];

/** Stress tab: generator + brute force vs. your solution, until a test shows a difference. */
export function StressPanel({
  state,
  hasGen,
  hasBrute,
  interactive,
  remote,
  onCreate,
  onOpen,
  onStart,
  onStop,
  onAddTest,
}: {
  state: StressState;
  hasGen: boolean;
  hasBrute: boolean;
  interactive: boolean;
  /** Code runs on Codeforces (no local runner): too slow, and too many requests, for stress tests. */
  remote: boolean;
  onCreate: (kind: HelperKind) => void;
  onOpen: (kind: HelperKind) => void;
  onStart: (maxTests: number) => void;
  onStop: () => void;
  onAddTest: (input: string, expected: string) => void;
}) {
  const [maxTests, setMaxTests] = useState(1000);

  if (remote) {
    return (
      <div className="empty-state">
        <p>
          Stress testing runs thousands of tests, so it needs the CF Studio runner on this computer. Without it, Run uses
          Codeforces' Custom Invocation, one test at a time.
        </p>
        <a className="btn ghost" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          <Download size={14} /> Install the runner
        </a>
      </div>
    );
  }
  if (interactive) {
    return <div className="empty-state">Stress testing compares outputs, so it isn't available for interactive problems.</div>;
  }
  if (!hasGen || !hasBrute) {
    return (
      <div className="empty-state stress-intro">
        <p>
          Stress testing runs your solution and a simple brute force on many random tests from a generator, and stops at the
          first test where they disagree.
        </p>
        <div className="stress-create">
          {(['gen', 'brute'] as const).map((kind) =>
            (kind === 'gen' ? hasGen : hasBrute) ? (
              <button key={kind} className="btn ghost" onClick={() => onOpen(kind)}>
                <CheckCircle2 size={14} /> {HELPER_LABEL[kind]}
              </button>
            ) : (
              <button key={kind} className="btn ghost" onClick={() => onCreate(kind)}>
                <FilePlus2 size={14} /> Create {HELPER_LABEL[kind].toLowerCase()}
              </button>
            ),
          )}
        </div>
      </div>
    );
  }

  const o = state.outcome;
  return (
    <div className="stress">
      <div className="stress-bar">
        {state.running ? (
          <button className="btn" onClick={onStop}>
            <Square size={13} /> Stop
          </button>
        ) : (
          <button className="btn run" onClick={() => onStart(maxTests)}>
            <Play size={14} /> Start
          </button>
        )}
        <span className="muted">up to</span>
        <div className="seg">
          {LIMITS.map((n) => (
            <button key={n} className={n === maxTests ? 'active' : ''} disabled={state.running} onClick={() => setMaxTests(n)}>
              {n.toLocaleString()}
            </button>
          ))}
        </div>
        <span className="muted">tests</span>
        <span className="spacer" />
        <button className="tb-btn" onClick={() => onOpen('gen')}>
          gen
        </button>
        <button className="tb-btn" onClick={() => onOpen('brute')}>
          brute
        </button>
      </div>

      {state.running && (
        <div className="stress-status">
          <Loader2 size={15} className="spin" /> {state.tests.toLocaleString()} tests agree so far…
        </div>
      )}
      {!state.running && !o && (
        <div className="stress-status muted">Each test uses a new seed; the generator reads it from stdin.</div>
      )}
      {o && <Outcome outcome={o} onAddTest={onAddTest} />}
    </div>
  );
}

function Outcome({ outcome: o, onAddTest }: { outcome: StressOutcome; onAddTest: (input: string, expected: string) => void }) {
  if (o.kind === 'passed') {
    return (
      <div className="stress-status ok-text">
        <CheckCircle2 size={15} /> All {o.tests.toLocaleString()} tests agree with the brute force.
      </div>
    );
  }
  if (o.kind === 'stopped') {
    return <div className="stress-status muted">Stopped after {o.tests.toLocaleString()} tests — no difference found.</div>;
  }
  if (o.kind === 'error') {
    return (
      <div className="case-view">
        <div className="stress-status bad-text">
          <XCircle size={15} /> {o.message}
        </div>
        {o.detail && <OutputBlock text={o.detail} placeholder="" />}
        {o.input !== undefined && (
          <>
            <div className="io-label">Input{o.seed !== undefined && ` (seed ${o.seed})`}</div>
            <OutputBlock text={o.input} placeholder="(empty)" />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="case-view">
      <ResultHeader result={o.result} />
      <div className="stress-found">
        <span className="muted">
          Test {o.tests.toLocaleString()} · seed {o.seed}
        </span>
        <button className="btn ghost small" onClick={() => onAddTest(o.input, o.expected)}>
          <Plus size={13} /> Add as custom test
        </button>
      </div>
      <div className="io-label">Input</div>
      <OutputBlock text={o.input} placeholder="(empty)" />
      <div className="io-grid">
        <div>
          <div className="io-label">Your output</div>
          <OutputBlock text={o.result.stdout} badLines={o.result.badLines} placeholder="(no output)" />
        </div>
        <div>
          <div className="io-label">Brute force output</div>
          <OutputBlock text={o.expected} placeholder="(no output)" />
        </div>
      </div>
      {o.result.stderr && (
        <>
          <div className="io-label">Debug output (stderr)</div>
          <OutputBlock text={o.result.stderr} placeholder="" />
        </>
      )}
    </div>
  );
}
