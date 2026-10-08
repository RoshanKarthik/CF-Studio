//go:build !windows

package main

import "errors"

func install(string) error {
	return errors.New("install is only implemented for Windows so far")
}

func setup(string) error {
	return errors.New("setup is only implemented for Windows so far; build the runner and run `cfstudio-runner install`")
}

func uninstall() error {
	return errors.New("uninstall is only implemented for Windows so far")
}
