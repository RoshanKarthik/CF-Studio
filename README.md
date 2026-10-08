# CF Studio

A competitive-programming IDE that opens on top of Codeforces problem pages: the statement on the
left, an editor on the right, the sample tests below. **Run** checks your code against the samples
on your own machine; nothing reaches Codeforces until you press **Submit** and confirm.

Languages: C++20, Java 21, Python 3 / PyPy 3. Twelve themes (Monokai, Github, Tomorrow, Kuroir,
Twilight, Dracula, Xcode, TextMate, Solarized Dark/Light, Terminal, Eclipse); the theme colours the
whole workspace, not just the editor.

## Install (download)

Windows, Chrome / Edge / Brave. No Chrome Web Store needed.

1. Download `cf-studio-<version>-windows.zip` from the
   [Releases page](https://github.com/OWNER/cf-studio/releases/latest) and unzip it.
2. Move the **CF Studio extension** folder somewhere it can stay (the browser loads it from there).
3. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`), turn on
   **Developer mode**, click **Load unpacked** and pick the **CF Studio extension** folder.
4. Optional, recommended: double-click `cfstudio-runner.exe`. It installs itself for your user
   (`%LOCALAPPDATA%\Programs\CF Studio`), registers with Chrome, Edge and Brave and lists the
   compilers it found on your PATH (g++ from MinGW-w64, a JDK, Python 3 / PyPy 3). Restart the
   browser. Windows may warn about an unknown publisher: **More info → Run anyway**.

Open any Codeforces problem and CF Studio opens on top of it. Without the runner, **Run** still
works while you're logged in to Codeforces: each test goes to Codeforces' Custom Invocation
(slower; stress tests, interactors and saving to disk need the runner). The top bar then shows an
**Install the runner** link.

**Updating:** download the new zip, replace the contents of your **CF Studio extension** folder,
and click the reload icon on CF Studio's card in `chrome://extensions`; your code, templates and
settings are kept (the extension ID never changes). Double-click the new `cfstudio-runner.exe`
to update the runner.

`INSTALL.txt` in the zip has the same steps.

## Layout

```
extension/   Chrome extension (TypeScript, React, Vite, Monaco) — the IDE UI and Codeforces parsing
runner/      Go native-messaging host that compiles and runs code with time/memory limits
docs/        PLAN.md — decisions and build steps
scripts/     release.ps1 — builds the download zip; INSTALL.txt goes in it
```

## Install the extension (development build)

```bash
cd extension
npm install
npm run build
```

Then in Chrome (or Edge/Brave): open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked** and pick `extension/dist`. Open any Codeforces problem: CF Studio opens on top of
it. `Alt+I` (or the ✕ in the top bar) switches back to the Codeforces page; the **CF Studio**
button at the bottom right reopens it. After rebuilding, click the reload icon on the extension's
card.

## Install the runner (runs your code)

Optional: without the runner, **Run** sends each test to Codeforces' own Custom Invocation (you
must be logged in) — slower, one test at a time, and no stress tests, interactors or saving to
disk. The top bar then shows "Running on Codeforces" with an amber dot.

A downloaded `cfstudio-runner.exe` installs itself when double-clicked: it copies itself to
`%LOCALAPPDATA%\Programs\CF Studio`, registers with Chrome, Edge and Brave, and lists the compilers
it found. To build it yourself:

Needs Go 1.27+ (`winget install GoLang.Go`) and the compilers you use on PATH: g++ (MinGW-w64),
a JDK, Python 3 / PyPy 3.

```bash
cd runner
go build -trimpath -ldflags "-s -w" -o bin/cfstudio-runner.exe .
bin/cfstudio-runner.exe install     # registers with Chrome, Edge, Brave (current user only)
bin/cfstudio-runner.exe doctor      # shows which compilers it found
```

Restart the browser after installing. `cfstudio-runner uninstall` removes the registration; run
`install` again if you move the folder. The runner compiles like Codeforces (`g++ -std=c++20 -O2
-static`, 256 MB stack, `LOCAL` defined) and judges with the problem's CPU-time and memory limits
inside a Windows Job Object, with no console windows. Builds are cached in
`%LOCALAPPDATA%\cfstudio\builds` (the 60 most recent), so running unchanged code skips the compiler.

