[CmdletBinding()]
param([string]$GpuHint = '', [switch]$PreferDesktop, [switch]$SkipHardwareProbe)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
# stdout only: no credentials, configuration writes, downloads, or software install.
Get-VideoEnvironment -GpuHint $GpuHint -PreferDesktop:$PreferDesktop -SkipHardwareProbe:$SkipHardwareProbe |
    ConvertTo-Json -Depth 8
