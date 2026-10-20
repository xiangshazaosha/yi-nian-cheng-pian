# Dot-source in each agent shell after project-local runtimes are installed.
# Changes only this process's PATH, never the user's or machine's PATH.
. (Join-Path $PSScriptRoot 'environment.ps1')
$toolDirectories = @(Get-VideoToolDirectories)
if ($toolDirectories.Count) {
    $env:PATH = (($toolDirectories + @($env:PATH)) -join [IO.Path]::PathSeparator)
}
$ffprobe = Find-VideoExecutable -Names @('ffprobe.exe') -Directories $toolDirectories
if ($ffprobe -and -not $env:VIDEO_FFPROBE) { $env:VIDEO_FFPROBE = $ffprobe }
