//go:build windows

package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// Per-user registry locations where Chromium browsers look for native messaging hosts.
var browserKeys = map[string]string{
	"Chrome": `Software\Google\Chrome\NativeMessagingHosts\` + hostName,
	"Edge":   `Software\Microsoft\Edge\NativeMessagingHosts\` + hostName,
	"Brave":  `Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\` + hostName,
}

// install registers this executable where it is (for development builds).
func install(id string) error {
	exe, err := selfPath()
	if err != nil {
		return err
	}
	return installAt(exe, id)
}

func selfPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Abs(exe)
}

// setupDir is where a downloaded runner installs itself, so the download can be moved or deleted.
func setupDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	return filepath.Join(base, "Programs", "CF Studio")
}

// setup is what double-clicking the downloaded runner does: copy it to a fixed per-user folder
// and register that copy. No administrator rights are needed.
func setup(id string) error {
	self, err := selfPath()
	if err != nil {
		return err
	}
	dir := setupDir()
	target := filepath.Join(dir, "cfstudio-runner.exe")
	if !strings.EqualFold(self, target) {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		// A runner started by the browser keeps its exe locked; Windows still lets it be renamed.
		old := target + ".old"
		_ = os.Remove(old)
		if exists(target) {
			if err := os.Rename(target, old); err != nil {
				return fmt.Errorf("couldn't replace the installed runner (close the browser and try again): %w", err)
			}
		}
		if err := copyFile(self, target); err != nil {
			return err
		}
	}
	return installAt(target, id)
}

func copyFile(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(to, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// installAt writes the host manifest next to exe and points each browser at it.
// Only HKEY_CURRENT_USER is touched, so no administrator rights are needed.
func installAt(exe, id string) error {
	manifest, err := hostManifest(exe, id)
	if err != nil {
		return err
	}
	manifestPath := filepath.Join(filepath.Dir(exe), hostName+".json")
	if err := os.WriteFile(manifestPath, manifest, 0o644); err != nil {
		return err
	}
	for browser, path := range browserKeys {
		k, _, err := registry.CreateKey(registry.CURRENT_USER, path, registry.SET_VALUE)
		if err != nil {
			return fmt.Errorf("%s: %w", browser, err)
		}
		err = k.SetStringValue("", manifestPath)
		k.Close()
		if err != nil {
			return fmt.Errorf("%s: %w", browser, err)
		}
	}
	fmt.Printf("Installed. Chrome, Edge and Brave will start\n  %s\nwhen CF Studio runs code. Restart the browser if it was open.\n", exe)
	return nil
}

func uninstall() error {
	for browser, path := range browserKeys {
		if err := registry.DeleteKey(registry.CURRENT_USER, path); err != nil && !errors.Is(err, registry.ErrNotExist) {
			return fmt.Errorf("%s: %w", browser, err)
		}
	}
	exe, err := os.Executable()
	if err == nil {
		_ = os.Remove(filepath.Join(filepath.Dir(exe), hostName+".json"))
	}
	fmt.Println("Uninstalled.")
	return nil
}
