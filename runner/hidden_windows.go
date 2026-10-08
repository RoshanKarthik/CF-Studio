//go:build windows

package main

import (
	"context"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// hiddenCommand is exec.CommandContext without a console window flashing up (we run without one).
func hiddenCommand(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_NO_WINDOW}
	return cmd
}
