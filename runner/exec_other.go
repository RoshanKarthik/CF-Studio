//go:build !windows

package main

import (
	"context"
	"errors"
	"io"
	"os/exec"
	"sync/atomic"
	"syscall"
)

// runLimited on Linux/macOS: enforces the wall-clock limit and reports CPU time and peak memory
// from rusage. (CF Studio targets Windows first; hard memory limits here are future work.)
func runLimitedIO(args []string, dir string, lim limits, stdin io.Reader, stdout, stderr io.Writer) (execResult, error) {
	ctx := context.Background()
	if lim.wallTime > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, lim.wallTime)
		defer cancel()
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var stopped atomic.Bool
	if lim.stop != nil {
		go func() {
			select {
			case <-lim.stop:
				stopped.Store(true)
				cancel()
			case <-ctx.Done():
			}
		}()
	}
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	err := cmd.Run()
	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		return execResult{}, err
	}
	res := execResult{
		exitCode: cmd.ProcessState.ExitCode(),
		cpuTime:  cmd.ProcessState.UserTime() + cmd.ProcessState.SystemTime(),
	}
	if ru, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage); ok {
		res.peakMemory = uint64(ru.Maxrss) * 1024 // KiB on Linux
	}
	res.stopped = stopped.Load()
	res.timedOut = ctx.Err() == context.DeadlineExceeded || (lim.cpuTime > 0 && res.cpuTime >= lim.cpuTime)
	res.idle = ctx.Err() == context.DeadlineExceeded && lim.cpuTime > 0 && res.cpuTime < lim.cpuTime
	res.memoryExceeded = lim.memory > 0 && res.peakMemory >= lim.memory
	return res, nil
}
