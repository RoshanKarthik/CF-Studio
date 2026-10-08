package main

import (
	"bytes"
	"time"
)

// limits for one process run. Zero means "no limit" for that resource.
type limits struct {
	cpuTime  time.Duration // CPU time (user+kernel), like Codeforces
	wallTime time.Duration // safety net for programs that sleep or wait for input
	memory   uint64        // bytes of committed memory for the whole process tree
	// stop, when closed, ends the run early (not counted as hitting a limit).
	stop <-chan struct{}
}

type execResult struct {
	stdout, stderr []byte
	truncated      bool
	exitCode       int
	cpuTime        time.Duration
	peakMemory     uint64 // bytes
	timedOut       bool
	memoryExceeded bool
	// idle: stopped by the wall clock with CPU time to spare (waiting for input that never came).
	idle bool
	// stopped: ended through limits.stop.
	stopped bool
}

// runLimited runs args with stdin and keeps the first outCap/errCap bytes of its output.
func runLimited(args []string, dir string, stdin []byte, lim limits, outCap, errCap int) (execResult, error) {
	stdout := &cappedBuffer{max: outCap}
	stderr := &cappedBuffer{max: errCap}
	res, err := runLimitedIO(args, dir, lim, bytes.NewReader(stdin), stdout, stderr)
	res.stdout = stdout.buf.Bytes()
	res.stderr = stderr.buf.Bytes()
	res.truncated = stdout.truncated || stderr.truncated
	return res, err
}

// cappedBuffer keeps the first `max` bytes written and silently drops the rest, so a program
// printing forever can't exhaust memory; the pipe keeps draining so it doesn't block.
type cappedBuffer struct {
	buf       bytes.Buffer
	max       int
	truncated bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if room := c.max - c.buf.Len(); room > 0 {
		if len(p) > room {
			c.buf.Write(p[:room])
			c.truncated = true
		} else {
			c.buf.Write(p)
		}
	} else if len(p) > 0 {
		c.truncated = true
	}
	return len(p), nil
}
