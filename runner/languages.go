package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// tool is a located executable and its version line, e.g. "g++ (Rev6, Built by MSYS2) 13.2.0".
type tool struct {
	Path    string `json:"path"`
	Version string `json:"version"`
}

type toolchains struct {
	Cpp    *tool `json:"cpp"`
	Javac  *tool `json:"javac"`
	Java   *tool `json:"java"`
	Python *tool `json:"python"`
	Pypy   *tool `json:"pypy"`
}

func detectToolchains() toolchains {
	return toolchains{
		Cpp:    find([]string{"g++"}, "--version"),
		Javac:  find([]string{"javac"}, "-version"),
		Java:   find([]string{"java"}, "-version"),
		Python: find([]string{"python", "python3", "py"}, "--version"),
		Pypy:   find([]string{"pypy3", "pypy"}, "--version"),
	}
}

func find(names []string, versionFlag string) *tool {
	for _, name := range names {
		path, err := exec.LookPath(name)
		if err != nil || isStoreAlias(path) {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		out, err := hiddenCommand(ctx, path, versionFlag).CombinedOutput()
		cancel()
		if err != nil {
			continue
		}
		return &tool{Path: path, Version: firstLine(string(out))}
	}
	return nil
}

// isStoreAlias: Windows ships "python.exe" stubs in WindowsApps that only open the Store.
func isStoreAlias(path string) bool {
	return strings.Contains(strings.ToLower(path), `\microsoft\windowsapps\`)
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	return s
}

// program is a solution prepared in a work directory: how to compile it (optional) and run it.
type program struct {
	compile []string
	run     []string
	// extraMemory is added to the problem's memory limit for the job (e.g. JVM overhead).
	extraMemory uint64
}

var (
	javaPublicClass = regexp.MustCompile(`(?m)^\s*public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z_]\w*)`)
	javaAnyClass    = regexp.MustCompile(`(?m)\bclass\s+([A-Za-z_]\w*)`)
)

// javaClassName is the class Codeforces would run: the public class, else the first class.
func javaClassName(code string) string {
	if m := javaPublicClass.FindStringSubmatch(code); m != nil {
		return m[1]
	}
	if m := javaAnyClass.FindStringSubmatch(code); m != nil {
		return m[1]
	}
	return "Main"
}

type missingToolError struct{ what, install string }

func (e missingToolError) Error() string {
	return e.what + " was not found on this computer. " + e.install
}

// prepare writes the source into dir and returns the commands for lang, using the same compiler
// options Codeforces uses where it matters.
func prepare(lang, code, dir string, memoryLimitMb int, tc toolchains) (program, error) {
	write := func(name string) (string, error) {
		path := filepath.Join(dir, name)
		return path, os.WriteFile(path, []byte(code), 0o600)
	}
	switch lang {
	case "cpp20":
		if tc.Cpp == nil {
			return program{}, missingToolError{"g++", "Install a MinGW-w64 build of GCC (for example from winlibs.com or MSYS2) and add it to PATH."}
		}
		src, err := write("main.cpp")
		if err != nil {
			return program{}, err
		}
		exe := filepath.Join(dir, "main.exe")
		return program{
			compile: []string{tc.Cpp.Path, "-std=c++20", "-O2", "-DLOCAL", "-Wall", "-static",
				// Codeforces runs with a 256 MB stack; the Windows default (2 MB) crashes deep recursion.
				"-Wl,--stack,268435456", "-o", exe, src},
			run: []string{exe},
		}, nil
	case "java21":
		if tc.Javac == nil || tc.Java == nil {
			return program{}, missingToolError{"Java (javac and java)", "Install a JDK 21 or newer, for example Eclipse Temurin, and add it to PATH."}
		}
		class := javaClassName(code)
		src, err := write(class + ".java")
		if err != nil {
			return program{}, err
		}
		return program{
			compile: []string{tc.Javac.Path, "-encoding", "UTF-8", "-d", dir, src},
			run: []string{tc.Java.Path, "-XX:+UseSerialGC", "-Xss64m", "-Xmx" + strconv.Itoa(memoryLimitMb) + "m",
				"-Dfile.encoding=UTF-8", "-DLOCAL=true", "-cp", dir, class},
			// The JVM itself needs memory beyond the heap; -Xmx enforces the problem's limit.
			extraMemory: 512 << 20,
		}, nil
	case "python3", "pypy3":
		t, name := tc.Python, "Python 3"
		if lang == "pypy3" {
			t, name = tc.Pypy, "PyPy 3"
		}
		if t == nil {
			install := "Install Python 3 from python.org and tick \"Add python.exe to PATH\"."
			if lang == "pypy3" {
				install = "Install PyPy 3 from pypy.org and add it to PATH, or choose Python 3."
			}
			return program{}, missingToolError{name, install}
		}
		src, err := write("main.py")
		if err != nil {
			return program{}, err
		}
		// "Compiling" is a syntax check, so syntax errors show up as compilation errors.
		return program{
			compile: []string{t.Path, "-c", "import sys, py_compile; py_compile.compile(sys.argv[1], doraise=True)", src},
			run:     []string{t.Path, "-X", "utf8", src},
		}, nil
	}
	return program{}, missingToolError{"Language " + lang, "Choose C++, Java or Python."}
}
