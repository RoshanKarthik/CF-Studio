# CF Studio

A competitive-programming IDE that opens on top of Codeforces problem pages: the statement on the
left, an editor on the right, the sample tests below. **Run** checks your code against the samples
on your own machine; nothing reaches Codeforces until you press **Submit** and confirm.

Languages: C++20, Java 21, Python 3 / PyPy 3. Twelve themes (Monokai, Github, Tomorrow, Kuroir,
Twilight, Dracula, Xcode, TextMate, Solarized Dark/Light, Terminal, Eclipse); the theme colours the
whole workspace, not just the editor.

## Layout

```
extension/   Chrome extension (TypeScript, React, Vite, Monaco) — the IDE UI and Codeforces parsing
runner/      Go native-messaging host that compiles and runs code with time/memory limits
docs/        PLAN.md — decisions and build steps
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
inside a Windows Job Object, with no console windows.

## Working on the UI

```bash
cd extension
npm install
npm run dev        # preview page with a sample problem at http://127.0.0.1:5173
npm test           # parser, checker and template tests
npm run build      # type-check + build the extension into dist/
```

The preview page uses a sample problem written in Codeforces' statement markup and a **simulated**
runner (the first test passes, the rest fail, so every verdict view can be seen).

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
