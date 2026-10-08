/** Template/code family: Python and PyPy share code, they only differ in the interpreter. */
export type Family = 'cpp' | 'java' | 'py';

export type LangId = 'cpp20' | 'java21' | 'python3' | 'pypy3';

export interface Language {
  id: LangId;
  label: string;
  family: Family;
  /** Monaco language id. */
  monaco: 'cpp' | 'java' | 'python';
}

export const LANGUAGES: readonly Language[] = [
  { id: 'cpp20', label: 'C++20 (GNU G++)', family: 'cpp', monaco: 'cpp' },
  { id: 'java21', label: 'Java 21', family: 'java', monaco: 'java' },
  { id: 'python3', label: 'Python 3', family: 'py', monaco: 'python' },
  { id: 'pypy3', label: 'PyPy 3', family: 'py', monaco: 'python' },
];

export const FAMILY_LABEL: Record<Family, string> = { cpp: 'C++', java: 'Java', py: 'Python' };

export function language(id: LangId): Language {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

export function isLangId(value: unknown): value is LangId {
  return LANGUAGES.some((l) => l.id === value);
}
