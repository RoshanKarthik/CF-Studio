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
	if len(args) == 0 {
		// Double-clicked (Chrome always passes an argument): install for this user.
		err := setup(extensionID)
		if err == nil {
			fmt.Println()
			fmt.Print(compilerReport(detectToolchains()))
		} else {
			fmt.Println("Couldn't install the CF Studio runner:", err)
		}
		fmt.Print("\nPress Enter to close.")
		_, _ = fmt.Scanln()
		if err != nil {
			os.Exit(1)
		}
		return
	}
	cmd := args[0]
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
			"  (no arguments)           install for this user (copies itself to %LOCALAPPDATA%\\Programs\\CF Studio)\n" +
			"  install [extension-id]   register this exe where it is, with Chrome, Edge and Brave\n" +
			"  uninstall                remove that registration\n" +
			"  doctor                   show which compilers were found")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// compilerReport lists, in plain words, which compilers were found and what to install otherwise.
func compilerReport(tc toolchains) string {
	line := func(name string, t *tool, missing string) string {
		if t != nil {
			return fmt.Sprintf("  [ok]      %-8s %s\n", name, t.Version)
		}
		return fmt.Sprintf("  [missing] %-8s %s\n", name, missing)
	}
	java := tc.Java
	if tc.Javac == nil {
		java = nil
	}
	return "Compilers found on this computer (CF Studio uses whatever is on PATH):\n" +
		line("C++", tc.Cpp, "install GCC for Windows, e.g. from winlibs.com, and add its bin folder to PATH") +
		line("Java", java, "install a JDK 21+, e.g. Eclipse Temurin (adoptium.net)") +
		line("Python", tc.Python, `install Python 3 from python.org and tick "Add python.exe to PATH"`) +
		line("PyPy", tc.Pypy, "optional: install PyPy 3 from pypy.org and add it to PATH") +
		"You only need the ones you use. After installing one, restart the browser.\n"
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
