import { AlertTriangle, CheckCircle2, LogIn, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { SubmitError } from '../core/judge';
import type { Problem } from '../core/types';
import { Kbd, Modal } from './primitives';

export interface SubmitCheck {
  samplesPassed: number;
  samplesTotal: number;
  /** Samples have been run against the current code. */
  upToDate: boolean;
  warnings: string[];
}

export function SubmitDialog({
  problem,
  languageLabel,
  check,
  loginUrl,
  onCancel,
  onConfirm,
}: {
  problem: Problem;
  languageLabel: string;
  check: SubmitCheck;
  loginUrl: string | null;
  onCancel: () => void;
  /** Rejects with the reason Codeforces gave; the dialog shows it and stays open. */
  onConfirm: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; login: boolean } | null>(null);
  const allPass = check.upToDate && check.samplesPassed === check.samplesTotal;

  const confirm = async () => {
    setSending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError({
        message: e instanceof Error && e.message ? e.message : 'The submission failed.',
        login: e instanceof SubmitError && e.login,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Submit to Codeforces?"
      onClose={onCancel}
      footer={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={confirm} disabled={sending} autoFocus>
            <Send size={14} /> {sending ? 'Submitting…' : error ? 'Try again' : 'Submit'} <Kbd>Enter</Kbd>
          </button>
        </>
      }
    >
      <dl className="submit-facts">
        <dt>Problem</dt>
        <dd>
          {problem.title} <span className="muted">({problem.kind === 'gym' ? 'gym ' : ''}
          {problem.contestId}
          {problem.index})</span>
        </dd>
        <dt>Language</dt>
        <dd>{languageLabel}</dd>
        <dt>Samples</dt>
        <dd className={allPass ? 'ok-text' : 'warn-text'}>
          {allPass ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {check.upToDate
            ? `${check.samplesPassed} of ${check.samplesTotal} passed`
            : 'Not run on this version of your code'}
        </dd>
      </dl>
      {check.warnings.length > 0 && (
        <ul className="submit-warnings">
          {check.warnings.map((w) => (
            <li key={w}>
              <AlertTriangle size={14} /> {w}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="submit-error" role="alert">
          <XCircle size={15} />
          <div>
            <b>Not submitted.</b> {error.message}
            {error.login && loginUrl && (
              <div>
                <a href={loginUrl} target="_blank" rel="noopener noreferrer">
                  <LogIn size={13} /> Log in to Codeforces
                </a>{' '}
                <span className="muted">(then come back and submit again)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
