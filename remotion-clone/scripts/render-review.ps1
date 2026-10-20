[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$CompositionId,

  [string]$OutputName,
  [string]$StyleName,
  [string]$Frames,
  [ValidateSet('h264', 'h265', 'vp8', 'vp9', 'prores')]
  [string]$Codec = 'h264',
  [int]$Crf = 20,
  [switch]$Final,
  [switch]$Overwrite,
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$remotionDir = Split-Path -Parent $PSScriptRoot
$projectScript = Join-Path $PSScriptRoot 'review-project.ps1'

function Assert-OutputName {
  param([string]$Value)

  if ([System.IO.Path]::GetFileName($Value) -ne $Value -or $Value.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) {
    throw "OutputName must be a file name without a directory: $Value"
  }
  if ([System.IO.Path]::GetExtension($Value).ToLowerInvariant() -ne '.mp4') {
    throw "OutputName must use the .mp4 extension: $Value"
  }
}

function Get-VersionedPath {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $Path
  }
  $directory = Split-Path -Parent $Path
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  $extension = [System.IO.Path]::GetExtension($Path)
  for ($version = 2; $version -lt 1000; $version++) {
    $candidate = Join-Path $directory ('{0}-v{1:d3}{2}' -f $stem, $version, $extension)
    if (-not (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  throw "Could not allocate a render version for $Path"
}

$projectJson = & $projectScript -Title $Title -CompositionId $CompositionId
$project = $projectJson | ConvertFrom-Json
$rendersDir = Join-Path $project.projectDir 'renders'
$finalRoot = $project.finalDir

if ($Final -and $Frames) {
  throw 'Final output cannot use -Frames. Render review segments to renders/ instead.'
}

$finalSuffix = -join @([char]0x6210, [char]0x7247)
if ($Final) {
  if (-not $StyleName) {
    throw 'Final output requires -StyleName so different approved styles cannot overwrite each other.'
  }
  if ([System.IO.Path]::GetFileName($StyleName) -ne $StyleName -or $StyleName.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) {
    throw "StyleName must be a file-name-safe style label: $StyleName"
  }
  $expectedFinalName = "$Title-$StyleName-$finalSuffix.mp4"
  if ($OutputName -and $OutputName -ne $expectedFinalName) {
    throw "Final OutputName must be the style-stable name '$expectedFinalName', not '$OutputName'."
  }
}

$finalDir = if ($Final) { Join-Path $finalRoot "$Title-$StyleName" } else { $null }

if (-not $OutputName) {
  if ($Final) {
    $OutputName = $expectedFinalName
  }
  else {
    $rangeLabel = if ($Frames) { '-' + ($Frames -replace '[^0-9A-Za-z_-]', '-') } else { '-full' }
    $OutputName = "$CompositionId$rangeLabel.mp4"
  }
}
Assert-OutputName -Value $OutputName

$outputDir = if ($Final) { $finalDir } else { $rendersDir }
$outputPath = Join-Path $outputDir $OutputName
if ($Final) {
  foreach ($legacyPath in @((Join-Path $finalRoot $OutputName), (Join-Path (Join-Path $finalRoot $Title) $OutputName))) {
    if (Test-Path -LiteralPath $legacyPath) {
      throw "Legacy final exists: $legacyPath. Migrate its project references before rendering to $outputPath."
    }
  }
}
if ($Final -and (Test-Path -LiteralPath $outputPath) -and -not $Overwrite) {
  throw "Canonical final already exists: $outputPath. Pass -Overwrite only after the replacement has passed review."
}
if (-not $Final -and -not $Overwrite) {
  $outputPath = Get-VersionedPath -Path $outputPath
}

$arguments = @(
  'remotion',
  'render',
  'src/index.ts',
  $CompositionId,
  $outputPath,
  "--codec=$Codec",
  "--crf=$Crf"
)
if ($Frames) {
  $arguments += "--frames=$Frames"
}

if ($PrepareOnly) {
  [ordered]@{
    projectCreated = [bool]$project.created
    projectDir = $project.projectDir
    outputKind = if ($Final) { 'final' } else { 'review' }
    outputPath = $outputPath
    command = 'npx.cmd ' + ($arguments -join ' ')
  } | ConvertTo-Json
  exit 0
}

if ($Final) {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

Push-Location $remotionDir
try {
  & npx.cmd @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Remotion render failed with exit code $LASTEXITCODE."
  }
  Write-Output "$(if ($Final) { 'Final' } else { 'Review' }) render: $outputPath"
}
finally {
  Pop-Location
}
