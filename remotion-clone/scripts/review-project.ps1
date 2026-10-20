[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Title,

  [string]$CompositionId,
  [string]$SourcePath,
  [string]$PublicPath
)

$ErrorActionPreference = 'Stop'
$remotionDir = Split-Path -Parent $PSScriptRoot
$repoDir = Split-Path -Parent $remotionDir
$reviewRoot = Join-Path $remotionDir 'review/workflow-flash'
$deliveryRoot = Join-Path $repoDir 'deliverables/final-videos'

function Assert-LeafName {
  param([string]$Value, [string]$Label)

  $trimmed = $Value.Trim()
  if (-not $trimmed) {
    throw "$Label cannot be empty."
  }
  if ($trimmed -in '.', '..' -or $trimmed.EndsWith('.') -or $trimmed.EndsWith(' ')) {
    throw "$Label is not a valid Windows folder name: $Value"
  }
  if ($trimmed.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) {
    throw "$Label contains a character that is not valid in a Windows folder name: $Value"
  }
  return $trimmed
}

function Convert-ToRepoPath {
  param([string]$Path)

  $candidate = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repoDir $Path }
  $resolved = [System.IO.Path]::GetFullPath($candidate)
  $repoPrefix = $repoDir.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Referenced path must stay inside the repository: $Path"
  }
  $baseUri = [System.Uri]::new($repoDir.TrimEnd('\') + '\')
  $targetUri = [System.Uri]::new($resolved)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('\', '/')
}

function Add-UniqueValue {
  param([object[]]$Values, [string]$Value)

  $items = @($Values | Where-Object { $_ })
  if ($Value -and $items -notcontains $Value) {
    $items += $Value
  }
  return @($items)
}

function Write-Utf8Json {
  param([string]$Path, [object]$Value)

  $json = $Value | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText(
    $Path,
    $json + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
}

$safeTitle = Assert-LeafName -Value $Title -Label 'Title'
$projectDir = Join-Path $reviewRoot $safeTitle
$manifestPath = Join-Path $projectDir 'project.json'
$created = -not (Test-Path -LiteralPath $manifestPath)

New-Item -ItemType Directory -Force -Path $projectDir | Out-Null
New-Item -ItemType Directory -Force -Path $deliveryRoot | Out-Null
foreach ($name in @('renders', 'frames', 'contact-sheets')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $projectDir $name) | Out-Null
}

if ($created) {
  $manifest = [ordered]@{
    schemaVersion = 1
    title = $safeTitle
    createdAt = (Get-Date).ToString('o')
    compositionIds = @()
    sourcePaths = @()
    publicPaths = @()
    paths = [ordered]@{
      root = Convert-ToRepoPath -Path $projectDir
      finalVideos = Convert-ToRepoPath -Path $deliveryRoot
      renders = Convert-ToRepoPath -Path (Join-Path $projectDir 'renders')
      frames = Convert-ToRepoPath -Path (Join-Path $projectDir 'frames')
      contactSheets = Convert-ToRepoPath -Path (Join-Path $projectDir 'contact-sheets')
    }
  }
}
else {
  $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.title -ne $safeTitle) {
    throw "Manifest title '$($manifest.title)' does not match folder title '$safeTitle'."
  }
}

if ($manifest.paths -is [System.Collections.IDictionary]) {
  $manifest.paths.Remove('final')
  $manifest.paths['finalVideos'] = Convert-ToRepoPath -Path $deliveryRoot
}
else {
  $manifest.paths.PSObject.Properties.Remove('final')
  $manifest.paths | Add-Member -NotePropertyName finalVideos -NotePropertyValue (Convert-ToRepoPath -Path $deliveryRoot) -Force
}

if ($CompositionId) {
  $manifest.compositionIds = @(Add-UniqueValue -Values @($manifest.compositionIds) -Value $CompositionId.Trim())
}
if ($SourcePath) {
  $manifest.sourcePaths = @(Add-UniqueValue -Values @($manifest.sourcePaths) -Value (Convert-ToRepoPath -Path $SourcePath))
}
if ($PublicPath) {
  $manifest.publicPaths = @(Add-UniqueValue -Values @($manifest.publicPaths) -Value (Convert-ToRepoPath -Path $PublicPath))
}

Write-Utf8Json -Path $manifestPath -Value $manifest

$activeProject = [ordered]@{
  schemaVersion = 1
  title = $safeTitle
  manifest = Convert-ToRepoPath -Path $manifestPath
}
New-Item -ItemType Directory -Force -Path $reviewRoot | Out-Null
Write-Utf8Json -Path (Join-Path $reviewRoot 'current-project.json') -Value $activeProject

[ordered]@{
  created = $created
  title = $safeTitle
  projectDir = $projectDir
  finalDir = $deliveryRoot
  manifestPath = $manifestPath
} | ConvertTo-Json -Compress
