# Builds the download for GitHub Releases: release\cf-studio-<version>-windows.zip with
#   CF Studio extension\   the built extension (load unpacked; the manifest "key" fixes its ID)
#   cfstudio-runner.exe    the runner (double-click to install)
#   INSTALL.txt            scripts\INSTALL.txt with the version filled in
#   LICENSE.txt            the MIT license
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\release.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$ext = Join-Path $root 'extension'
$runner = Join-Path $root 'runner'
$out = Join-Path $root 'release'

function Invoke-Native([string]$what, [scriptblock]$cmd) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}

# One version everywhere.
$version = (Get-Content (Join-Path $ext 'public\manifest.json') -Raw | ConvertFrom-Json).version
$pkgVersion = (Get-Content (Join-Path $ext 'package.json') -Raw | ConvertFrom-Json).version
$goVersion = [regex]::Match((Get-Content (Join-Path $runner 'host.go') -Raw), 'const version = "([^"]+)"').Groups[1].Value
if ($pkgVersion -ne $version -or $goVersion -ne $version) {
    throw "Versions differ: manifest.json $version, package.json $pkgVersion, runner/host.go $goVersion"
}
Write-Host "CF Studio $version"

$go = Get-Command go -ErrorAction SilentlyContinue
$go = if ($go) { $go.Source } else { 'C:\Program Files\Go\bin\go.exe' }
if (-not (Test-Path $go)) { throw 'Go not found (winget install GoLang.Go)' }

$name = "cf-studio-$version-windows"
$stage = Join-Path $out $name
$zip = Join-Path $out "$name.zip"
foreach ($p in @($stage, $zip)) { if (Test-Path $p) { Remove-Item -Recurse -Force $p } }
New-Item -ItemType Directory -Force $stage | Out-Null

# Extension: a fresh build.
Push-Location $ext
try {
    if (-not (Test-Path 'node_modules')) { Invoke-Native 'npm ci' { npm ci } }
    if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }
    Invoke-Native 'npm run build' { npm run build }
} finally { Pop-Location }

$manifest = Get-Content (Join-Path $ext 'dist\manifest.json') -Raw | ConvertFrom-Json
if (-not $manifest.key) { throw 'dist\manifest.json has no "key": the extension ID would not match the runner' }
if ($manifest.version -ne $version) { throw "dist\manifest.json says $($manifest.version)" }
Copy-Item -Recurse (Join-Path $ext 'dist') (Join-Path $stage 'CF Studio extension')

# Runner: 64-bit Windows, no local paths or debug info in the binary.
Push-Location $runner
$saved = @{ GOOS = $env:GOOS; GOARCH = $env:GOARCH; CGO_ENABLED = $env:CGO_ENABLED }
try {
    $env:GOOS = 'windows'; $env:GOARCH = 'amd64'; $env:CGO_ENABLED = '0'
    $exe = Join-Path $stage 'cfstudio-runner.exe'
    Invoke-Native 'go build' { & $go build -trimpath -ldflags '-s -w' -o $exe . }
} finally {
    foreach ($k in $saved.Keys) {
        if ($null -eq $saved[$k]) { Remove-Item "env:$k" -ErrorAction SilentlyContinue } else { Set-Item "env:$k" $saved[$k] }
    }
    Pop-Location
}
$built = (& $exe version | Out-String).Trim()
if ($built -ne $version) { throw "cfstudio-runner.exe reports version '$built'" }

# INSTALL.txt with Windows line endings, for Notepad.
$install = (Get-Content (Join-Path $PSScriptRoot 'INSTALL.txt') -Raw).Replace('{version}', $version)
$install = $install -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText((Join-Path $stage 'INSTALL.txt'), $install, (New-Object Text.UTF8Encoding $false))
$license = (Get-Content (Join-Path $root 'LICENSE') -Raw) -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText((Join-Path $stage 'LICENSE.txt'), $license, (New-Object Text.UTF8Encoding $false))

# Zip with forward-slash entry names (Compress-Archive in PowerShell 5 writes backslashes).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($f in Get-ChildItem -Recurse -File $stage) {
        $entry = $f.FullName.Substring($stage.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $entry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
Remove-Item -Recurse -Force $stage

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Wrote $zip ($size MB)"
