import type { Family } from './languages';

export interface Template {
  id: string;
  name: string;
  family: Family;
  code: string;
}

/** All templates plus which one is registered as the default for each language family. */
export interface TemplateStore {
  templates: Template[];
  defaults: Partial<Record<Family, string>>;
}

const CPP = `#include <bits/stdc++.h>
using namespace std;

#ifdef LOCAL
#define dbg(x) cerr << #x << " = " << (x) << '\\n'
#else
#define dbg(x)
#endif

using ll = long long;

void solve() {

}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t = 1;
    cin >> t;
    while (t--) {
        solve();
    }
    return 0;
}
`;

const JAVA = `import java.io.*;
import java.util.*;

public class Main {
    static void solve(FastReader in, PrintWriter out) {

    }

    public static void main(String[] args) {
        FastReader in = new FastReader(System.in);
        PrintWriter out = new PrintWriter(new BufferedOutputStream(System.out));
        int t = in.nextInt();
        while (t-- > 0) {
            solve(in, out);
        }
        out.flush();
    }

    static class FastReader {
        private final BufferedReader br;
        private StringTokenizer st;

        FastReader(InputStream stream) {
            br = new BufferedReader(new InputStreamReader(stream), 1 << 16);
        }

        String next() {
            while (st == null || !st.hasMoreTokens()) {
                try {
                    st = new StringTokenizer(br.readLine());
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            }
            return st.nextToken();
        }

        int nextInt() {
            return Integer.parseInt(next());
        }

        long nextLong() {
            return Long.parseLong(next());
        }
    }
}
`;

const PY = `import sys

input = sys.stdin.readline


def solve():
    pass


def main():
    t = int(input())
    for _ in range(t):
        solve()


main()
`;

export const BUILTIN_TEMPLATES: TemplateStore = {
  templates: [
    { id: 'builtin-cpp', name: 'C++ multi-test', family: 'cpp', code: CPP },
    { id: 'builtin-java', name: 'Java fast I/O', family: 'java', code: JAVA },
    { id: 'builtin-py', name: 'Python fast input', family: 'py', code: PY },
  ],
  defaults: { cpp: 'builtin-cpp', java: 'builtin-java', py: 'builtin-py' },
};

export function newId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The registered default for a family, falling back to the first template of that family. */
export function defaultTemplate(store: TemplateStore, family: Family): Template | undefined {
  const id = store.defaults[family];
  return store.templates.find((t) => t.id === id) ?? store.templates.find((t) => t.family === family);
}

export function addTemplate(store: TemplateStore, t: Omit<Template, 'id'>, makeDefault = false): TemplateStore {
  const template = { ...t, id: newId() };
  return {
    templates: [...store.templates, template],
    defaults: makeDefault ? { ...store.defaults, [t.family]: template.id } : store.defaults,
  };
}

export function updateTemplate(store: TemplateStore, id: string, patch: Partial<Omit<Template, 'id'>>): TemplateStore {
  const before = store.templates.find((t) => t.id === id);
  const templates = store.templates.map((t) => (t.id === id ? { ...t, ...patch } : t));
  let defaults = store.defaults;
  // Moving a registered template to another language un-registers it from the old one.
  if (before && patch.family && patch.family !== before.family && defaults[before.family] === id) {
    defaults = { ...defaults };
    delete defaults[before.family];
  }
  return { templates, defaults };
}

export function removeTemplate(store: TemplateStore, id: string): TemplateStore {
  const defaults = { ...store.defaults };
  for (const f of Object.keys(defaults) as Family[]) if (defaults[f] === id) delete defaults[f];
  return { templates: store.templates.filter((t) => t.id !== id), defaults };
}

/** "Register" a template: it becomes the starting code for new problems in its language. */
export function registerDefault(store: TemplateStore, id: string): TemplateStore {
  const t = store.templates.find((x) => x.id === id);
  return t ? { ...store, defaults: { ...store.defaults, [t.family]: id } } : store;
}

const FAMILIES: readonly Family[] = ['cpp', 'java', 'py'];

export interface TemplateExport {
  format: 'cf-studio-templates';
  version: 1;
  templates: Template[];
  defaults: Partial<Record<Family, string>>;
}

export function exportTemplates(store: TemplateStore): TemplateExport {
  return { format: 'cf-studio-templates', version: 1, ...store };
}

/**
 * Merge an exported file into the store. Imported templates get fresh ids so they never clobber
 * existing ones; the file's registered defaults are applied. Throws on a malformed file.
 */
export function importTemplates(store: TemplateStore, data: unknown): { store: TemplateStore; added: number } {
  const file = data as Partial<TemplateExport> | null;
  if (!file || file.format !== 'cf-studio-templates' || !Array.isArray(file.templates)) {
    throw new Error('Not a CF Studio templates file');
  }
  const idMap = new Map<string, string>();
  const added: Template[] = [];
  for (const raw of file.templates) {
    const t = raw as Partial<Template>;
    if (typeof t.name !== 'string' || typeof t.code !== 'string' || !FAMILIES.includes(t.family as Family)) continue;
    const id = newId() + added.length;
    if (typeof t.id === 'string') idMap.set(t.id, id);
    added.push({ id, name: t.name.slice(0, 80), family: t.family as Family, code: t.code });
  }
  const defaults = { ...store.defaults };
  for (const f of FAMILIES) {
    const oldId = file.defaults?.[f];
    const mapped = oldId ? idMap.get(oldId) : undefined;
    if (mapped) defaults[f] = mapped;
  }
  return { store: { templates: [...store.templates, ...added], defaults }, added: added.length };
}
