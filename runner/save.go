package main

import (
	"os"
	"path/filepath"
	"regexp"
)

// Solutions mirrored to disk: the extension sends the code whenever it is saved, and the runner
// writes it to <root>/<folder>/<name>, e.g. C:\cp\codeforces\1915\A.cpp.

var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(\.(cpp|java|py))?$`)

type savedEvent struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

func handleSave(req request, w *messageWriter) error {
	root := filepath.Clean(req.Root)
	if req.Root == "" || !filepath.IsAbs(root) {
		return w.send(errorEvent{"error", `The solutions folder must be a full path, like C:\cp\codeforces.`})
	}
	if !safeName.MatchString(req.Folder) || !safeName.MatchString(req.Name) || filepath.Ext(req.Name) == "" {
		return w.send(errorEvent{"error", "Invalid file name for the solution."})
	}
	if len(req.Code) > 1<<20 {
		return w.send(errorEvent{"error", "Code is larger than 1 MB."})
	}
	dir := filepath.Join(root, req.Folder)
	path := filepath.Join(dir, req.Name)
	if old, err := os.ReadFile(path); err == nil && string(old) == req.Code {
		return w.send(savedEvent{"saved", path})
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return w.send(errorEvent{"error", "Couldn't create " + dir + ": " + err.Error()})
	}
	// Written next to the target and renamed over it, so an editor never sees half a file.
	tmp, err := os.CreateTemp(dir, "."+req.Name+".tmp-*")
	if err != nil {
		return w.send(errorEvent{"error", "Couldn't write to " + dir + ": " + err.Error()})
	}
	_, werr := tmp.WriteString(req.Code)
	cerr := tmp.Close()
	if werr == nil {
		werr = cerr
	}
	if werr == nil {
		werr = os.Rename(tmp.Name(), path)
	}
	if werr != nil {
		_ = os.Remove(tmp.Name())
		return w.send(errorEvent{"error", "Couldn't write " + path + ": " + werr.Error()})
	}
	return w.send(savedEvent{"saved", path})
}
