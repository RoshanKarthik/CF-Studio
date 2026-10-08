import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseProblemPage } from '../core/parseProblem';
import { SimulatedRunner } from '../core/runner';
import { LocalStorageKV } from '../core/storage';
import { App } from '../ui/App';
import { loadInitialState } from '../ui/state';
import { applyTheme } from '../ui/themes';
import '../ui/styles.css';
import fixture from './fixture.html?raw';

// The preview renders the IDE outside Codeforces: a fixture problem in Codeforces' own markup,
// browser storage, and a simulated runner. The extension swaps in the real page, chrome.storage
// and the Go runner.
const url = 'https://codeforces.com/contest/2001/problem/A';
const [problem] = parseProblemPage(new DOMParser().parseFromString(fixture, 'text/html'), url);
const runner = new SimulatedRunner(new Map(problem.samples.map((s) => [s.input, s.output])));
const kv = new LocalStorageKV('cfstudio-preview:');

void loadInitialState(kv, problem).then((initial) => {
  applyTheme(initial.settings.theme);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App
        problem={problem}
        runner={runner}
        kv={kv}
        initial={initial}
        submit={async () => 'Preview mode — nothing was sent to Codeforces'}
      />
    </StrictMode>,
  );
});
