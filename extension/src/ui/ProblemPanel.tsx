import { Check, Clock, Copy, ExternalLink, Eye, EyeOff, FileInput, HardDrive, PanelLeftClose, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { Problem } from '../core/types';
import { renderTex } from './tex';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn small"
      title={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Section({ title, html }: { title?: string; html: string }) {
  const rendered = useMemo(() => renderTex(html), [html]);
  if (!html) return null;
  return (
    <section className="st-section">
      {title && <h3>{title}</h3>}
      {/* Statement HTML is sanitized in parseProblem (allowlisted tags/attributes, no scripts). */}
      <div className="st-html" dangerouslySetInnerHTML={{ __html: rendered }} />
    </section>
  );
}

function formatSeconds(ms: number) {
  return ms % 1000 === 0 ? `${ms / 1000} s` : `${(ms / 1000).toFixed(1)} s`;
}

export function ProblemPanel({
  problem,
  showTags,
  onCollapse,
  submissions,
  onOpenSubmissions,
  onShowOnCodeforces,
}: {
  problem: Problem;
  showTags: boolean;
  onCollapse: () => void;
  /** Extension: show the problem on Codeforces itself (else a plain link, in the preview). */
  onShowOnCodeforces?: () => void;
  /** Content of the Submissions tab. */
  submissions: ReactNode;
  onOpenSubmissions: () => void;
}) {
  const [tab, setTab] = useState<'statement' | 'submissions'>('statement');
  const [reveal, setReveal] = useState(showTags);
  const tagsVisible = showTags || reveal;
  const fileIO = problem.inputFile !== 'standard input' || problem.outputFile !== 'standard output';

  return (
    <div className="pane problem-pane">
      <div className="pane-head">
        <div className="tabs">
          <button className={`tab ${tab === 'statement' ? 'active' : ''}`} onClick={() => setTab('statement')}>
            Description
          </button>
          <button
            className={`tab ${tab === 'submissions' ? 'active' : ''}`}
            onClick={() => {
              setTab('submissions');
              onOpenSubmissions();
            }}
          >
            Submissions
          </button>
        </div>
        <div className="pane-actions">
          {onShowOnCodeforces ? (
            <button className="icon-btn" onClick={onShowOnCodeforces} title="Show on Codeforces">
              <ExternalLink size={15} />
            </button>
          ) : (
            <a className="icon-btn" href={problem.url} target="_blank" rel="noopener noreferrer" title="Open on Codeforces">
              <ExternalLink size={15} />
            </a>
          )}
          <button className="icon-btn" onClick={onCollapse} title="Hide statement (Ctrl+B)">
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {tab === 'submissions' && submissions}
      <div className="pane-scroll statement" hidden={tab !== 'statement'}>
        <h1 className="st-title">{problem.title}</h1>
        <div className="st-meta">
          <span className="chip">
            <Clock size={13} /> {formatSeconds(problem.timeLimitMs)}
          </span>
          <span className="chip">
            <HardDrive size={13} /> {problem.memoryLimitMb} MB
          </span>
          {fileIO && (
            <span className="chip warn" title="This problem reads/writes files, not stdin/stdout">
              <FileInput size={13} /> {problem.inputFile} → {problem.outputFile}
            </span>
          )}
          {problem.interactive && (
            <span className="chip info">
              <Radio size={13} /> Interactive
            </span>
          )}
          {(problem.tags.length > 0 || problem.rating !== null) && (
            <button
              className={`chip toggle ${tagsVisible ? '' : 'hidden-tags'}`}
              onClick={() => setReveal((r) => !r)}
              title={tagsVisible ? 'Hide tags and rating' : 'Reveal tags and rating'}
              disabled={showTags}
            >
              {tagsVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              {tagsVisible ? 'Tags' : 'Tags hidden'}
            </button>
          )}
        </div>
        {tagsVisible && (problem.tags.length > 0 || problem.rating !== null) && (
          <div className="st-tags">
            {problem.rating !== null && <span className="tag rating">★ {problem.rating}</span>}
            {problem.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}

        <Section html={problem.legendHtml} />
        <Section title="Input" html={problem.inputHtml} />
        <Section title="Output" html={problem.outputHtml} />
        <Section title="Interaction" html={problem.interactionHtml} />

        {problem.samples.length > 0 && (
          <section className="st-section">
            <h3>{problem.samples.length > 1 ? 'Examples' : 'Example'}</h3>
            {problem.samples.map((s, i) => (
              <div className="sample" key={i}>
                <div className="sample-col">
                  <div className="sample-head">
                    <span>Input {problem.samples.length > 1 ? i + 1 : ''}</span>
                    <CopyButton text={s.input} label="input" />
                  </div>
                  <pre>{s.input}</pre>
                </div>
                <div className="sample-col">
                  <div className="sample-head">
                    <span>Output {problem.samples.length > 1 ? i + 1 : ''}</span>
                    <CopyButton text={s.output} label="output" />
                  </div>
                  <pre>{s.output}</pre>
                </div>
              </div>
            ))}
          </section>
        )}

        <Section title="Note" html={problem.noteHtml} />
      </div>
    </div>
  );
}
