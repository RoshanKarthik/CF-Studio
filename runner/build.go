package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// buildFormat changes whenever compile options change, so old cached builds aren't reused.
const buildFormat = "1"

// Cached builds kept; the oldest beyond this are removed.
const keepBuilds = 60

// built is a program compiled (or syntax-checked) in a cache folder, ready to run.
type built struct {
	prog          program
	ok            bool
	compileOutput string
	compileMs     int64
	// cached: compiled by an earlier run, the compiler wasn't started this time.
	cached bool
}

// cacheRoot is where builds are kept: %LOCALAPPDATA%\cfstudio\builds on Windows.
func cacheRoot() (string, error) {
	if d := os.Getenv("CFSTUDIO_CACHE_DIR"); d != "" {
		return d, nil
	}
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "cfstudio", "builds"), nil
}

func buildKey(lang, code string, tc toolchains) string {
	var t *tool
	switch lang {
	case "cpp20":
		t = tc.Cpp
	case "java21":
		t = tc.Javac
	case "python3":
		t = tc.Python
	case "pypy3":
		t = tc.Pypy
	}
	h := sha256.New()
	for _, part := range []string{buildFormat, lang, code} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	if t != nil {
		h.Write([]byte(t.Path + "\x00" + t.Version))
	}
	return hex.EncodeToString(h.Sum(nil))[:32]
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// build compiles lang/code once and keeps the result, so running unchanged code again — and
// every round of a stress test — skips the compiler. Compilation happens in a temporary folder
// that is renamed into place only when it succeeded, so a half-written build is never reused.
func build(lang, code string, memoryLimitMb int, tc toolchains) (built, error) {
	root, err := cacheRoot()
	if err != nil {
		return built{}, err
	}
	final := filepath.Join(root, buildKey(lang, code, tc))
	if exists(filepath.Join(final, ".ok")) {
		now := time.Now()
		_ = os.Chtimes(final, now, now)
		prog, err := prepare(lang, code, final, memoryLimitMb, tc)
		if err != nil {
			return built{}, err
		}
		out, _ := os.ReadFile(filepath.Join(final, "compile.txt"))
		return built{prog: prog, ok: true, compileOutput: string(out), cached: true}, nil
	}

	if err := os.MkdirAll(root, 0o700); err != nil {
		return built{}, err
	}
	tmp, err := os.MkdirTemp(root, filepath.Base(final)+".tmp-")
	if err != nil {
		return built{}, err
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.RemoveAll(tmp)
		}
	}()
	prog, err := prepare(lang, code, tmp, memoryLimitMb, tc)
	if err != nil {
		return built{}, err
	}
	b := built{ok: true}
	if prog.compile != nil {
		start := time.Now()
		res, err := runLimited(prog.compile, tmp, nil, limits{cpuTime: 60 * time.Second, wallTime: 90 * time.Second}, compileCap, compileCap)
		b.compileMs = time.Since(start).Milliseconds()
		if err != nil {
			return built{}, errors.New("Couldn't start the compiler: " + err.Error())
		}
		b.compileOutput = lf(res.stdout) + lf(res.stderr)
		b.ok = res.exitCode == 0 && !res.timedOut
		if res.timedOut {
			b.compileOutput += "\nCompilation took too long and was stopped."
		}
	}
	if !b.ok {
		return b, nil
	}
	if err := os.WriteFile(filepath.Join(tmp, "compile.txt"), []byte(b.compileOutput), 0o600); err != nil {
		return built{}, err
	}
	if err := os.WriteFile(filepath.Join(tmp, ".ok"), nil, 0o600); err != nil {
		return built{}, err
	}
	if err := os.Rename(tmp, final); err != nil && !exists(filepath.Join(final, ".ok")) {
		// Couldn't move it into place (and no other run did): run it from where it is.
		keep = true
		b.prog = prog
		return b, nil
	}
	prune(root)
	b.prog, err = prepare(lang, code, final, memoryLimitMb, tc)
	return b, err
}

// prune removes the least recently used builds beyond keepBuilds, and leftovers of failed ones.
func prune(root string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	type entry struct {
		path string
		at   time.Time
	}
	var builds []entry
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !e.IsDir() {
			continue
		}
		path := filepath.Join(root, e.Name())
		if strings.Contains(e.Name(), ".tmp-") {
			if time.Since(info.ModTime()) > time.Hour {
				_ = os.RemoveAll(path)
			}
			continue
		}
		builds = append(builds, entry{path, info.ModTime()})
	}
	if len(builds) <= keepBuilds {
		return
	}
	sort.Slice(builds, func(i, j int) bool { return builds[i].at.After(builds[j].at) })
	for _, b := range builds[keepBuilds:] {
		_ = os.RemoveAll(b.path) // fails harmlessly if another run is using it
	}
}
