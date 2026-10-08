import { Download, FileCode2, Plus, Star, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Family } from '../core/languages';
import { FAMILY_LABEL } from '../core/languages';
import type { Template, TemplateStore } from '../core/templates';
import {
  addTemplate,
  defaultTemplate,
  exportTemplates,
  importTemplates,
  registerDefault,
  removeTemplate,
  updateTemplate,
} from '../core/templates';
import type { EditorOptions } from './CodeEditor';
import { CodeEditor } from './CodeEditor';
import { ConfirmDialog, Modal } from './primitives';

const FAMILIES: Family[] = ['cpp', 'java', 'py'];
const MONACO: Record<Family, 'cpp' | 'java' | 'python'> = { cpp: 'cpp', java: 'java', py: 'python' };

export function TemplateManager({
  store,
  onChange,
  family,
  initialSelected,
  editorOptions,
  onInsert,
  onClose,
  notify,
}: {
  store: TemplateStore;
  onChange: (s: TemplateStore) => void;
  family: Family;
  /** Template to open on (e.g. one just created from the editor's code). */
  initialSelected?: string;
  editorOptions: EditorOptions;
  onInsert: (t: Template) => void;
  onClose: () => void;
  notify: (kind: 'ok' | 'error', text: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(
    () => initialSelected ?? defaultTemplate(store, family)?.id ?? store.templates[0]?.id ?? null,
  );
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const current = store.templates.find((t) => t.id === selected) ?? null;
  const isDefault = (t: Template) => store.defaults[t.family] === t.id;

  const create = () => {
    const f = current?.family ?? family;
    const next = addTemplate(store, { name: `New ${FAMILY_LABEL[f]} template`, family: f, code: '' });
    onChange(next);
    setSelected(next.templates[next.templates.length - 1].id);
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(exportTemplates(store), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cf-studio-templates.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = async (file: File) => {
    try {
      const { store: next, added } = importTemplates(store, JSON.parse(await file.text()));
      onChange(next);
      notify('ok', `Imported ${added} template${added === 1 ? '' : 's'}`);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  return (
    <Modal
      wide
      title="Templates"
      onClose={onClose}
      footer={
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            <Upload size={14} /> Import
          </button>
          <button className="btn ghost" onClick={exportFile} disabled={!store.templates.length}>
            <Download size={14} /> Export
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="tm">
        <div className="tm-list">
          <button className="btn ghost full" onClick={create}>
            <Plus size={14} /> New template
          </button>
          {FAMILIES.map((f) => {
            const items = store.templates.filter((t) => t.family === f);
            return (
              <div key={f} className="tm-group">
                <div className="tm-group-title">{FAMILY_LABEL[f]}</div>
                {items.length === 0 && <div className="tm-empty">No templates</div>}
                {items.map((t) => (
                  <button
                    key={t.id}
                    className={`tm-item ${t.id === selected ? 'active' : ''}`}
                    onClick={() => setSelected(t.id)}
                  >
                    <FileCode2 size={14} />
                    <span className="tm-name">{t.name || 'Untitled'}</span>
                    {isDefault(t) && (
                      <span className="tm-default" title="Registered default">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {current ? (
          <div className="tm-detail">
            <div className="tm-row">
              <input
                className="input"
                value={current.name}
                maxLength={80}
                placeholder="Template name"
                onChange={(e) => onChange(updateTemplate(store, current.id, { name: e.target.value }))}
              />
              <div className="segmented">
                {FAMILIES.map((f) => (
                  <button
                    key={f}
                    className={current.family === f ? 'active' : ''}
                    onClick={() => onChange(updateTemplate(store, current.id, { family: f }))}
                  >
                    {FAMILY_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="tm-row">
              {isDefault(current) ? (
                <span className="tm-registered">
                  <Star size={14} fill="currentColor" /> Default for new {FAMILY_LABEL[current.family]} problems
                </span>
              ) : (
                <button className="btn ghost" onClick={() => onChange(registerDefault(store, current.id))}>
                  <Star size={14} /> Register as default for {FAMILY_LABEL[current.family]}
                </button>
              )}
              <span className="spacer" />
              <button className="btn ghost" onClick={() => onInsert(current)}>
                Insert into editor
              </button>
              <button className="btn ghost danger-text" onClick={() => setPendingDelete(current)}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
            <div className="tm-editor">
              <CodeEditor
                path={`inmemory://templates/${current.id}`}
                language={MONACO[current.family]}
                value={current.code}
                onChange={(code) => onChange(updateTemplate(store, current.id, { code }))}
                options={{ ...editorOptions, minimap: false }}
              />
            </div>
          </div>
        ) : (
          <div className="tm-detail empty-state">Pick a template, or create a new one.</div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete template?"
          message={
            <>
              <b>{pendingDelete.name}</b> will be removed.
              {isDefault(pendingDelete) && ' It is your registered default, so the next template in that language takes over.'}
            </>
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const next = removeTemplate(store, pendingDelete.id);
            onChange(next);
            setSelected(next.templates.find((t) => t.family === pendingDelete.family)?.id ?? next.templates[0]?.id ?? null);
            setPendingDelete(null);
          }}
        />
      )}
    </Modal>
  );
}
