import { AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
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
  onCancel,
  onConfirm,
}: {
  problem: Problem;
  languageLabel: string;
  check: SubmitCheck;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const allPass = check.upToDate && check.samplesPassed === check.samplesTotal;

  const confirm = async () => {
    setSending(true);
    try {
      await onConfirm();
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
            <Send size={14} /> {sending ? 'Submitting…' : 'Submit'} <Kbd>Enter</Kbd>
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
    </Modal>
  );
}
