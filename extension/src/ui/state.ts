import type { LangId } from '../core/languages';
import { isLangId } from '../core/languages';
import type { KV } from '../core/storage';
import { keys } from '../core/storage';
import type { TemplateStore } from '../core/templates';
import { BUILTIN_TEMPLATES } from '../core/templates';
import type { ManualTest, Problem } from '../core/types';

export interface Settings {
  lang: LangId;
  /** Editor theme id (see themes.ts); also colours the whole IDE. */
  theme: string;
  fontSize: number;
  tabSize: number;
  minimap: boolean;
  wordWrap: boolean;
  ligatures: boolean;
  /** Start the stopwatch on the first keystroke in a problem. */
  autoStartTimer: boolean;
  /** Show tags and rating without clicking to reveal them. */
  showTags: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'cpp20',
  theme: 'twilight',
  fontSize: 14,
  tabSize: 4,
  minimap: false,
  wordWrap: false,
  ligatures: false,
  autoStartTimer: true,
  showTags: false,
};

export interface Layout {
  /** Statement width, % of the window. */
  left: number;
  /** Editor height, % of the right column. */
  editor: number;
  testsOpen: boolean;
  statementOpen: boolean;
}

export const DEFAULT_LAYOUT: Layout = { left: 42, editor: 60, testsOpen: true, statementOpen: true };

export interface TimerState {
  elapsedMs: number;
  /** Epoch ms when it was last started, or null while paused. */
  startedAt: number | null;
}

export interface InitialState {
  settings: Settings;
  layout: Layout;
  templates: TemplateStore;
  manualTests: ManualTest[];
  timer: TimerState;
  /** Saved code per family for this problem (missing = start from the default template). */
  code: Partial<Record<string, string>>;
}

export async function loadInitialState(kv: KV, problem: Problem): Promise<InitialState> {
  const [settings, layout, templates, manualTests, timer, cpp, java, py] = await Promise.all([
    kv.get<Partial<Settings>>(keys.settings),
    kv.get<Partial<Layout>>(keys.layout),
    kv.get<TemplateStore>(keys.templates),
    kv.get<ManualTest[]>(keys.manualTests(problem.id)),
    kv.get<TimerState>(keys.timer(problem.id)),
    kv.get<string>(keys.code(problem.id, 'cpp')),
    kv.get<string>(keys.code(problem.id, 'java')),
    kv.get<string>(keys.code(problem.id, 'py')),
  ]);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (!isLangId(merged.lang)) merged.lang = DEFAULT_SETTINGS.lang;
  return {
    settings: merged,
    layout: { ...DEFAULT_LAYOUT, ...layout },
    templates: templates?.templates ? templates : BUILTIN_TEMPLATES,
    manualTests: Array.isArray(manualTests) ? manualTests : [],
    timer: timer ?? { elapsedMs: 0, startedAt: null },
    code: { cpp, java, py },
  };
}
