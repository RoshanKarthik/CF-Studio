package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"time"
)

const version = "0.2.0"

// Output kept per test. The whole reply must fit Chrome's 1 MB message limit after JSON escaping.
const (
	stdoutCap  = 256 << 10
	stderrCap  = 64 << 10
	compileCap = 64 << 10
)

type testCase struct {
	ID    string `json:"id"`
	Input string `json:"input"`
}

type source struct {
	Lang string `json:"lang"`
	Code string `json:"code"`
}

type request struct {
	Type          string     `json:"type"`
	Lang          string     `json:"lang"`
	Code          string     `json:"code"`
	Tests         []testCase `json:"tests"`
	TimeLimitMs   int        `json:"timeLimitMs"`
	MemoryLimitMb int        `json:"memoryLimitMb"`
	// interact: the interactor, run with the test's input file next to the solution.
	Interactor *source `json:"interactor,omitempty"`
	// save: write Code to Root/Folder/Name.
	Root   string `json:"root,omitempty"`
	Folder string `json:"folder,omitempty"`
	Name   string `json:"name,omitempty"`
}

type helloReply struct {
	Type       string     `json:"type"`
	Version    string     `json:"version"`
	Toolchains toolchains `json:"toolchains"`
}

type compileEvent struct {
	Type   string `json:"type"`
	OK     bool   `json:"ok"`
	Output string `json:"output"`
	TimeMs int64  `json:"timeMs"`
	// Cached: an earlier run compiled the same code, so the compiler wasn't started.
	Cached bool `json:"cached,omitempty"`
	// Target is "interactor" for the interactor's build in an interactive run.
	Target string `json:"target,omitempty"`
}

type testEvent struct {
	Type           string `json:"type"`
	ID             string `json:"id"`
	Stdout         string `json:"stdout"`
	Stderr         string `json:"stderr"`
	ExitCode       *int   `json:"exitCode"`
	TimeMs         int64  `json:"timeMs"`
	MemoryKb       int64  `json:"memoryKb"`
	TimedOut       bool   `json:"timedOut"`
	MemoryExceeded bool   `json:"memoryExceeded"`
	Truncated      bool   `json:"truncated"`
	// Detail explains a crash, e.g. "stack overflow".
	Detail string `json:"detail,omitempty"`
	// Idle: stopped by the wall clock while waiting, not computing (usually: waiting for input).
	Idle bool `json:"idle,omitempty"`
	// Interactive runs only.
	Interactor *interactorResult `json:"interactor,omitempty"`
	Transcript []chunk           `json:"transcript,omitempty"`
}

type doneEvent struct {
	Type string `json:"type"`
}

type errorEvent struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// serve answers requests until Chrome closes the port (stdin EOF). Each request is handled to
// completion before the next is read; the extension opens a fresh port per run anyway.
func serve(in io.Reader, out io.Writer) error {
	w := &messageWriter{w: out}
	var tc *toolchains
	tools := func() toolchains {
		if tc == nil {
			t := detectToolchains()
			tc = &t
		}
		return *tc
	}
	for {
		raw, err := readMessage(in)
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return nil
		}
		if err != nil {
			return err
		}
		var req request
		if err := json.Unmarshal(raw, &req); err != nil {
			_ = w.send(errorEvent{"error", "bad request: " + err.Error()})
			continue
		}
		switch req.Type {
		case "hello":
			err = w.send(helloReply{"hello", version, tools()})
		case "run":
			err = handleRun(req, tools(), w)
		case "interact":
			err = handleInteract(req, tools(), w)
		case "save":
			err = handleSave(req, w)
		default:
			err = w.send(errorEvent{"error", "unknown request " + req.Type})
		}
		if err != nil {
			return err
		}
	}
}

func clamp(v, lo, hi int) int {
	return max(lo, min(hi, v))
}

