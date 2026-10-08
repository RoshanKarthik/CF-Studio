import { monaco } from '../editor/monaco';

/**
 * Editor themes. Each one colours the code *and* the whole IDE: the panel colours are derived
 * from the theme's editor background, so a light theme gives a light IDE.
 */
export interface ThemeDef {
  id: ThemeId;
  label: string;
  dark: boolean;
  bg: string;
  fg: string;
  accent: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  directive: string;
  selection: string;
  lineHighlight: string;
  cursor: string;
  italicComments?: boolean;
  boldKeywords?: boolean;
}

export type ThemeId =
  | 'monokai'
  | 'github'
  | 'tomorrow'
  | 'kuroir'
  | 'twilight'
  | 'dracula'
  | 'xcode'
  | 'textmate'
  | 'solarized-dark'
  | 'solarized-light'
  | 'terminal'
  | 'eclipse';

export const THEMES: readonly ThemeDef[] = [
  {
    id: 'monokai', label: 'Monokai', dark: true, bg: '#272822', fg: '#f8f8f2', accent: '#a6e22e',
    comment: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', type: '#66d9ef',
    directive: '#f92672', selection: '#49483e', lineHighlight: '#3e3d32', cursor: '#f8f8f0',
  },
  {
    id: 'github', label: 'Github', dark: false, bg: '#ffffff', fg: '#24292e', accent: '#2c974b',
    comment: '#6a737d', keyword: '#d73a49', string: '#032f62', number: '#005cc5', type: '#6f42c1',
    directive: '#d73a49', selection: '#c8e1ff', lineHighlight: '#f6f8fa', cursor: '#24292e',
  },
  {
    id: 'tomorrow', label: 'Tomorrow', dark: false, bg: '#ffffff', fg: '#4d4d4c', accent: '#4271ae',
    comment: '#8e908c', keyword: '#8959a8', string: '#718c00', number: '#f5871f', type: '#c99e00',
    directive: '#3e999f', selection: '#d6d6d6', lineHighlight: '#efefef', cursor: '#aeafad',
  },
  {
    id: 'kuroir', label: 'Kuroir', dark: false, bg: '#e8e9e8', fg: '#363636', accent: '#8b0000',
    comment: '#2a78f0', keyword: '#8b0000', string: '#a52a2a', number: '#0000cd', type: '#6a1b9a',
    directive: '#8b0000', selection: '#f5aa0a55', lineHighlight: '#cbdc2f38', cursor: '#202020',
    italicComments: true,
  },
  {
    id: 'twilight', label: 'Twilight', dark: true, bg: '#141414', fg: '#f8f8f8', accent: '#3fa25a',
    comment: '#5f5a60', keyword: '#cda869', string: '#8f9d6a', number: '#cf6a4c', type: '#9b703f',
    directive: '#cda869', selection: '#3c4044', lineHighlight: '#1f1f1f', cursor: '#a7a7a7',
    italicComments: true,
  },
  {
    id: 'dracula', label: 'Dracula', dark: true, bg: '#282a36', fg: '#f8f8f2', accent: '#bd93f9',
    comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', type: '#8be9fd',
    directive: '#ff79c6', selection: '#44475a', lineHighlight: '#343746', cursor: '#f8f8f0',
  },
  {
    id: 'xcode', label: 'Xcode', dark: false, bg: '#ffffff', fg: '#000000', accent: '#0a64d8',
    comment: '#008e00', keyword: '#c800a4', string: '#df0002', number: '#3a00dc', type: '#790ead',
    directive: '#633820', selection: '#b5d5ff', lineHighlight: '#edf5ff', cursor: '#000000',
  },
  {
    id: 'textmate', label: 'TextMate', dark: false, bg: '#ffffff', fg: '#000000', accent: '#0000ff',
    comment: '#4c886b', keyword: '#0000ff', string: '#036a07', number: '#0000cd', type: '#6d79de',
    directive: '#0000ff', selection: '#b5d5ff', lineHighlight: '#efefef', cursor: '#000000',
  },
  {
    id: 'solarized-dark', label: 'Solarized Dark', dark: true, bg: '#002b36', fg: '#93a1a1', accent: '#2aa198',
    comment: '#657b83', keyword: '#859900', string: '#2aa198', number: '#d33682', type: '#b58900',
    directive: '#cb4b16', selection: '#073642', lineHighlight: '#073642', cursor: '#d30102',
    italicComments: true,
  },
  {
    id: 'solarized-light', label: 'Solarized Light', dark: false, bg: '#fdf6e3', fg: '#586e75', accent: '#268bd2',
    comment: '#93a1a1', keyword: '#859900', string: '#2aa198', number: '#d33682', type: '#b58900',
    directive: '#cb4b16', selection: '#e0dac6', lineHighlight: '#eee8d5', cursor: '#586e75',
    italicComments: true,
  },
  {
    id: 'terminal', label: 'Terminal', dark: true, bg: '#000000', fg: '#dedede', accent: '#33cc33',
    comment: '#7f7f7f', keyword: '#ff6347', string: '#47c147', number: '#e0c800', type: '#00bfff',
    directive: '#ff6347', selection: '#424242', lineHighlight: '#1a1a1a', cursor: '#9f9f9f',
  },
  {
    id: 'eclipse', label: 'Eclipse', dark: false, bg: '#ffffff', fg: '#000000', accent: '#3f7f5f',
    comment: '#3f7f5f', keyword: '#7f0055', string: '#2a00ff', number: '#0000c0', type: '#005032',
    directive: '#7f0055', selection: '#b5d5ff', lineHighlight: '#e8f2fe', cursor: '#000000',
    boldKeywords: true,
  },
];

