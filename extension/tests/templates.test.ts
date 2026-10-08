import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TEMPLATES,
  addTemplate,
  defaultTemplate,
  exportTemplates,
  importTemplates,
  registerDefault,
  removeTemplate,
  updateTemplate,
} from '../src/core/templates';

describe('templates', () => {
  it('ships a registered default for every language', () => {
    for (const f of ['cpp', 'java', 'py'] as const) {
      expect(defaultTemplate(BUILTIN_TEMPLATES, f)?.family).toBe(f);
    }
  });

  it('adds a template and registers it as the default', () => {
    const s = addTemplate(BUILTIN_TEMPLATES, { name: 'Mine', family: 'cpp', code: 'int main(){}' }, true);
    expect(s.templates).toHaveLength(4);
    expect(defaultTemplate(s, 'cpp')?.name).toBe('Mine');
    expect(defaultTemplate(s, 'java')?.id).toBe('builtin-java');
  });

  it('registers an existing template', () => {
    const s = addTemplate(BUILTIN_TEMPLATES, { name: 'Alt', family: 'py', code: 'pass' });
    const alt = s.templates.find((t) => t.name === 'Alt')!;
    expect(defaultTemplate(s, 'py')?.id).toBe('builtin-py');
    expect(defaultTemplate(registerDefault(s, alt.id), 'py')?.id).toBe(alt.id);
  });

  it('falls back to another template when the default is deleted', () => {
    const s = addTemplate(BUILTIN_TEMPLATES, { name: 'Second', family: 'cpp', code: 'x' });
    const after = removeTemplate(s, 'builtin-cpp');
    expect(after.defaults.cpp).toBeUndefined();
    expect(defaultTemplate(after, 'cpp')?.name).toBe('Second');
  });

  it('un-registers a template moved to another language', () => {
    const s = updateTemplate(BUILTIN_TEMPLATES, 'builtin-cpp', { family: 'java' });
    expect(s.defaults.cpp).toBeUndefined();
    expect(s.defaults.java).toBe('builtin-java');
  });

  it('round-trips through export and import with fresh ids', () => {
    const src = addTemplate(BUILTIN_TEMPLATES, { name: 'Exported', family: 'java', code: 'class Main {}' }, true);
    const file = JSON.parse(JSON.stringify(exportTemplates(src)));
    const { store, added } = importTemplates(BUILTIN_TEMPLATES, file);
    expect(added).toBe(4);
    expect(new Set(store.templates.map((t) => t.id)).size).toBe(store.templates.length);
    expect(defaultTemplate(store, 'java')?.name).toBe('Exported');
  });

  it('rejects files that are not template exports', () => {
    expect(() => importTemplates(BUILTIN_TEMPLATES, { hello: 1 })).toThrow(/Not a CF Studio/);
    const { added } = importTemplates(BUILTIN_TEMPLATES, {
      format: 'cf-studio-templates',
      version: 1,
      templates: [{ name: 'bad', family: 'rust', code: '' }],
      defaults: {},
    });
    expect(added).toBe(0);
  });
});