func handleRun(req request, tc toolchains, w *messageWriter) error {
	if len(req.Code) > 1<<20 {
		return w.send(errorEvent{"error", "Code is larger than 1 MB."})
	}
	if len(req.Tests) > 200 {
		return w.send(errorEvent{"error", "Too many tests in one run (200 at most)."})
	}
	tl := time.Duration(clamp(req.TimeLimitMs, 100, 30_000)) * time.Millisecond
	ml := clamp(req.MemoryLimitMb, 16, 4096)

	// The program runs in a fresh folder (files it writes don't end up in the cached build).
	dir, err := os.MkdirTemp("", "cfstudio-")
	if err != nil {
		return w.send(errorEvent{"error", "Couldn't create a work folder: " + err.Error()})
	}
	defer os.RemoveAll(dir)

	b, err := build(req.Lang, req.Code, ml, tc)
	if err != nil {
		return w.send(errorEvent{"error", err.Error()})
	}
	if err := w.send(compileEvent{Type: "compile", OK: b.ok, Output: b.compileOutput, TimeMs: b.compileMs, Cached: b.cached}); err != nil {
		return err
	}
	if !b.ok {
		return w.send(doneEvent{"done"})
	}
	prog := b.prog

	lim := limits{
		cpuTime: tl,
		// Generous wall clock: CPU time is what's judged; this only catches sleeping/blocked programs.
		wallTime: 3*tl + 2*time.Second,
		memory:   uint64(ml)<<20 + prog.extraMemory,
	}
	for _, t := range req.Tests {
		res, err := runLimited(prog.run, dir, []byte(t.Input), lim, stdoutCap, stderrCap)
		if err != nil {
			return w.send(errorEvent{"error", "Couldn't run your program: " + err.Error()})
		}
		code := res.exitCode
		ev := testEvent{
			Type:           "test",
			ID:             t.ID,
			Stdout:         lf(res.stdout),
			Stderr:         lf(res.stderr),
			ExitCode:       &code,
			TimeMs:         res.cpuTime.Milliseconds(),
			MemoryKb:       int64(res.peakMemory >> 10),
			TimedOut:       res.timedOut,
			MemoryExceeded: res.memoryExceeded || javaOutOfMemory(req.Lang, res.stderr),
			Truncated:      res.truncated,
			Detail:         exitDetail(res.exitCode),
		}
		if res.timedOut {
			ev.ExitCode = nil
			ev.Detail = ""
		}
		if err := sendFitting(w, ev); err != nil {
			return err
		}
	}
	return w.send(doneEvent{"done"})
}

// lf turns Windows line endings (\r\n) into \n, so output reads the same as on Codeforces.
func lf(b []byte) string {
	return string(bytes.ReplaceAll(b, []byte("\r\n"), []byte("\n")))
}

// sendFitting shrinks the output until the event fits in one native message.
func sendFitting(w *messageWriter, ev testEvent) error {
	for {
		err := w.send(ev)
		if !errors.Is(err, errTooLarge) {
			return err
		}
		ev.Stdout = ev.Stdout[:len(ev.Stdout)/2]
		ev.Stderr = ev.Stderr[:len(ev.Stderr)/2]
		if ev.Interactor != nil {
			ev.Interactor.Stderr = ev.Interactor.Stderr[:len(ev.Interactor.Stderr)/2]
		}
		ev.Transcript = halveTranscript(ev.Transcript)
		ev.Truncated = true
	}
}

// halveTranscript keeps the first half of a transcript's text.
func halveTranscript(chunks []chunk) []chunk {
	total := 0
	for _, c := range chunks {
		total += len(c.Text)
	}
	room := total / 2
	var out []chunk
	for _, c := range chunks {
		if room <= 0 {
			break
		}
		if len(c.Text) > room {
			c.Text = c.Text[:room]
		}
		room -= len(c.Text)
		out = append(out, c)
	}
	return out
}

func javaOutOfMemory(lang string, stderr []byte) bool {
	return lang == "java21" && bytes.Contains(stderr, []byte("java.lang.OutOfMemoryError"))
}

// exitDetail names the common Windows crash codes so "exit code 3221225725" means something.
func exitDetail(code int) string {
	switch uint32(code) {
	case 0xC00000FD:
		return "stack overflow"
	case 0xC0000005:
		return "access violation (out-of-bounds or null pointer)"
	case 0xC0000094:
		return "integer division by zero"
	case 0xC0000095:
		return "integer overflow"
	case 0xC000008E, 0xC0000090, 0xC0000091:
		return "floating-point error"
	case 0xC0000409:
		return "aborted (failed assertion, std::terminate or buffer overrun)"
	case 0xC0000017:
		return "out of memory"
	case 3:
		return "aborted (abort(), failed assert or uncaught exception)"
	}
	return ""
}
