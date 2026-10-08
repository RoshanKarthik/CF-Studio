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
}

type execResult struct {
	stdout, stderr []byte
	truncated      bool
	exitCode       int
	cpuTime        time.Duration
	peakMemory     uint64 // bytes
	timedOut       bool
	memoryExceeded bool
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
