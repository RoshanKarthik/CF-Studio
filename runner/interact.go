package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Interactive problems: the solution and an interactor (written by the user, testlib-style) run
// side by side, each one's stdout piped into the other's stdin. The interactor gets the test's
// input file and an output file as arguments, like Codeforces' interactors:
//
//	interactor <input file> <output file>
//
// and its exit code is the verdict: 0 accepted, anything else wrong (testlib: 1 WA, 2 PE, 3 fail).

const transcriptCap = 128 << 10

// How long the solution may keep running after the interactor has finished.
const afterInteractorGrace = time.Second

type interactorResult struct {
	ExitCode *int   `json:"exitCode"`
	Stderr   string `json:"stderr"`
	TimedOut bool   `json:"timedOut"`
}

// chunk is a run of text one side wrote, in the order it was written.
type chunk struct {
	From string `json:"from"` // "solution" or "interactor"
	Text string `json:"text"`
}

// transcript records what both sides wrote, up to a size cap.
type transcript struct {
	mu        sync.Mutex
	chunks    []chunk
	size      int
	truncated bool
}

func (t *transcript) add(from string, p []byte) {
	t.mu.Lock()
	defer t.mu.Unlock()
	room := transcriptCap - t.size
	if room <= 0 {
		t.truncated = t.truncated || len(p) > 0
		return
	}
	if len(p) > room {
		p = p[:room]
		t.truncated = true
	}
	t.size += len(p)
	text := strings.ReplaceAll(string(p), "\r\n", "\n")
	if n := len(t.chunks); n > 0 && t.chunks[n-1].From == from {
		t.chunks[n-1].Text += text
	} else {
		t.chunks = append(t.chunks, chunk{from, text})
	}
}

// relay passes what one side prints to the other side's stdin, and records it. Once the other
// side has exited, writes are dropped so the writer never blocks on a reader that's gone.
type relay struct {
	dst  *os.File
	from string
	tr   *transcript
	gone atomic.Bool
}

func (r *relay) Write(p []byte) (int, error) {
	r.tr.add(r.from, p)
	if !r.gone.Load() {
		if _, err := r.dst.Write(p); err != nil {
			r.gone.Store(true)
		}
	}
	return len(p), nil
}

type interaction struct {
	sol, inter        execResult
	solErr, interErr  []byte
	transcript        []chunk
	transcriptTrimmed bool
}

// interact runs one test: solution and interactor connected by two pipes.
func interact(solArgs, interArgs []string, dir string, solLim, interLim limits) (interaction, error) {
	toInter, solOut, err := os.Pipe() // solution → interactor
	if err != nil {
		return interaction{}, err
	}
	toSol, interOut, err := os.Pipe() // interactor → solution
	if err != nil {
		toInter.Close()
		solOut.Close()
		return interaction{}, err
	}

	tr := &transcript{}
	solRelay := &relay{dst: solOut, from: "solution", tr: tr}
	interRelay := &relay{dst: interOut, from: "interactor", tr: tr}
	solErr := &cappedBuffer{max: stderrCap}
	interErr := &cappedBuffer{max: stderrCap}
	stopSol := make(chan struct{})
	solLim.stop = stopSol

	var res interaction
	var solFail, interFail error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		res.sol, solFail = runLimitedIO(solArgs, dir, solLim, toSol, solRelay, solErr)
		solOut.Close() // the interactor reads EOF
		interRelay.gone.Store(true)
		toSol.Close()
	}()
	go func() {
		defer wg.Done()
		res.inter, interFail = runLimitedIO(interArgs, dir, interLim, toInter, interRelay, interErr)
		interOut.Close() // the solution reads EOF
		solRelay.gone.Store(true)
		toInter.Close()
		// The verdict is decided; don't wait for a solution that keeps going.
		time.AfterFunc(afterInteractorGrace, func() { close(stopSol) })
	}()
	wg.Wait()
	if err := errors.Join(solFail, interFail); err != nil {
		return interaction{}, err
	}
	res.solErr = solErr.buf.Bytes()
	res.interErr = interErr.buf.Bytes()
	res.transcript = tr.chunks
	res.transcriptTrimmed = tr.truncated
	return res, nil
}

