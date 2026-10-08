import type { ContestInfo } from '../core/contest';
import { parseContest } from '../core/contest';
import type { Judge, SubmissionList, SubmitOutcome } from '../core/judge';
import { SubmitError } from '../core/judge';
import type { LangId } from '../core/languages';
import type { Submission } from '../core/submissions';
import { parseUserStatus, submissionPath } from '../core/submissions';
import type { Problem } from '../core/types';
import type { ContestReply, IdeMessage, PageMessage, ProblemsReply, StatusReply, SubmitReply } from './messages';

type Reply = SubmitReply | StatusReply | ContestReply | ProblemsReply;
const REPLY_TYPES = new Set<string>(['cfs:submit-result', 'cfs:status-result', 'cfs:contest-result', 'cfs:problems-result']);

/**
 * The IDE's side of talking to Codeforces: asks the content script (which runs on the Codeforces
 * page, in the user's session) to submit, to read `user.status`, the contest's timing, or all
 * the contest's statements. Replies come from the page window, so they are checked here like any
 * other page data. While the IDE is hidden, status requests wait until it is shown again, which
 * pauses verdict polling.
 */
export class PageBridge implements Judge {
  private nextId = 1;
  private waiting = new Map<number, (r: Reply) => void>();
  private visible = true;
  private onShown: (() => void)[] = [];

  constructor(
    private readonly parentOrigin: string,
    private readonly send: (msg: IdeMessage) => void,
  ) {}

  /** Feed every message from the parent window here (already checked for source and origin). */
  handle(data: PageMessage) {
    if (data.type === 'cfs:visible') {
      this.visible = data.visible === true;
      if (this.visible) for (const f of this.onShown.splice(0)) f();
      return;
    }
    if (data.type === 'cfs:init' || !REPLY_TYPES.has(data.type) || typeof data.id !== 'number') return;
    const done = this.waiting.get(data.id);
    if (!done) return;
    this.waiting.delete(data.id);
    done(data);
  }

  private request<T extends Reply>(make: (id: number) => IdeMessage, type: T['type'], timeoutMs: number): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error('Codeforces took too long to answer.'));
      }, timeoutMs);
      this.waiting.set(id, (r) => {
        clearTimeout(timer);
        if (r.type === type) resolve(r as T);
        else reject(new Error('Unexpected reply from the page.'));
      });
      this.send(make(id));
    });
  }

  private whenVisible(): Promise<void> {
    return this.visible ? Promise.resolve() : new Promise((r) => this.onShown.push(r));
  }

  async submit(problem: Problem, lang: LangId, code: string): Promise<SubmitOutcome> {
    const submittedAt = Math.floor(Date.now() / 1000);
    const r = await this.request<SubmitReply>(
      (id) => ({ type: 'cfs:submit', id, index: problem.index, lang, code }),
      'cfs:submit-result',
      90_000,
    );
    if (r.ok !== true) {
      const message = typeof r.message === 'string' && r.message ? r.message.slice(0, 500) : 'Codeforces rejected the submission.';
      throw new SubmitError(message, r.login === true);
    }
    const sid = r.submissionId;
    return { submissionId: typeof sid === 'number' && Number.isSafeInteger(sid) && sid > 0 ? sid : null, submittedAt };
  }

  async submissions(problem: Problem, count: number): Promise<SubmissionList> {
    await this.whenVisible();
    const r = await this.request<StatusReply>(
      (id) => ({ type: 'cfs:status', id, index: problem.index, count }),
      'cfs:status-result',
      60_000,
    );
    if (r.ok !== true) throw new Error(typeof r.message === 'string' ? r.message.slice(0, 300) : 'Codeforces API error');
    if (r.handle === null) return { handle: null, items: [] };
    const handle = typeof r.handle === 'string' && /^[\w.-]{1,40}$/.test(r.handle) ? r.handle : null;
    const parsed = parseUserStatus(r.data, problem);
    if (!parsed.ok) throw new Error(parsed.message);
    return { handle, items: parsed.items };
  }

  /** Contest mode: the contest's phase and time, or null if unavailable (e.g. problemset page). */
  async contest(): Promise<ContestInfo | null> {
    const r = await this.request<ContestReply>((id) => ({ type: 'cfs:contest', id }), 'cfs:contest-result', 60_000);
    return r.ok === true ? parseContest(r.data, Date.now()) : null;
  }

  /** Contest mode: the contest's /problems page (URL and statement HTML, still to be sanitized). */
  async allProblems(): Promise<{ url: string; html: string }> {
    const r = await this.request<ProblemsReply>((id) => ({ type: 'cfs:problems', id }), 'cfs:problems-result', 60_000);
    if (r.ok !== true) throw new Error(typeof r.message === 'string' ? r.message.slice(0, 300) : 'Couldn’t load the problems');
    if (typeof r.url !== 'string' || typeof r.html !== 'string') throw new Error('Unexpected reply from the page.');
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      throw new Error('Unexpected reply from the page.');
    }
    if (url.origin !== this.parentOrigin || !/^\/(contest|gym)\/\d+\/problems\/?$/.test(url.pathname)) {
      throw new Error('Unexpected problems page address.');
    }
    return { url: url.href, html: r.html };
  }

  submissionUrl(s: Submission): string {
    return this.parentOrigin + submissionPath(s);
  }

  loginUrl(problem: Problem): string {
    let back = '/';
    try {
      back = new URL(problem.url).pathname;
    } catch {
      // Keep "/".
    }
    return `${this.parentOrigin}/enter?back=${encodeURIComponent(back)}`;
  }
}
