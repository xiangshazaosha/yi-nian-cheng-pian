[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'activate.ps1')
$root = Get-VideoProjectRoot
$node = Find-VideoExecutable -Names @('node.exe') -Directories @(Get-VideoToolDirectories)
$version = Invoke-VideoProbe $node
if (-not (Test-VideoVersion $version ([version]'22.0.0'))) {
    throw 'Install/reuse a supported Node.js LTS (project baseline >=22), then retry. See new-machine-setup.md.'
}
$npm = Find-VideoExecutable -Names @('npm.cmd') -Directories @(Get-VideoToolDirectories)
if (-not $npm) { throw 'npm.cmd missing; use the complete official Node.js distribution.' }
# Explicit installation action; downloads only the existing lockfile's dependencies.
& $npm ci --prefix (Join-Path $root 'remotion-clone') --cache (Join-Path $root 'tools/npm-cache')
if ($LASTEXITCODE -ne 0) { throw 'Remotion dependency installation failed; preserve the error, do not report ready.' }
& $npm run typecheck --prefix (Join-Path $root 'remotion-clone')
if ($LASTEXITCODE -ne 0) { throw 'Remotion typecheck failed; dependency installation is not capability acceptance.' }
