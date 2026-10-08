import type { LangId } from './languages';

export interface RunRequest {
  lang: LangId;
  code: string;
  tests: { id: string; input: string }[];
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface CompileEvent {
  type: 'compile';
  ok: boolean;
  output: string;
  timeMs: number;
}

export interface TestEvent {
  type: 'test';
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  memoryKb: number;
  timedOut: boolean;
  memoryExceeded: boolean;
  /** Names a crash, e.g. "stack overflow" (Go runner). */
  detail?: string;
  /** Output was longer than the runner keeps and was cut off. */
  truncated?: boolean;
}

export type RunEvent = CompileEvent | TestEvent;

export interface RunnerStatus {
  connected: boolean;
  /** Shown to the user, e.g. "g++ 13.2 · javac 23 · Python 3.11". */
  detail: string;
}

/** Compiles and runs code locally. Implemented by the Go runner (via native messaging) later. */
export interface Runner {
  status(): Promise<RunnerStatus>;
  run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void>;
}

/**
 * Stand-in for the preview page, which has no runner: it pretends to compile, then answers the
 * first test correctly and the rest wrongly, so every verdict view can be seen. Clearly labelled
 * in the UI as simulated.
 */
export class SimulatedRunner implements Runner {
  constructor(private readonly answers: Map<string, string>) {}

  async status(): Promise<RunnerStatus> {
    return { connected: true, detail: 'Preview — results are simulated' };
  }

  async run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void> {
    await sleep(350);
    if (!req.code.trim()) {
      onEvent({ type: 'compile', ok: false, output: 'main: error: empty source file', timeMs: 120 });
      return;
    }
    onEvent({ type: 'compile', ok: true, output: '', timeMs: 640 });
    for (const [i, t] of req.tests.entries()) {
      await sleep(180);
      const right = this.answers.get(t.input) ?? '';
      const stdout = i === 0 ? right : right.replace(/\d+/, (d) => String(Number(d) + 1));
      onEvent({
        type: 'test',
        id: t.id,
        stdout: stdout || 'hello\n',
        stderr: i === 0 ? '' : 'dbg: x = 4\n',
        exitCode: 0,
        timeMs: 15 + i * 7,
        memoryKb: 3412 + i * 120,
        timedOut: false,
        memoryExceeded: false,
      });
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
