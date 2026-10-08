import type { Helpers } from '../core/helpers';
import { parseHelpers } from '../core/helpers';
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
  /** Extension: open the IDE as soon as a problem page loads (else via the launcher / Alt+I). */
  autoOpen: boolean;
  /** Also write solutions to <folder>/<contest>/<index>.<ext> through the runner; '' = off. */
  solutionsFolder: string;
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
  autoOpen: true,
  solutionsFolder: '',
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
  helpers: Helpers;
}

export async function loadInitialState(kv: KV, problem: Problem): Promise<InitialState> {
  const [settings, layout, templates, manualTests, timer, cpp, java, py, helpers] = await Promise.all([
    kv.get<Partial<Settings>>(keys.settings),
    kv.get<Partial<Layout>>(keys.layout),
    kv.get<TemplateStore>(keys.templates),
    kv.get<ManualTest[]>(keys.manualTests(problem.id)),
    kv.get<TimerState>(keys.timer(problem.id)),
    kv.get<string>(keys.code(problem.id, 'cpp')),
    kv.get<string>(keys.code(problem.id, 'java')),
    kv.get<string>(keys.code(problem.id, 'py')),
    kv.get<unknown>(keys.helpers(problem.id)),
  ]);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (!isLangId(merged.lang)) merged.lang = DEFAULT_SETTINGS.lang;
  if (typeof merged.solutionsFolder !== 'string') merged.solutionsFolder = '';
  return {
    settings: merged,
    layout: { ...DEFAULT_LAYOUT, ...layout },
    templates: templates?.templates ? templates : BUILTIN_TEMPLATES,
    manualTests: Array.isArray(manualTests) ? manualTests : [],
    timer: timer ?? { elapsedMs: 0, startedAt: null },
    code: { cpp, java, py },
    helpers: parseHelpers(helpers),
  };
}
