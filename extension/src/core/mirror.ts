/**
 * Solutions mirrored to disk: every saved solution is also written (by the runner) to
 * `<folder>/<contest>/<index>.<ext>`, e.g. `C:\cp\codeforces\1915\A.cpp`, so it can be kept in
 * git or opened in another editor. Off while the folder setting is empty.
 */
import type { Family } from './languages';
import type { Problem } from './types';

const EXT: Record<Family, string> = { cpp: 'cpp', java: 'java', py: 'py' };

/** "gym100001" for gym contests, so they never mix with the contest of the same number. */
export function mirrorPath(problem: Pick<Problem, 'kind' | 'contestId' | 'index'>, family: Family): { folder: string; name: string } {
  return { folder: problem.kind === 'gym' ? `gym${problem.contestId}` : problem.contestId, name: `${problem.index}.${EXT[family]}` };
}

/** A usable folder: a full Windows (`C:\…`, `\server\…`) or POSIX (`/…`) path. */
export function isFullPath(folder: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\[^\\]+\\|\/)/.test(folder.trim());
}
