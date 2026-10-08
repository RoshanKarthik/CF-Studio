package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Tests use their own build cache, not the user's.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "cfstudio-test-cache-")
	if err != nil {
		panic(err)
	}
	os.Setenv("CFSTUDIO_CACHE_DIR", dir)
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

func TestBuildIsCached(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	code := cppEcho + "\n// cache test\n"
	first := byType(run(t, "cpp20", code, "1 1\n"), "compile")
	second := run(t, "cpp20", code, "2 3\n")
	if len(first) != 1 || first[0]["cached"] != nil {
		t.Fatalf("first build should compile: %v", first)
	}
	c := byType(second, "compile")
	if len(c) != 1 || c[0]["ok"] != true || c[0]["cached"] != true {
		t.Fatalf("second build should be cached: %v", c)
	}
	if tc := byType(second, "test"); len(tc) != 1 || tc[0]["stdout"] != "5\n" {
		t.Fatalf("cached build should run: %v", tc)
	}
}

func TestBuildCacheKeepsCompileErrorsOut(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	for range 2 {
		c := byType(run(t, "cpp20", "int main(){ return y; }", ""), "compile")
		if len(c) != 1 || c[0]["ok"] != false || c[0]["cached"] != nil {
			t.Fatalf("compile errors are not cached: %v", c)
		}
	}
}

func TestPrune(t *testing.T) {
	root := t.TempDir()
	for i := range keepBuilds + 5 {
		if err := os.Mkdir(filepath.Join(root, strings.Repeat("a", 3)+string(rune('A'+i%26))+strings.Repeat("b", i/26+1)), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	prune(root)
	entries, _ := os.ReadDir(root)
	if len(entries) != keepBuilds {
		t.Fatalf("kept %d builds, want %d", len(entries), keepBuilds)
	}
}

// A guess-the-number interactor in the testlib style: reads the secret from argv[1].
const cppInteractor = `#include <bits/stdc++.h>
int main(int argc, char** argv) {
  std::ifstream in(argv[1]); int secret; in >> secret;
  for (int q = 0; q < 20; q++) {
    std::string op; long long x;
    if (!(std::cin >> op >> x)) { std::cerr << "unexpected end of output\n"; return 2; }
    if (op == "!") {
      if (x == secret) return 0;
      std::cerr << "wrong answer: expected " << secret << ", found " << x << "\n"; return 1;
    }
    std::cout << (x < secret ? "<" : x > secret ? ">" : "=") << std::endl;
  }
  std::cerr << "too many queries\n"; return 1;
}`

const cppGuesser = `#include <bits/stdc++.h>
int main() {
  int lo = 1, hi = 100;
  while (lo < hi) {
    int mid = (lo + hi) / 2; std::cout << "? " << mid << std::endl;
    std::string r; std::cin >> r;
    if (r == "=") { lo = hi = mid; break; }
    if (r == "<") lo = mid + 1; else hi = mid - 1;
  }
  std::cout << "! " << lo << std::endl;
}`

func interactRun(t *testing.T, solution string, tl int, inputs ...string) []map[string]any {
	t.Helper()
	tests := make([]testCase, len(inputs))
	for i, in := range inputs {
		tests[i] = testCase{ID: string(rune('a' + i)), Input: in}
	}
	return talk(t, request{Type: "interact", Lang: "cpp20", Code: solution, Tests: tests, TimeLimitMs: tl, MemoryLimitMb: 64,
		Interactor: &source{Lang: "cpp20", Code: cppInteractor}})
}

func TestInteractAccepted(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	r := interactRun(t, cppGuesser, 1000, "37\n", "100\n")
	if c := byType(r, "compile"); len(c) != 2 || c[1]["target"] != "interactor" || c[1]["ok"] != true {
		t.Fatalf("compile: %v", c)
	}
	tests := byType(r, "test")
	if len(tests) != 2 {
		t.Fatalf("tests: %v", r)
	}
	for _, tc := range tests {
		inter := tc["interactor"].(map[string]any)
		if inter["exitCode"] != float64(0) || tc["exitCode"] != float64(0) {
			t.Fatalf("expected both to exit 0: %v", tc)
		}
		tr := tc["transcript"].([]any)
		first := tr[0].(map[string]any)
		if len(tr) < 3 || first["from"] != "solution" || first["text"] != "? 50\n" {
			t.Fatalf("transcript: %v", tr)
		}
	}
}

func TestInteractWrongAnswer(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	wrong := `#include <bits/stdc++.h>
int main(){ std::cout << "! 1" << std::endl; }`
	tc := byType(interactRun(t, wrong, 1000, "37\n"), "test")
	inter := tc[0]["interactor"].(map[string]any)
	if inter["exitCode"] != float64(1) || !strings.Contains(inter["stderr"].(string), "expected 37, found 1") {
		t.Fatalf("expected WA from the interactor: %v", tc)
	}
}

func TestInteractIdle(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	// Waits for input without ever asking: both sides wait until the wall clock stops it.
	stuck := `#include <bits/stdc++.h>
int main(){ int x; std::cin >> x; }`
	tc := byType(interactRun(t, stuck, 200, "37\n"), "test")
	if len(tc) != 1 || tc[0]["idle"] != true || tc[0]["timedOut"] != true {
		t.Fatalf("expected idleness: %v", tc)
	}
}

func TestSave(t *testing.T) {
	root := t.TempDir()
	r := talk(t, request{Type: "save", Root: root, Folder: "1915", Name: "A.cpp", Code: "int main(){}\n"})
	want := filepath.Join(root, "1915", "A.cpp")
	if len(r) != 1 || r[0]["type"] != "saved" || r[0]["path"] != want {
		t.Fatalf("save: %v", r)
	}
	if b, _ := os.ReadFile(want); string(b) != "int main(){}\n" {
		t.Fatalf("file has %q", b)
	}
	for _, bad := range []request{
		{Type: "save", Root: "relative", Folder: "1", Name: "A.cpp", Code: "x"},
		{Type: "save", Root: root, Folder: "..", Name: "A.cpp", Code: "x"},
		{Type: "save", Root: root, Folder: "1", Name: "../A.cpp", Code: "x"},
		{Type: "save", Root: root, Folder: "1", Name: "A.exe", Code: "x"},
		{Type: "save", Root: root, Folder: "1", Name: "A", Code: "x"},
	} {
		if r := talk(t, bad); len(r) != 1 || r[0]["type"] != "error" {
			t.Errorf("%+v should be refused: %v", bad, r)
		}
	}
}

func TestCompilerReport(t *testing.T) {
	r := compilerReport(toolchains{Cpp: &tool{Version: "g++ 13.2.0"}, Javac: &tool{}, Java: nil})
	for _, want := range []string{"[ok]      C++      g++ 13.2.0", "[missing] Java", "[missing] Python", "adoptium.net"} {
		if !strings.Contains(r, want) {
			t.Errorf("report misses %q:\n%s", want, r)
		}
	}
}
