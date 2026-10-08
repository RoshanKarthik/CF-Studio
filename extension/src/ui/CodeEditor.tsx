import { useEffect, useRef } from 'react';
import { monaco } from '../editor/monaco';
import { formatCode } from '../core/format';
import type { Family } from '../core/languages';
import { currentMonacoTheme } from './themes';

export type MonacoEditor = monaco.editor.IStandaloneCodeEditor;
type MonacoLang = 'cpp' | 'java' | 'python';

/** Settings read by the formatting providers, which are registered once for the whole page. */
export const formatEnv = {
  tabSize: 4,
  onError: (_message: string) => {},
};

const FAMILY_OF: Record<MonacoLang, Family> = { cpp: 'cpp', java: 'java', python: 'py' };
for (const lang of Object.keys(FAMILY_OF) as MonacoLang[]) {
  // Makes Monaco's own "Format Document" (Shift+Alt+F, context menu) use our WASM formatters.
  monaco.languages.registerDocumentFormattingEditProvider(lang, {
    displayName: lang === 'python' ? 'Ruff' : 'clang-format',
    async provideDocumentFormattingEdits(model) {
      try {
        const text = await formatCode(model.getValue(), FAMILY_OF[lang], formatEnv.tabSize);
        return [{ range: model.getFullModelRange(), text }];
      } catch (e) {
        formatEnv.onError(e instanceof Error ? e.message : String(e));
        return [];
      }
    },
  });
}

export interface EditorOptions {
  fontSize: number;
  tabSize: number;
  minimap: boolean;
  wordWrap: boolean;
  ligatures: boolean;
}

interface Props {
  /** Identifies the document; each path keeps its own model, so undo history survives switching. */
  path: string;
  language: MonacoLang;
  value: string;
  onChange: (value: string) => void;
  options: EditorOptions;
  onReady?: (editor: MonacoEditor) => void;
  onCursor?: (line: number, column: number) => void;
}

export function CodeEditor({ path, language, value, onChange, options, onReady, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<MonacoEditor | null>(null);
  const applyingExternal = useRef(false);
  const callbacks = useRef({ onChange, onCursor });
  callbacks.current = { onChange, onCursor };

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      lineHeight: 1.6,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      // Plain indentation guides only: the coloured bracket-pair guides draw a line under the
      // current block's opening line while typing, which reads like an error underline.
      guides: { bracketPairs: false, bracketPairsHorizontal: false, indentation: true, highlightActiveIndentation: true },
      stickyScroll: { enabled: false },
      fixedOverflowWidgets: true,
      model: null,
    });
    editor.current = ed;
    const subs = [
      ed.onDidChangeModelContent(() => {
        if (!applyingExternal.current) callbacks.current.onChange(ed.getValue());
      }),
      ed.onDidChangeCursorPosition((e) => callbacks.current.onCursor?.(e.position.lineNumber, e.position.column)),
    ];
    onReady?.(ed);
    return () => {
      subs.forEach((s) => s.dispose());
      ed.dispose();
      editor.current = null;
    };
    // Created once; onReady is only meaningful at creation time.
  }, []);

  // Switch documents: reuse the model for this path if we've shown it before.
  useEffect(() => {
    const ed = editor.current;
    if (!ed) return;
    const uri = monaco.Uri.parse(path);
    let model = monaco.editor.getModel(uri);
    if (!model) model = monaco.editor.createModel(value, language, uri);
    else monaco.editor.setModelLanguage(model, language);
    if (ed.getModel() !== model) ed.setModel(model);
  }, [path, language]);

  // Apply outside changes (template inserted, reset) as an undoable edit.
  useEffect(() => {
    const ed = editor.current;
    const model = ed?.getModel();
    if (!ed || !model || model.getValue() === value) return;
    applyingExternal.current = true;
    ed.pushUndoStop();
    ed.executeEdits('cf-studio', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
    ed.pushUndoStop();
    applyingExternal.current = false;
  }, [value, path]);

  useEffect(() => {
    const ed = editor.current;
    if (!ed) return;
    ed.updateOptions({
      fontSize: options.fontSize,
      fontLigatures: options.ligatures,
      minimap: { enabled: options.minimap },
      wordWrap: options.wordWrap ? 'on' : 'off',
    });
    ed.getModel()?.updateOptions({ tabSize: options.tabSize, insertSpaces: true });
  }, [options.fontSize, options.ligatures, options.minimap, options.wordWrap, options.tabSize, path]);

  return <div ref={host} className="code-editor" />;
}
