import { describe, expect, it } from 'vitest';
import { summarizeToolchains, versionNumber } from '../src/extension/nativeRunner';

const tool = (version: string) => ({ path: 'x', version });

describe('runner status line', () => {
  it('pulls short versions out of compiler banners', () => {
    expect(versionNumber('g++.exe (Rev6, Built by MSYS2 project) 13.2.0', true)).toBe('13.2');
    expect(versionNumber('java version "23.0.1" 2024-10-15')).toBe('23.0');
    expect(versionNumber('Python 3.11.9')).toBe('3.11');
  });

  it('lists what was found and what is missing', () => {
    expect(
      summarizeToolchains({
        cpp: tool('g++.exe (Rev6, Built by MSYS2 project) 13.2.0'),
        javac: tool('javac 23.0.1'),
        java: tool('java version "23.0.1" 2024-10-15'),
        python: tool('Python 3.11.9'),
        pypy: null,
      }),
    ).toBe('g++ 13.2 · Java 23.0 · Python 3.11');
    expect(summarizeToolchains({ cpp: null, javac: null, java: tool('java 21'), python: tool('Python 3.12.1'), pypy: null })).toBe(
      'Python 3.12 (no C++, Java)',
    );
  });
});
