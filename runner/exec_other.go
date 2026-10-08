//go:build !windows

package main

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"syscall"
)

// runLimited on Linux/macOS: enforces the wall-clock limit and reports CPU time and peak memory
// from rusage. (CF Studio targets Windows first; hard memory limits here are future work.)
func runLimited(args []string, dir string, stdin []byte, lim limits, outCap, errCap int) (execResult, error) {
	ctx := context.Background()
	if lim.wallTime > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, lim.wallTime)
		defer cancel()
	}
	stdout := &cappedBuffer{max: outCap}
	stderr := &cappedBuffer{max: errCap}
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Stdin = bytes.NewReader(stdin)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	err := cmd.Run()
	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		return execResult{}, err
	}
	res := execResult{
		stdout:    stdout.buf.Bytes(),
		stderr:    stderr.buf.Bytes(),
		truncated: stdout.truncated || stderr.truncated,
		exitCode:  cmd.ProcessState.ExitCode(),
		cpuTime:   cmd.ProcessState.UserTime() + cmd.ProcessState.SystemTime(),
	}
	if ru, ok := cmd.ProcessState.SysUsage().(*syscall.Rusage); ok {
		res.peakMemory = uint64(ru.Maxrss) * 1024 // KiB on Linux
	}
	res.timedOut = ctx.Err() == context.DeadlineExceeded || (lim.cpuTime > 0 && res.cpuTime >= lim.cpuTime)
	res.memoryExceeded = lim.memory > 0 && res.peakMemory >= lim.memory
	return res, nil
}
