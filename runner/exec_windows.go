//go:build windows

package main

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var procNtResumeProcess = windows.NewLazySystemDLL("ntdll.dll").NewProc("NtResumeProcess")

// JOBOBJECT_BASIC_ACCOUNTING_INFORMATION (not defined in x/sys/windows).
type jobAccounting struct {
	TotalUserTime             int64 // 100 ns units
	TotalKernelTime           int64
	ThisPeriodTotalUserTime   int64
	ThisPeriodTotalKernelTime int64
	TotalPageFaultCount       uint32
	TotalProcesses            uint32
	ActiveProcesses           uint32
	TotalTerminatedProcesses  uint32
}

// runLimitedIO runs args in dir inside a Job Object that enforces the CPU-time and memory limits
// for the process *and* anything it spawns, and kills all of it when we're done.
//
// The process starts suspended and is only resumed once it is in the job, so it can't allocate
// or spawn anything outside the limits first.
func runLimitedIO(args []string, dir string, lim limits, stdin io.Reader, stdout, stderr io.Writer) (execResult, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return execResult{}, fmt.Errorf("create job object: %w", err)
	}
	defer windows.CloseHandle(job)

	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
		windows.JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION // no "program has stopped working" dialogs
	// The CPU limit is enforced by the watchdog below: Windows only checks a job's own time limit
	// every few seconds, far too coarse for judging.
	if lim.memory > 0 {
		info.BasicLimitInformation.LimitFlags |= windows.JOB_OBJECT_LIMIT_JOB_MEMORY
		info.JobMemoryLimit = uintptr(lim.memory)
	}
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
		return execResult{}, fmt.Errorf("set job limits: %w", err)
	}

	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// Chrome starts us without a console; without CREATE_NO_WINDOW every run would flash one.
		CreationFlags: windows.CREATE_SUSPENDED | windows.CREATE_NO_WINDOW,
	}
	if err := cmd.Start(); err != nil {
		return execResult{}, err
	}

	proc, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|
		windows.PROCESS_SUSPEND_RESUME|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(cmd.Process.Pid))
	if err == nil {
		defer windows.CloseHandle(proc)
		err = windows.AssignProcessToJobObject(job, proc)
	}
	if err == nil {
		if status, _, _ := procNtResumeProcess.Call(uintptr(proc)); status != 0 {
			err = fmt.Errorf("NtResumeProcess: status 0x%x", status)
		}
	}
	if err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return execResult{}, fmt.Errorf("start under limits: %w", err)
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	var wall <-chan time.Time
	if lim.wallTime > 0 {
		wall = time.After(lim.wallTime)
	}
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	limitHit := false
	stopped := false
	stop := lim.stop
	var waitErr error
wait:
	for {
		select {
		case waitErr = <-done:
			break wait
		case <-stop:
			stop = nil
			stopped = true
			_ = windows.TerminateJobObject(job, 1)
		case <-wall:
			limitHit = true
			_ = windows.TerminateJobObject(job, 1)
		case <-tick.C:
			if lim.cpuTime > 0 && jobCPUTime(job) >= lim.cpuTime {
				limitHit = true
				_ = windows.TerminateJobObject(job, 1)
			}
		}
	}
	var exitErr *exec.ExitError
	if waitErr != nil && !errors.As(waitErr, &exitErr) {
		return execResult{}, waitErr
	}

	var ext windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	_ = windows.QueryInformationJobObject(job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&ext)), uint32(unsafe.Sizeof(ext)), nil)

	res := execResult{
		exitCode:   int(uint32(cmd.ProcessState.ExitCode())),
		cpuTime:    jobCPUTime(job),
		peakMemory: uint64(ext.PeakJobMemoryUsed),
	}
	res.stopped = stopped && !limitHit
	res.timedOut = limitHit || (lim.cpuTime > 0 && res.cpuTime >= lim.cpuTime)
	// Killed by the wall clock while hardly using the CPU: it was waiting (for input, usually).
	res.idle = limitHit && lim.cpuTime > 0 && res.cpuTime < lim.cpuTime
	// At the job memory limit allocations fail, so the program dies (bad_alloc, MemoryError, …)
	// with its peak right at the limit.
	res.memoryExceeded = lim.memory > 0 && res.exitCode != 0 && res.peakMemory+(2<<20) >= lim.memory
	return res, nil
}

// jobCPUTime is the user+kernel CPU time used so far by every process in the job.
func jobCPUTime(job windows.Handle) time.Duration {
	var acct jobAccounting
	_ = windows.QueryInformationJobObject(job, windows.JobObjectBasicAccountingInformation,
		uintptr(unsafe.Pointer(&acct)), uint32(unsafe.Sizeof(acct)), nil)
	return time.Duration(acct.TotalUserTime+acct.TotalKernelTime) * 100
}
