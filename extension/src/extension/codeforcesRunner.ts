import { customTestEvent } from '../core/customTest';
import type { RunEvent, RunRequest, Runner, RunnerStatus } from '../core/runner';
import type { PageBridge } from './pageBridge';

/**
 * Runs tests on Codeforces' own servers (Custom Invocation) through the content script, in the
 * user's session — used when the local runner isn't installed. One invocation per test, one at a
 * time; Codeforces compiles each time, so it's slower than the local runner. Stress tests,
 * interactors and saving to disk need the local runner.
 */
export class CodeforcesRunner implements Runner {
  constructor(private readonly bridge: PageBridge) {}

  async status(): Promise<RunnerStatus> {
    return { connected: true, remote: true, detail: 'Running on Codeforces (runner not installed)' };
  }

  async run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void> {
    if (req.interactor) {
      throw new Error('Testing with an interactor needs the CF Studio runner on this computer (see the README).');
    }
    let compiled = false;
    for (const t of req.tests) {
      const result = await this.bridge.customTest(req.lang, req.code, t.input);
      const mapped = customTestEvent(result, t.id, req);
      if ('compileError' in mapped) {
        onEvent({ type: 'compile', ok: false, output: mapped.compileError, timeMs: 0 });
        return;
      }
      if (!compiled) {
        compiled = true;
        onEvent({ type: 'compile', ok: true, output: '', timeMs: 0 });
      }
      onEvent(mapped.event);
    }
    if (!compiled) onEvent({ type: 'compile', ok: true, output: '', timeMs: 0 });
  }
}