## Stress testing, interactive problems, contest mode

- **Extra files.** The **+** next to `main.cpp` adds a generator, a brute force or an interactor,
  each in any language (they start from a working example; the brute force from your template).
  Run and Submit always use `main`.
- **Stress tab.** Runs the generator (it reads a seed from stdin), your solution and the brute force
  on 100 / 1,000 / 10,000 random tests and stops at the first difference, showing the input and
  both outputs; **Add as custom test** keeps it.
- **Interactive problems.** With an interactor, **Run** sends each Custom test to it: the interactor
  gets the test file as `argv[1]` (testlib style, `registerInteraction(argc, argv)` works) and its
  exit code is the verdict (0 = accepted). The test shows the whole conversation; a program that
  waits without flushing gets "Idleness limit exceeded".
- **Contest mode.** On a contest page the top bar shows the time left (from Codeforces' API
  `contest.standings`); during a contest every problem opens as a tab (from the contest's
  `/problems` page, one request), otherwise **All problems** does it on demand.
- **Solutions on disk.** Settings → Practice → *Save solutions to a folder*: each solution is also
  written to `<folder>\<contest>\<index>.<ext>`, e.g. `C:\cp\codeforces\1915\A.cpp`
  (`gym100001\…` for gyms).

## Submitting

**Submit** (`Ctrl+Enter`) opens a confirmation with warnings (failing or stale samples, `freopen`,
a Java `package` line, an unchanged template). Only after you confirm does the content script post
Codeforces' own submit form from the problem page, in your own logged-in session: it reads the
form (CSRF token included) from the contest, problemset or gym submit page and picks the newest
matching compiler from the form's language list (G++20, Java 21, the newest Python 3 / PyPy 3).
CF Studio never handles your password; if you're logged out it says so and links to the login
page, and a Cloudflare browser check is left for you to complete on Codeforces. Codeforces' own
errors (same code submitted before, contest not running, …) are shown in the dialog.

After a submit the top bar shows the live verdict — in queue, running on test N, then the verdict
with time and memory, linked to the submission — read from Codeforces' official API
(`user.status`) at most once every two seconds, and only while the IDE is open. The
**Submissions** tab next to **Description** lists your submissions for the problem.

## Working on the UI

```bash
cd extension
npm install
npm run dev        # preview page with a sample problem at http://127.0.0.1:5173
npm test           # parser, checker, template and submit tests
npm run build      # type-check + build the extension into dist/
```

The preview page uses a sample problem written in Codeforces' statement markup, a **simulated**
runner (the first test passes, the rest fail, so every verdict view can be seen) and a simulated
judge (a submission queues, runs a few tests and is accepted; nothing is sent to Codeforces).

## Making a release

Bump the version in `extension/package.json`, `extension/public/manifest.json` and `runner/host.go`
(the script refuses to build if they differ), then:

```bash
powershell -ExecutionPolicy Bypass -File scripts/release.ps1
```

It does a fresh `npm run build`, builds the runner with `go build -trimpath -ldflags "-s -w"`, and
writes `release/cf-studio-<version>-windows.zip` (the **CF Studio extension** folder, keeping the
manifest `key`, plus `cfstudio-runner.exe` and `INSTALL.txt` from `scripts/INSTALL.txt`). Attach
the zip to a GitHub release. The "Install the runner" links point to `RELEASES_URL` in
`extension/src/core/links.ts`.

## Shortcuts

| Action | Keys |
| --- | --- |
| Run all tests | `Ctrl+'` |
| Submit (asks to confirm) | `Ctrl+Enter` |
| Format code | `Shift+Alt+F` |
| Show/hide statement | `Ctrl+B` |
| Focus mode (full screen) | `Ctrl+Shift+F` |
| IDE ↔ Codeforces page | `Alt+I` |
| Settings (font size, themes, editor) | `Ctrl+,` |
| Command palette | `F1` |
