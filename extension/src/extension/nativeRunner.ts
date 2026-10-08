import type { RunEvent, RunRequest, Runner, RunnerStatus, SaveRequest } from '../core/runner';

/** Native messaging host name registered by `cfstudio-runner install`. */
const HOST = 'com.cfstudio.runner';

interface Tool {
  path: string;
  version: string;
}

export interface Toolchains {
  cpp: Tool | null;
  javac: Tool | null;
  java: Tool | null;
  python: Tool | null;
  pypy: Tool | null;
}

type HostMessage =
  | { type: 'hello'; version: string; toolchains: Toolchains }
  | { type: 'saved'; path: string }
  | RunEvent
  | { type: 'done' }
  | { type: 'error'; message: string };

export const NOT_INSTALLED =
  "The CF Studio runner isn't installed. Run `cfstudio-runner install` once (see the README), then reload this page.";

/** "13.2.0" from "g++.exe (Rev6, Built by MSYS2 project) 13.2.0", "23.0.1" from Java's banner. */
export function versionNumber(line: string, last = false): string {
  const all = line.match(/\d+(\.\d+)+/g) ?? [];
  const v = (last ? all[all.length - 1] : all[0]) ?? '';
  return v.split('.').slice(0, 2).join('.');
}

/** One status line, e.g. "g++ 13.2 · Java 23.0 · Python 3.11", plus what's missing. */
export function summarizeToolchains(t: Toolchains): string {
  const have: string[] = [];
  const missing: string[] = [];
  if (t.cpp) have.push(`g++ ${versionNumber(t.cpp.version, true)}`);
  else missing.push('C++');
  if (t.java && t.javac) have.push(`Java ${versionNumber(t.java.version)}`);
  else missing.push('Java');
  if (t.python) have.push(`Python ${versionNumber(t.python.version)}`);
  else missing.push('Python');
  if (t.pypy) have.push(`PyPy ${versionNumber(t.pypy.version)}`);
  const text = have.join(' · ') || 'No compilers found';
  return missing.length ? `${text} (no ${missing.join(', ')})` : text;
}

function explain(error: string | undefined): string {
  if (!error) return 'The runner stopped unexpectedly.';
  return /not found|forbidden/i.test(error) ? NOT_INSTALLED : `Runner error: ${error}`;
}

/**
 * Talks to the Go runner over Chrome native messaging. Each call opens its own port, so Chrome
 * starts a fresh runner process; closing the port (or the tab) stops it and any running program.
 */
export class NativeRunner implements Runner {
  async status(): Promise<RunnerStatus> {
    try {
      const hello = await this.exchange<{ type: 'hello'; toolchains: Toolchains }>({ type: 'hello' }, 'hello', 8000);
      return { connected: true, detail: summarizeToolchains(hello.toolchains) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { connected: false, detail: message === NOT_INSTALLED ? 'Runner not installed' : message };
    }
  }

  run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const port = chrome.runtime.connectNative(HOST);
      const finish = (err?: Error) => {
        if (finished) return;
        finished = true;
        port.disconnect();
        if (err) reject(err);
        else resolve();
      };
      port.onMessage.addListener((msg: HostMessage) => {
        if (msg.type === 'compile' || msg.type === 'test') onEvent(msg);
        else if (msg.type === 'done') finish();
        else if (msg.type === 'error') finish(new Error(msg.message));
      });
      port.onDisconnect.addListener(() => finish(new Error(explain(chrome.runtime.lastError?.message))));
      port.postMessage({ type: req.interactor ? 'interact' : 'run', ...req });
    });
  }

  async save(req: SaveRequest): Promise<string> {
    const reply = await this.exchange<{ type: 'saved'; path: string }>({ type: 'save', ...req }, 'saved', 10_000);
    return reply.path;
  }

  /** Send one request and wait for the reply of the given type (or an error). */
  private exchange<T>(request: object, replyType: string, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connectNative(HOST);
      const timer = setTimeout(() => {
        port.disconnect();
        reject(new Error('The runner did not answer.'));
      }, timeoutMs);
      port.onMessage.addListener((msg: HostMessage) => {
        if (msg.type !== replyType && msg.type !== 'error') return;
        clearTimeout(timer);
        port.disconnect();
        if (msg.type === 'error') reject(new Error(msg.message));
        else resolve(msg as T);
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(timer);
        reject(new Error(explain(chrome.runtime.lastError?.message)));
      });
      port.postMessage(request);
    });
  }
}
