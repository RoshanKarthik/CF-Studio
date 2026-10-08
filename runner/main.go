// Command cfstudio-runner compiles and runs CF Studio solutions on this computer. Chrome starts
// it through native messaging when the IDE runs tests; run it yourself to install it:
//
//	cfstudio-runner install     register with Chrome, Edge and Brave (current user)
//	cfstudio-runner uninstall   remove that registration
//	cfstudio-runner doctor      show which compilers were found
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const hostName = "com.cfstudio.runner"

// The extension's ID, fixed by the "key" in extension/public/manifest.json.
const extensionID = "hapifcnfjgjenmejjnmgllgibaonhamb"

func main() {
	args := os.Args[1:]
	// Chrome passes the calling extension's origin as the first argument.
	if len(args) > 0 && strings.HasPrefix(args[0], "chrome-extension://") {
		if err := serve(os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, "cfstudio-runner:", err)
			os.Exit(1)
		}
		return
	}
	cmd := ""
	if len(args) > 0 {
		cmd = args[0]
	}
	var err error
	switch cmd {
	case "install":
		id := extensionID
		if len(args) > 1 {
			id = args[1]
		}
		err = install(id)
	case "uninstall":
		err = uninstall()
	case "doctor":
		b, _ := json.MarshalIndent(detectToolchains(), "", "  ")
		fmt.Printf("cfstudio-runner %s\n%s\n", version, b)
	case "version":
		fmt.Println(version)
	default:
		fmt.Println("cfstudio-runner " + version + "\n\n" +
			"  install [extension-id]   register with Chrome, Edge and Brave for the current user\n" +
			"  uninstall                remove that registration\n" +
			"  doctor                   show which compilers were found")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// hostManifest is the native messaging manifest Chrome reads to find and authorize the runner.
func hostManifest(exePath, id string) ([]byte, error) {
	return json.MarshalIndent(map[string]any{
		"name":            hostName,
		"description":     "CF Studio local runner",
		"path":            exePath,
		"type":            "stdio",
		"allowed_origins": []string{"chrome-extension://" + id + "/"},
	}, "", "  ")
}
