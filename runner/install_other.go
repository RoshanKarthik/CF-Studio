//go:build !windows

package main

import "errors"

func install(string) error {
	return errors.New("install is only implemented for Windows so far")
}

func uninstall() error {
	return errors.New("uninstall is only implemented for Windows so far")
}
