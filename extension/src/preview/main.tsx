import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SimulatedJudge } from '../core/judge';
import { parseProblemPage } from '../core/parseProblem';
import { SimulatedRunner } from '../core/runner';
import { LocalStorageKV } from '../core/storage';
import { App } from '../ui/App';
import { loadInitialState } from '../ui/state';
import { applyTheme } from '../ui/themes';
import '../ui/styles.css';
import fixture from './fixture.html?raw';

// The preview renders the IDE outside Codeforces: a fixture problem in Codeforces' own markup,
// browser storage, a simulated runner and a simulated judge. The extension swaps in the real page,
// chrome.storage, the Go runner and submitting through the Codeforces page.
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
        judge={new SimulatedJudge()}
      />
    </StrictMode>,
  );
});
