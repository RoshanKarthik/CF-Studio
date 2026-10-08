//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

// Per-user registry locations where Chromium browsers look for native messaging hosts.
var browserKeys = map[string]string{
	"Chrome": `Software\Google\Chrome\NativeMessagingHosts\` + hostName,
	"Edge":   `Software\Microsoft\Edge\NativeMessagingHosts\` + hostName,
	"Brave":  `Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\` + hostName,
}

// install writes the host manifest next to the executable and points each browser at it.
// Only HKEY_CURRENT_USER is touched, so no administrator rights are needed.
func install(id string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}
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
