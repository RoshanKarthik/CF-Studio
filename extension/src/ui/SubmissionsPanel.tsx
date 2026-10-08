import { CheckCircle2, ExternalLink, LogIn, RefreshCw, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Judge } from '../core/judge';
import type { Submission } from '../core/submissions';
import { formatMemory, isPending, verdictText, verdictTone } from '../core/submissions';
import type { LiveSubmission, SubmissionsState } from './useSubmissions';

function when(seconds: number): string {
  const ago = Date.now() / 1000 - seconds;
  if (ago < 60) return 'just now';
  if (ago < 3600) return `${Math.floor(ago / 60)} min ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function VerdictIcon({ s }: { s: Submission }) {
  const tone = verdictTone(s);
  if (tone === 'pending') return <RefreshCw size={13} className="spin" />;
  if (tone === 'ok') return <CheckCircle2 size={13} />;
  if (tone === 'bad') return <XCircle size={13} />;
  return null;
}

function SubmissionLink({ url, children, className }: { url: string | null; children: ReactNode; className?: string }) {
  return url ? (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" title="Open on Codeforces">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

/** The verdict of the submission just sent, next to the timer: in queue → running → verdict. */
export function LiveVerdict({ live, judge, onDismiss }: { live: LiveSubmission; judge: Judge; onDismiss: () => void }) {
  const s = live.sub;
  const tone = s ? verdictTone(s) : live.done ? 'neutral' : 'pending';
  const text = s ? verdictText(s) : live.done ? live.message : 'Submitted';
  const finished = s && !isPending(s);
  return (
    <span className={`live-verdict ${tone}`} title={judge.note ?? (live.done && s ? '' : 'Checking Codeforces every few seconds')}>
      {s ? <VerdictIcon s={s} /> : !live.done && <RefreshCw size={13} className="spin" />}
      <SubmissionLink url={s ? judge.submissionUrl(s) : null} className="live-verdict-text">
        {text}
      </SubmissionLink>
      {finished && s.verdict !== 'COMPILATION_ERROR' && (
        <span className="live-verdict-stats">
          {s.timeMs} ms · {formatMemory(s.memoryBytes)}
        </span>
      )}
      {s && live.done && live.message && <span className="live-verdict-stats">{live.message}</span>}
      <button className="icon-btn small" onClick={onDismiss} title="Dismiss">
        <X size={13} />
      </button>
    </span>
  );
}

/** "Submissions" tab of the problem panel: the user's submissions for this problem. */
export function SubmissionsPanel({
  state,
  judge,
  loginUrl,
  liveId,
  onRefresh,
}: {
  state: SubmissionsState;
  judge: Judge;
  loginUrl: string | null;
  liveId: number | null;
  onRefresh: () => void;
}) {
  const loading = state.status === 'loading' || state.status === 'idle';
  return (
    <div className="pane-scroll subs">
      <div className="subs-head">
        <span className="muted">
          {state.status === 'ready' && state.handle
            ? `${state.items.length} submission${state.items.length === 1 ? '' : 's'} by ${state.handle}`
            : 'Your submissions'}
          {judge.note && <> · {judge.note}</>}
        </span>
        <button className="icon-btn small" onClick={onRefresh} disabled={loading} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading && state.items.length === 0 && <p className="subs-note">Loading…</p>}
      {state.status === 'error' && <p className="subs-note bad-text">{state.message}</p>}
      {state.status === 'ready' && state.handle === null && (
        <p className="subs-note">
          Log in to Codeforces to see your submissions.{' '}
          {loginUrl && (
            <a href={loginUrl} target="_blank" rel="noopener noreferrer">
              <LogIn size={13} /> Log in
            </a>
          )}
        </p>
      )}
      {state.status === 'ready' && state.handle !== null && state.items.length === 0 && (
        <p className="subs-note">No submissions for this problem yet.</p>
      )}

      {state.items.length > 0 && (
        <table className="subs-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Verdict</th>
              <th>Language</th>
              <th className="num">Time</th>
              <th className="num">Memory</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.items.map((s) => {
              const url = judge.submissionUrl(s);
              const done = !isPending(s);
              return (
                <tr key={s.id} className={s.id === liveId ? 'live' : ''}>
                  <td className="muted" title={new Date(s.createdAt * 1000).toLocaleString()}>
                    {when(s.createdAt)}
                  </td>
                  <td className={`verdict ${verdictTone(s)}`}>
                    <VerdictIcon s={s} /> {verdictText(s)}
                  </td>
                  <td className="lang">{s.language}</td>
                  <td className="num">{done ? `${s.timeMs} ms` : '—'}</td>
                  <td className="num">{done ? formatMemory(s.memoryBytes) : '—'}</td>
                  <td className="num">
                    {url && (
                      <a className="icon-btn small" href={url} target="_blank" rel="noopener noreferrer" title={`Submission ${s.id}`}>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
