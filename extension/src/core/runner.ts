import type { LangId } from './languages';

export interface Source {
  lang: LangId;
  code: string;
}

export interface RunRequest {
  lang: LangId;
  code: string;
  tests: { id: string; input: string }[];
  timeLimitMs: number;
  memoryLimitMb: number;
  /**
   * Interactive run: the interactor runs next to the program, each one's output piped into the
   * other's input. It gets the test input file and an output file as arguments (testlib style)
   * and its exit code is the verdict (0 = accepted).
   */
  interactor?: Source;
}

export interface CompileEvent {
  type: 'compile';
  ok: boolean;
  output: string;
  timeMs: number;
  /** An earlier run built the same code; the compiler didn't run. */
  cached?: boolean;
  /** "interactor" for the interactor's build in an interactive run. */
  target?: 'interactor';
}

/** What one side wrote during an interactive run, in order. */
export interface TranscriptChunk {
  from: 'solution' | 'interactor';
  text: string;
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
  /** Stopped by the wall clock while waiting rather than computing (usually: waiting for input). */
  idle?: boolean;
  /** Interactive runs only. */
  interactor?: { exitCode: number | null; stderr: string; timedOut: boolean };
  transcript?: TranscriptChunk[];
}

export type RunEvent = CompileEvent | TestEvent;

export interface RunnerStatus {
  connected: boolean;
  /** Shown to the user, e.g. "g++ 13.2 · javac 23 · Python 3.11". */
  detail: string;
}

/** A solution file to mirror to disk: `<root>/<folder>/<name>`. */
export interface SaveRequest {
  root: string;
  folder: string;
  name: string;
  code: string;
}

/** Compiles and runs code locally. Implemented by the Go runner (via native messaging). */
export interface Runner {
  status(): Promise<RunnerStatus>;
  run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void>;
  /** Write a solution file; resolves with the full path written. */
  save?(req: SaveRequest): Promise<string>;
}

/**
 * Stand-in for the preview page, which has no runner: it pretends to compile, then answers the
 * first test correctly and the rest wrongly, so every verdict view can be seen. Inputs it has no
 * answer for get a small number derived from the code and input (so a stress test soon finds a
 * difference), and interactive runs get a made-up transcript. Clearly labelled in the UI as
 * simulated.
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
    if (req.interactor) {
      onEvent({ type: 'compile', ok: true, output: '', timeMs: 410, target: 'interactor' });
      for (const t of req.tests) {
        await sleep(180);
        const secret = t.input.trim() || '?';
        onEvent({
          type: 'test',
          id: t.id,
          stdout: '',
          stderr: '',
          exitCode: 0,
          timeMs: 15,
          memoryKb: 3412,
          timedOut: false,
          memoryExceeded: false,
          interactor: { exitCode: 0, stderr: 'ok, guessed in 2 queries', timedOut: false },
          transcript: [
            { from: 'solution', text: '? 50\n' },
            { from: 'interactor', text: '<\n' },
            { from: 'solution', text: `! ${secret}\n` },
          ],
        });
      }
      return;
    }
    for (const [i, t] of req.tests.entries()) {
      await sleep(req.tests.length > 10 ? 5 : 180);
      const known = this.answers.get(t.input);
      const right = known ?? `${hash(req.code.length + ':' + t.input) % 4}\n`;
      const stdout = i === 0 || known === undefined ? right : right.replace(/\d+/, (d) => String(Number(d) + 1));
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

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
