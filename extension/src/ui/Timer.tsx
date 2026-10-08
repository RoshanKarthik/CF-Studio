import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TimerState } from './state';

export function elapsed(t: TimerState, now = Date.now()): number {
  return t.elapsedMs + (t.startedAt === null ? 0 : now - t.startedAt);
}

export function startTimer(t: TimerState): TimerState {
  return t.startedAt === null ? { ...t, startedAt: Date.now() } : t;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Per-problem stopwatch: click to start/pause, reset button next to it. */
export function Timer({ state, onChange }: { state: TimerState; onChange: (t: TimerState) => void }) {
  const running = state.startedAt !== null;
  const [, tick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () =>
    onChange(running ? { elapsedMs: elapsed(state), startedAt: null } : { ...state, startedAt: Date.now() });

  return (
    <div className={`timer ${running ? 'running' : ''}`}>
      <button className="timer-main" onClick={toggle} title={running ? 'Pause timer' : 'Start timer'}>
        <span className="timer-time">{fmt(elapsed(state))}</span>
        {running ? <Pause size={13} /> : <Play size={13} />}
      </button>
      {(running || state.elapsedMs > 0) && (
        <button className="timer-reset" onClick={() => onChange({ elapsedMs: 0, startedAt: null })} title="Reset timer">
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}
