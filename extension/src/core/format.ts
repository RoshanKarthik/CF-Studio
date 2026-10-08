import type { Family } from './languages';

/**
 * Code formatting, entirely in the browser: clang-format (C++ and Java) and Ruff (Python),
 * both compiled to WebAssembly. Each is downloaded and initialised on first use only.
 */

type Formatter = (code: string, tabSize: number) => string;

let clang: Promise<typeof import('@wasm-fmt/clang-format/vite')> | null = null;
let ruff: Promise<typeof import('@wasm-fmt/ruff_fmt/vite')> | null = null;

function loadClang() {
  clang ??= import('@wasm-fmt/clang-format/vite').then(async (m) => {
    await m.default();
    return m;
  });
  return clang;
}

function loadRuff() {
  ruff ??= import('@wasm-fmt/ruff_fmt/vite').then(async (m) => {
    await m.default();
    return m;
  });
  return ruff;
}

function clangStyle(tabSize: number, java: boolean): string {
  const common = [
    'BasedOnStyle: Google',
    `IndentWidth: ${tabSize}`,
    `ContinuationIndentWidth: ${tabSize}`,
    'ColumnLimit: 100',
    'AllowShortIfStatementsOnASingleLine: Never',
    'AllowShortLoopsOnASingleLine: false',
    'AllowShortFunctionsOnASingleLine: None',
    'AllowShortBlocksOnASingleLine: Never',
  ];
  if (!java) common.push('AccessModifierOffset: -' + tabSize, 'DerivePointerAlignment: false');
  return `{${common.join(', ')}}`;
}

async function formatterFor(family: Family): Promise<Formatter> {
  if (family === 'py') {
    const m = await loadRuff();
    return (code, tabSize) => m.format(code, undefined, { indent_width: tabSize, line_width: 100 });
  }
  const m = await loadClang();
  const java = family === 'java';
  return (code, tabSize) => m.format(code, java ? 'Main.java' : 'main.cpp', clangStyle(tabSize, java));
}

/** Format `code`; throws with the formatter's message on a syntax error it can't handle. */
export async function formatCode(code: string, family: Family, tabSize: number): Promise<string> {
  const fmt = await formatterFor(family);
  return fmt(code, tabSize);
}
