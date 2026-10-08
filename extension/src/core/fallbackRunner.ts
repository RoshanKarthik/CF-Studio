import type { RunEvent, RunRequest, Runner, RunnerStatus, SaveRequest } from './runner';

/**
 * Uses the local runner when it is installed, and otherwise a fallback (running on Codeforces),
 * so Run works right after installing the extension. Decided once, on the first call; installing
 * the runner takes effect on the next page load.
 */
export class FallbackRunner implements Runner {
  private chosen: Promise<{ runner: Runner; status: RunnerStatus }> | null = null;

  constructor(
    private readonly local: Runner,
    private readonly fallback: Runner,
  ) {}

  private choose() {
    this.chosen ??= this.local.status().then(
      async (status) => (status.connected ? { runner: this.local, status } : { runner: this.fallback, status: await this.fallback.status() }),
      async () => ({ runner: this.fallback, status: await this.fallback.status() }),
    );
    return this.chosen;
  }

  async status(): Promise<RunnerStatus> {
    return (await this.choose()).status;
  }

  async run(req: RunRequest, onEvent: (e: RunEvent) => void): Promise<void> {
    return (await this.choose()).runner.run(req, onEvent);
  }

  async save(req: SaveRequest): Promise<string> {
    const { runner } = await this.choose();
    if (!runner.save) throw new Error('Saving solutions to a folder needs the CF Studio runner (see the README).');
    return runner.save(req);
  }
}
