package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"strings"
	"testing"
)

// talk sends requests to serve() exactly as Chrome would and returns every reply.
func talk(t *testing.T, reqs ...any) []map[string]any {
	t.Helper()
	var in bytes.Buffer
	for _, r := range reqs {
		b, _ := json.Marshal(r)
		_ = binary.Write(&in, binary.LittleEndian, uint32(len(b)))
		in.Write(b)
	}
	var out bytes.Buffer
	if err := serve(&in, &out); err != nil {
		t.Fatalf("serve: %v", err)
	}
	var replies []map[string]any
	for out.Len() > 0 {
		raw, err := readMessage(&out)
		if err != nil {
			t.Fatalf("read reply: %v", err)
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("decode reply: %v", err)
		}
		replies = append(replies, m)
	}
	return replies
}

func run(t *testing.T, lang, code string, inputs ...string) []map[string]any {
	t.Helper()
	tests := make([]testCase, len(inputs))
	for i, in := range inputs {
		tests[i] = testCase{ID: string(rune('a' + i)), Input: in}
	}
	return talk(t, request{Type: "run", Lang: lang, Code: code, Tests: tests, TimeLimitMs: 1000, MemoryLimitMb: 64})
}

func need(t *testing.T, ok bool, what string) {
	if !ok {
		t.Skip(what + " not installed")
	}
}

func byType(replies []map[string]any, typ string) []map[string]any {
	var out []map[string]any
	for _, r := range replies {
		if r["type"] == typ {
			out = append(out, r)
		}
	}
	return out
}

func TestFraming(t *testing.T) {
	var buf bytes.Buffer
	w := &messageWriter{w: &buf}
	if err := w.send(map[string]string{"type": "x"}); err != nil {
		t.Fatal(err)
	}
	raw, err := readMessage(&buf)
	if err != nil || string(raw) != `{"type":"x"}` {
		t.Fatalf("got %q, %v", raw, err)
	}
	if err := w.send(strings.Repeat("a", maxOutgoing)); err == nil {
		t.Fatal("expected oversize message to be refused")
	}
}

func TestHello(t *testing.T) {
	r := talk(t, request{Type: "hello"})
	if len(r) != 1 || r[0]["type"] != "hello" || r[0]["version"] != version {
		t.Fatalf("unexpected reply %v", r)
	}
}

func TestJavaClassName(t *testing.T) {
	cases := map[string]string{
		"public class Solution { }":                 "Solution",
		"import x;\npublic final class A {}":        "A",
		"class Helper {}\npublic class Main {}":     "Main",
		"class Only { public static void main() {}": "Only",
		"// nothing": "Main",
	}
	for code, want := range cases {
		if got := javaClassName(code); got != want {
			t.Errorf("javaClassName(%q) = %q, want %q", code, got, want)
		}
	}
}

const cppEcho = `#include <bits/stdc++.h>
int main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<"\n";
#ifdef LOCAL
std::cerr<<"debug\n";
#endif
}`

func TestCppAcceptedWithDebugStderr(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	r := run(t, "cpp20", cppEcho, "1 2\n", "40 2\n")
	if c := byType(r, "compile"); len(c) != 1 || c[0]["ok"] != true {
		t.Fatalf("compile: %v", r)
	}
	tests := byType(r, "test")
	if len(tests) != 2 || tests[0]["stdout"] != "3\n" || tests[1]["stdout"] != "42\n" {
		t.Fatalf("tests: %v", tests)
	}
	if tests[0]["stderr"] != "debug\n" || tests[0]["exitCode"] != float64(0) {
		t.Fatalf("LOCAL should be defined and exit 0: %v", tests[0])
	}
	if len(byType(r, "done")) != 1 {
		t.Fatal("missing done")
	}
}

func TestCppCompileError(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	r := run(t, "cpp20", "int main(){ return x; }", "")
	c := byType(r, "compile")
	if len(c) != 1 || c[0]["ok"] != false || !strings.Contains(c[0]["output"].(string), "'x' was not declared") {
		t.Fatalf("compile: %v", r)
	}
	if len(byType(r, "test")) != 0 {
		t.Fatal("tests should not run after a compile error")
	}
}

func TestCppTimeLimit(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	r := run(t, "cpp20", "int main(){ volatile unsigned long long x=0; for(;;) x++; }", "")
	tc := byType(r, "test")
	if len(tc) != 1 || tc[0]["timedOut"] != true {
		t.Fatalf("expected TLE: %v", tc)
	}
	if ms := tc[0]["timeMs"].(float64); ms < 900 || ms > 2500 {
		t.Fatalf("CPU time %v ms not near the 1000 ms limit", ms)
	}
}

func TestCppMemoryLimit(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	// 64 MB limit; touch 200 MB.
	code := `#include <bits/stdc++.h>
int main(){ std::vector<char> v(200<<20, 1); std::cout << (int)v[12345] << "\n"; }`
	tc := byType(run(t, "cpp20", code, ""), "test")
	if len(tc) != 1 || tc[0]["memoryExceeded"] != true {
		t.Fatalf("expected MLE: %v", tc)
	}
}

func TestCppDeepRecursionLikeCodeforces(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	// ~1e6 frames: crashes with Windows' default stack, fine with Codeforces' 256 MB.
	code := `#include <bits/stdc++.h>
int f(int n){ volatile int pad[16]; pad[0]=n; return n==0?0:f(n-1)+1+pad[0]*0; }
int main(){ std::cout << f(1000000) << "\n"; }`
	tc := byType(run(t, "cpp20", code, ""), "test")
	if len(tc) != 1 || tc[0]["stdout"] != "1000000\n" {
		t.Fatalf("deep recursion should work: %v", tc)
	}
}

func TestCppRuntimeErrorDetail(t *testing.T) {
	need(t, detectToolchains().Cpp != nil, "g++")
	code := `#include <bits/stdc++.h>
int main(){ int z; std::cin >> z; std::cout << 10 / z << "\n"; }`
	tc := byType(run(t, "cpp20", code, "0\n"), "test")
	if len(tc) != 1 || tc[0]["exitCode"] == float64(0) || tc[0]["detail"] != "integer division by zero" {
		t.Fatalf("expected division-by-zero RE: %v", tc)
	}
}

func TestPython(t *testing.T) {
	need(t, detectToolchains().Python != nil, "python")
	r := run(t, "python3", "a, b = map(int, input().split())\nprint(a * b)\n", "6 7\n")
	tc := byType(r, "test")
	if len(tc) != 1 || tc[0]["stdout"] != "42\n" {
		t.Fatalf("python: %v", r)
	}
	bad := run(t, "python3", "def f(:\n  pass\n", "")
	if c := byType(bad, "compile"); len(c) != 1 || c[0]["ok"] != false {
		t.Fatalf("syntax error should be a compile error: %v", bad)
	}
}

func TestJava(t *testing.T) {
	tc := detectToolchains()
	need(t, tc.Java != nil && tc.Javac != nil, "java")
	code := `import java.util.*;
public class Solution { public static void main(String[] a){ Scanner s=new Scanner(System.in); System.out.println(s.nextInt()*2); } }`
	r := run(t, "java21", code, "21\n")
	tests := byType(r, "test")
	if len(tests) != 1 || tests[0]["stdout"] != "42\n" {
		t.Fatalf("java: %v", r)
	}
}

func TestMissingToolchainIsReported(t *testing.T) {
	_, err := prepare("pypy3", "print(1)", t.TempDir(), 256, toolchains{})
	if err == nil || !strings.Contains(err.Error(), "PyPy 3 was not found") {
		t.Fatalf("got %v", err)
	}
}
