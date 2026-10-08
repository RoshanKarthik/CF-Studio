# CF Studio — plan

## Scope

Competitive programming only. No hints, editorials, discussions or AI features.

## Decisions

| Area | Choice | Why |
| --- | --- | --- |
| Delivery | Chrome extension (Manifest V3) + local runner | Uses the user's own Codeforces login; no password handling, no Cloudflare workarounds |
| When the IDE appears | When a problem page opens; a contest's `/problems` page loads all its problems at once | No bulk scraping (rate limits, Cloudflare blocks); one request per contest |
| UI | React 19 + Vite + TypeScript | Rich UI (panes, dialogs, template manager); official tooling |
| Editor | Monaco, trimmed to C++/Java/Python (`src/editor/monaco.ts`) | VS Code's editor; full feature set without unused language services |
| Formatting | clang-format (C++, Java) and Ruff (Python), compiled to WebAssembly | Runs in the browser, no installs; loaded on first use |
| Look | Own design: command bar (timer, Run, Submit), file-tab editor header, underline tabs; colours derived from the chosen editor theme (`src/ui/themes.ts`), default Twilight | Original look; one setting controls the whole palette, light themes give a light IDE |
| Maths in statements | KaTeX, rendering Codeforces' `$$$...$$$` TeX | Fast, offline, matches the dark theme |
| Runner | Go, talking to the extension over Chrome native messaging | Single small `.exe`; Windows Job Objects give real time *and* memory limits and kill whole process trees |
| Storage | `KV` interface: localStorage in the preview, `chrome.storage.local` in the extension | UI code never depends on where data lives |
| Output checking | Token comparison like Codeforces' default checker; float tolerance and "print any answer" read from the statement | Few false WAs on samples |

`monaco-editor` 0.57 depends on DOMPurify 3.4.15 (advisory GHSA-p98j-92pf-mc4p); `package.json`
`overrides` pins the fixed 3.4.16.

## Steps

1. **IDE UI on a preview page** — done
   - Split view: statement (KaTeX, samples with copy buttons, tags/rating hidden until revealed),
     editor, tests; resizable and collapsible panes, layout remembered
   - Command bar: per-problem timer (auto-starts on first keystroke), Run, Submit, settings, focus
     mode (full screen); editor header: language, templates, format, reset
   - Settings window: font size slider with preview, 12 themes with live previews, editor and
     practice options, shortcut list
   - Templates: add, edit, rename, delete, register a default per language, insert, save current
     code as template, import/export as JSON
   - Tests: sample tests, manual tests (with optional expected output), console for compiler
     output; verdicts AC/WA/TLE/MLE/RE/CE, differing lines highlighted, stderr shown separately
   - Submit confirmation with warnings (failing or stale samples, `freopen`, Java `package` line,
     unchanged template)
   - Code saved per problem and language; untouched problems follow the registered template
2. **Extension shell** — content script on problem pages: fetch the raw page, parse with
   `parseProblemPage`, mount the IDE in a full-page iframe (extension page) with an "Open IDE" /
   "Classic view" toggle; `chrome.storage` KV
3. **Go runner** — compile and run with the problem's time/memory limits, stream results over
   native messaging; Windows installer that registers the native messaging host; detects
   g++/javac/java/python/pypy and says what's missing
4. **Submit and verdict** — submit through Codeforces' own form in the user's session (CSRF
   token from the page), then poll `user.status` and show the live verdict in the IDE;
   per-problem submission list
5. **Extras** — stress testing (brute force + generator), contest mode (problem tabs, countdown),
   interactive problems, solutions mirrored to disk
