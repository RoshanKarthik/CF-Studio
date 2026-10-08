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
runner/      Go program that compiles and runs code locally (step 3, not started)
docs/        PLAN.md — decisions and build steps
```

## Working on the UI

```bash
cd extension
npm install
npm run dev        # preview page with a sample problem at http://127.0.0.1:5173
npm test           # parser, checker and template tests
npm run build      # type-check + production build
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
| Settings (font size, themes, editor) | `Ctrl+,` |
| Command palette | `F1` |