export const DEFAULT_THEME: ThemeId = 'twilight';

export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}

// --- colour helpers ------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function hex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Blend `a` towards `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const strip = (c: string) => c.replace('#', '');

// --- Monaco ----------------------------------------------------------------------------------

for (const t of THEMES) {
  const lineNo = mix(t.bg, t.fg, t.dark ? 0.32 : 0.4);
  monaco.editor.defineTheme(`cfs-${t.id}`, {
    base: t.dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: strip(t.fg) },
      { token: 'comment', foreground: strip(t.comment), fontStyle: t.italicComments ? 'italic' : '' },
      { token: 'keyword', foreground: strip(t.keyword), fontStyle: t.boldKeywords ? 'bold' : '' },
      { token: 'keyword.directive', foreground: strip(t.directive) },
      { token: 'string', foreground: strip(t.string) },
      { token: 'string.escape', foreground: strip(t.number) },
      { token: 'number', foreground: strip(t.number) },
      { token: 'type', foreground: strip(t.type) },
      { token: 'annotation', foreground: strip(t.type) },
      { token: 'identifier', foreground: strip(t.fg) },
      { token: 'delimiter', foreground: strip(mix(t.fg, t.bg, 0.15)) },
    ],
    colors: {
      'editor.background': t.bg,
      'editor.foreground': t.fg,
      'editorGutter.background': t.bg,
      'minimap.background': t.bg,
      'editor.lineHighlightBackground': t.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': t.selection,
      'editor.inactiveSelectionBackground': t.selection,
      'editorCursor.foreground': t.cursor,
      'editorLineNumber.foreground': lineNo,
      'editorLineNumber.activeForeground': t.fg,
      'editorIndentGuide.background1': mix(t.bg, t.fg, 0.08),
      'editorIndentGuide.activeBackground1': mix(t.bg, t.fg, 0.22),
      'editorWhitespace.foreground': mix(t.bg, t.fg, 0.15),
      'editorBracketHighlight.foreground1': t.keyword,
      'editorBracketHighlight.foreground2': t.type,
      'editorBracketHighlight.foreground3': t.number,
      'editorBracketMatch.background': t.selection,
      'editorBracketMatch.border': t.accent,
      'editorWidget.background': mix(t.bg, t.dark ? '#ffffff' : '#000000', 0.05),
      'editorWidget.border': mix(t.bg, t.fg, 0.2),
      'editorSuggestWidget.background': mix(t.bg, t.dark ? '#ffffff' : '#000000', 0.05),
      'editorSuggestWidget.selectedBackground': t.selection,
      'scrollbarSlider.background': mix(t.bg, t.fg, 0.15) + '88',
      'scrollbarSlider.hoverBackground': mix(t.bg, t.fg, 0.25) + '99',
      'scrollbarSlider.activeBackground': mix(t.bg, t.fg, 0.32) + 'aa',
    },
  });
}

// --- whole-IDE palette -------------------------------------------------------------------------

/** CSS variables for the IDE chrome, derived from the editor theme. */
export function uiVariables(t: ThemeDef): Record<string, string> {
  const toward = t.dark ? '#ffffff' : '#000000';
  const onAccent = luminance(t.accent) > 0.4 ? '#101010' : '#ffffff';
  return {
    '--bg': mix(t.bg, '#000000', t.dark ? 0.35 : 0.07),
    '--panel': t.bg,
    '--panel-head': mix(t.bg, toward, t.dark ? 0.035 : 0.025),
    '--raised': mix(t.bg, toward, t.dark ? 0.07 : 0.05),
    '--raised-2': mix(t.bg, toward, t.dark ? 0.12 : 0.09),
    '--inset': mix(t.bg, '#000000', t.dark ? 0.25 : 0.03),
    '--popover': t.dark ? mix(t.bg, toward, 0.06) : t.bg,
    '--border': mix(t.bg, t.fg, t.dark ? 0.1 : 0.12),
    '--border-strong': mix(t.bg, t.fg, t.dark ? 0.18 : 0.22),
    '--text': mix(t.fg, t.bg, 0.04),
    '--text-2': mix(t.fg, t.bg, t.dark ? 0.28 : 0.25),
    '--muted': mix(t.fg, t.bg, t.dark ? 0.5 : 0.45),
    '--text-code': mix(t.fg, t.bg, 0.1),
    '--accent': t.accent,
    '--accent-hover': mix(t.accent, toward, 0.15),
    '--accent-soft': t.accent + '24',
    '--on-accent': onAccent,
    '--ok': t.dark ? '#4ade80' : '#15803d',
    '--ok-soft': t.dark ? '#4ade801a' : '#15803d14',
    '--bad': t.dark ? '#f87171' : '#c62828',
    '--bad-soft': t.dark ? '#f871711f' : '#c6282814',
    '--warn': t.dark ? '#fbbf24' : '#a16207',
    '--warn-soft': t.dark ? '#fbbf241a' : '#a1620714',
    '--shadow': t.dark ? '#000000a0' : '#0000002e',
    'color-scheme': t.dark ? 'dark' : 'light',
  };
}

let current: ThemeDef = themeById(DEFAULT_THEME);

export function currentMonacoTheme(): string {
  return `cfs-${current.id}`;
}

/** Recolour the editor and the IDE. */
export function applyTheme(id: string, root: HTMLElement = document.documentElement): void {
  current = themeById(id);
  monaco.editor.setTheme(`cfs-${current.id}`);
  for (const [k, v] of Object.entries(uiVariables(current))) root.style.setProperty(k, v);
}
