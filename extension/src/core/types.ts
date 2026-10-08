/** A problem as read from a Codeforces problem page. HTML fields are already sanitized. */
export interface Problem {
  /** Stable key, e.g. "1234A" or "gym100001A". */
  id: string;
  contestId: string;
  index: string;
  /** "contest" | "gym" — gym problems submit to a different URL. */
  kind: 'contest' | 'gym';
  url: string;
  /** Full title as shown, e.g. "A. Cups and Ball". */
  title: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  /** "standard input" unless the problem reads a file. */
  inputFile: string;
  outputFile: string;
  legendHtml: string;
  inputHtml: string;
  outputHtml: string;
  interactionHtml: string;
  noteHtml: string;
  samples: Sample[];
  tags: string[];
  rating: number | null;
  interactive: boolean;
}

export interface Sample {
  input: string;
  output: string;
}

/** A test the user wrote; `expected` is optional (empty means "just show my output"). */
export interface ManualTest {
  id: string;
  input: string;
  expected: string;
}

export type Verdict =
  | 'AC' // matches expected output
  | 'WA' // differs from expected output
  | 'DIFF' // differs, but the problem accepts several valid answers — check by eye
  | 'OK' // ran fine, no expected output to compare with
  | 'TLE'
  | 'MLE'
  | 'RE'
  | 'CE'
  | 'RUNNING'
  | 'PENDING';

export interface TestResult {
  verdict: Verdict;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  memoryKb: number;
  /** 1-based output lines that differ from the expected output, for highlighting. */
  badLines: number[];
  /** Human-readable explanation of a WA, e.g. "line 2: expected 3, found 4". */
  message: string;
}
