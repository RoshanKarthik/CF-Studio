/**
 * Helper programs kept next to a problem's solution: a test generator and a brute-force solution
 * for stress testing, and an interactor for interactive problems. Each has its own language.
 */
import type { Family, LangId } from './languages';
import { isLangId, language } from './languages';

export type HelperKind = 'gen' | 'brute' | 'interactor';

export interface HelperFile {
  lang: LangId;
  code: string;
}

export type Helpers = Partial<Record<HelperKind, HelperFile>>;

export const HELPER_KINDS: readonly HelperKind[] = ['gen', 'brute', 'interactor'];

export const HELPER_LABEL: Record<HelperKind, string> = {
  gen: 'Generator',
  brute: 'Brute force',
  interactor: 'Interactor',
};

const EXT: Record<Family, string> = { cpp: 'cpp', java: 'java', py: 'py' };

/** Name shown on the editor tab, e.g. "gen.cpp". */
export function helperFileName(kind: HelperKind, lang: LangId): string {
  return `${kind}.${EXT[language(lang).family]}`;
}

/** Helpers as stored; anything malformed is dropped. */
export function parseHelpers(raw: unknown): Helpers {
  const out: Helpers = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const kind of HELPER_KINDS) {
    const h = (raw as Record<string, unknown>)[kind];
    if (typeof h === 'object' && h !== null) {
      const { lang, code } = h as Record<string, unknown>;
      if (isLangId(lang) && typeof code === 'string') out[kind] = { lang, code };
    }
  }
  return out;
}

const GEN: Record<Family, string> = {
  cpp: `// Generator: prints one random test. It reads a seed from stdin, so every round of the
// stress test gets a different test, and a failing one can be reproduced.
#include <bits/stdc++.h>
using namespace std;

int main() {
    unsigned long long seed;
    cin >> seed;
    mt19937_64 rng(seed);
    auto rnd = [&](long long lo, long long hi) { return uniform_int_distribution<long long>(lo, hi)(rng); };

    int n = rnd(1, 10);
    cout << 1 << "\\n";  // one test case
    cout << n << "\\n";
    for (int i = 0; i < n; i++) cout << rnd(1, 100) << " \\n"[i == n - 1];
}
`,
  java: `// Generator: prints one random test. It reads a seed from stdin, so every round of the
// stress test gets a different test, and a failing one can be reproduced.
import java.util.*;

public class Gen {
    public static void main(String[] args) {
        Random rng = new Random(new Scanner(System.in).nextLong());
        int n = 1 + rng.nextInt(10);
        StringBuilder out = new StringBuilder();
        out.append(1).append('\\n'); // one test case
        out.append(n).append('\\n');
        for (int i = 0; i < n; i++) out.append(1 + rng.nextInt(100)).append(i == n - 1 ? '\\n' : ' ');
        System.out.print(out);
    }
}
`,
  py: `# Generator: prints one random test. It reads a seed from stdin, so every round of the
# stress test gets a different test, and a failing one can be reproduced.
import random
import sys

random.seed(int(sys.stdin.readline()))
n = random.randint(1, 10)
print(1)  # one test case
print(n)
print(*(random.randint(1, 100) for _ in range(n)))
`,
};

const INTERACTOR: Record<Family, string> = {
  cpp: `// Interactor: runs next to your solution. It reads the test from the file named by argv[1];
// what it prints is your solution's input, and your solution's output is its input.
// Exit code 0 = accepted, anything else = wrong answer (say why on stderr).
// testlib.h works too: registerInteraction(argc, argv).
// Example: guess a number; queries "? x" are answered with <, > or =, the answer is "! x".
#include <bits/stdc++.h>
using namespace std;

int main(int argc, char* argv[]) {
    ifstream test(argv[1]);
    long long secret;
    test >> secret;

    for (int queries = 0; queries < 30; queries++) {
        string type;
        long long x;
        if (!(cin >> type >> x)) {
            cerr << "unexpected end of output\\n";
            return 1;
        }
        if (type == "!") {
            if (x == secret) return 0;
            cerr << "wrong answer: expected " << secret << ", found " << x << "\\n";
            return 1;
        }
        cout << (x < secret ? "<" : x > secret ? ">" : "=") << endl;
    }
    cerr << "too many queries\\n";
    return 1;
}
`,
  java: `// Interactor: runs next to your solution. It reads the test from the file named by args[0];
// what it prints is your solution's input, and your solution's output is its input.
// Exit code 0 = accepted, anything else = wrong answer (say why on stderr).
// Example: guess a number; queries "? x" are answered with <, > or =, the answer is "! x".
import java.io.*;
import java.nio.file.*;
import java.util.*;

public class Interactor {
    public static void main(String[] args) throws IOException {
        long secret = Long.parseLong(Files.readString(Path.of(args[0])).trim().split("\\\\s+")[0]);
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        for (int queries = 0; queries < 30; queries++) {
            String line = in.readLine();
            if (line == null) fail("unexpected end of output");
            String[] parts = line.trim().split("\\\\s+");
            long x = Long.parseLong(parts[1]);
            if (parts[0].equals("!")) {
                if (x == secret) System.exit(0);
                fail("wrong answer: expected " + secret + ", found " + x);
            }
            System.out.println(x < secret ? "<" : x > secret ? ">" : "=");
            System.out.flush();
        }
        fail("too many queries");
    }

    static void fail(String why) {
        System.err.println(why);
        System.exit(1);
    }
}
`,
  py: `# Interactor: runs next to your solution. It reads the test from the file named by sys.argv[1];
# what it prints is your solution's input, and your solution's output is its input.
# Exit code 0 = accepted, anything else = wrong answer (sys.exit("why") prints the reason).
# Example: guess a number; queries "? x" are answered with <, > or =, the answer is "! x".
import sys

secret = int(open(sys.argv[1]).read().split()[0])
for _ in range(30):
    line = sys.stdin.readline().split()
    if not line:
        sys.exit("unexpected end of output")
    kind, x = line[0], int(line[1])
    if kind == "!":
        if x == secret:
            sys.exit(0)
        sys.exit(f"wrong answer: expected {secret}, found {x}")
    print("<" if x < secret else ">" if x > secret else "=", flush=True)
sys.exit("too many queries")
`,
};

const BRUTE_NOTE: Record<Family, string> = {
  cpp: '// Brute force: a simple, obviously correct solution (slow is fine) to compare against.\n',
  java: '// Brute force: a simple, obviously correct solution (slow is fine) to compare against.\n',
  py: '# Brute force: a simple, obviously correct solution (slow is fine) to compare against.\n',
};

/** Starting code for a new helper; a brute force starts from the user's own template. */
export function helperTemplate(kind: HelperKind, family: Family, userTemplate = ''): string {
  if (kind === 'gen') return GEN[family];
  if (kind === 'interactor') return INTERACTOR[family];
  return BRUTE_NOTE[family] + userTemplate;
}