func handleInteract(req request, tc toolchains, w *messageWriter) error {
	if req.Interactor == nil {
		return w.send(errorEvent{"error", "No interactor in the request."})
	}
	if len(req.Code) > 1<<20 || len(req.Interactor.Code) > 1<<20 {
		return w.send(errorEvent{"error", "Code is larger than 1 MB."})
	}
	if len(req.Tests) > 200 {
		return w.send(errorEvent{"error", "Too many tests in one run (200 at most)."})
	}
	tl := time.Duration(clamp(req.TimeLimitMs, 100, 30_000)) * time.Millisecond
	ml := clamp(req.MemoryLimitMb, 16, 4096)

	dir, err := os.MkdirTemp("", "cfstudio-")
	if err != nil {
		return w.send(errorEvent{"error", "Couldn't create a work folder: " + err.Error()})
	}
	defer os.RemoveAll(dir)

	sol, err := build(req.Lang, req.Code, ml, tc)
	if err != nil {
		return w.send(errorEvent{"error", err.Error()})
	}
	if err := w.send(compileEvent{Type: "compile", OK: sol.ok, Output: sol.compileOutput, TimeMs: sol.compileMs, Cached: sol.cached}); err != nil {
		return err
	}
	if !sol.ok {
		return w.send(doneEvent{"done"})
	}
	const interMl = 1024
	inter, err := build(req.Interactor.Lang, req.Interactor.Code, interMl, tc)
	if err != nil {
		return w.send(errorEvent{"error", "Interactor: " + err.Error()})
	}
	if err := w.send(compileEvent{Type: "compile", OK: inter.ok, Output: inter.compileOutput, TimeMs: inter.compileMs, Cached: inter.cached, Target: "interactor"}); err != nil {
		return err
	}
	if !inter.ok {
		return w.send(doneEvent{"done"})
	}

	// Waiting for the other side counts against the wall clock only, so allow for it.
	solLim := limits{cpuTime: tl, wallTime: 3*tl + 5*time.Second, memory: uint64(ml)<<20 + sol.prog.extraMemory}
	interLim := limits{cpuTime: 10 * time.Second, wallTime: solLim.wallTime + 2*time.Second, memory: interMl<<20 + inter.prog.extraMemory}
	input := filepath.Join(dir, "input.txt")
	output := filepath.Join(dir, "output.txt")
	interArgs := append(append([]string{}, inter.prog.run...), input, output)

	for _, t := range req.Tests {
		if err := os.WriteFile(input, []byte(t.Input), 0o600); err != nil {
			return w.send(errorEvent{"error", "Couldn't write the test input: " + err.Error()})
		}
		_ = os.Remove(output)
		res, err := interact(sol.prog.run, interArgs, dir, solLim, interLim)
		if err != nil {
			return w.send(errorEvent{"error", "Couldn't run the interaction: " + err.Error()})
		}
		code := res.sol.exitCode
		interCode := res.inter.exitCode
		ev := testEvent{
			Type:           "test",
			ID:             t.ID,
			Stderr:         lf(res.solErr),
			ExitCode:       &code,
			TimeMs:         res.sol.cpuTime.Milliseconds(),
			MemoryKb:       int64(res.sol.peakMemory >> 10),
			TimedOut:       res.sol.timedOut,
			MemoryExceeded: res.sol.memoryExceeded || javaOutOfMemory(req.Lang, res.solErr),
			Truncated:      res.transcriptTrimmed,
			Detail:         exitDetail(res.sol.exitCode),
			Idle:           res.sol.idle,
			Interactor:     &interactorResult{ExitCode: &interCode, Stderr: lf(res.interErr), TimedOut: res.inter.timedOut},
			Transcript:     res.transcript,
		}
		if res.sol.timedOut || res.sol.stopped {
			ev.ExitCode = nil
			ev.Detail = ""
		}
		if res.sol.stopped {
			ev.Detail = "stopped: still running after the interactor finished"
		}
		if res.inter.timedOut {
			ev.Interactor.ExitCode = nil
		}
		if err := sendFitting(w, ev); err != nil {
			return err
		}
	}
	return w.send(doneEvent{"done"})
}
