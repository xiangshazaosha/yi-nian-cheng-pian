[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'

$resolved = Resolve-Path -LiteralPath $InputPath -ErrorAction Stop
$item = Get-Item -LiteralPath $resolved.Path
$scope = if ($item.PSIsContainer) { $item.FullName } else { $item.DirectoryName }
$maxDepth = if ($item.PSIsContainer) { 2 } else { 0 }

# Naming-only route runs before any optional visual workflow. Explicit video
# input is scoped to that file; unrelated sibling B-roll cannot enable it.
$roleScript = Join-Path $PSScriptRoot '..\..\video_editing\media_roles.cjs'
$roleJson = & node $roleScript --input $item.FullName
if ($LASTEXITCODE -ne 0) { throw 'Media naming classification failed.' }
$mediaRouting = ($roleJson -join "`n") | ConvertFrom-Json
if (@($mediaRouting.conflicts).Count -gt 0) { throw ('Conflicting media role names: ' + ($mediaRouting.conflicts -join ', ')) }

$videoExtensions = @('.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v')
$audioExtensions = @('.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg')
$subtitleExtensions = @('.srt', '.vtt', '.ass', '.ssa')

$ffprobe = Join-Path $PSScriptRoot '..\node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe'
$ffprobe = [System.IO.Path]::GetFullPath($ffprobe)
if (-not (Test-Path -LiteralPath $ffprobe)) {
  $command = Get-Command ffprobe -ErrorAction SilentlyContinue
  if (-not $command) {
    throw 'ffprobe was not found. Run npm ci in remotion-clone first.'
  }
  $ffprobe = $command.Source
}

$files = if (-not $item.PSIsContainer) {
  @($item) + @(Get-ChildItem -LiteralPath $scope -File | Where-Object {
    $_.FullName -ne $item.FullName -and $_.BaseName -eq $item.BaseName -and
    (($audioExtensions -contains $_.Extension.ToLowerInvariant()) -or ($subtitleExtensions -contains $_.Extension.ToLowerInvariant()))
  })
} else {
  Get-ChildItem -LiteralPath $scope -File -Recurse -Depth $maxDepth |
    Where-Object { $_.FullName -notmatch '\\(node_modules|\.git|review|out|dist)\\' }
}

function Get-RelativeSourcePath {
  param([string]$Path)
  $root = $scope.TrimEnd('\') + '\'
  if ($Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $Path.Substring($root.Length).Replace('\', '/')
  }
  return [System.IO.Path]::GetFileName($Path)
}

function Convert-Fps {
  param([string]$Value)
  if (-not $Value) { return $null }
  $parts = $Value.Split('/')
  if ($parts.Count -eq 2 -and [double]$parts[1] -ne 0) {
    return [Math]::Round(([double]$parts[0] / [double]$parts[1]), 3)
  }
  return [double]$Value
}

function Get-VideoProbe {
  param([System.IO.FileInfo]$File)

  $raw = & $ffprobe -v error `
    -show_entries 'format=duration' `
    -show_entries 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels' `
    -of json $File.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "ffprobe failed for $($File.FullName)"
  }
  $probe = $raw | ConvertFrom-Json
  $videoStream = $probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  $audioStream = $probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
  $duration = [Math]::Round([double]$probe.format.duration, 3)

  [ordered]@{
    path = Get-RelativeSourcePath -Path $File.FullName
    durationSeconds = $duration
    width = $videoStream.width
    height = $videoStream.height
    fps = Convert-Fps -Value $videoStream.r_frame_rate
    videoCodec = $videoStream.codec_name
    hasAudio = [bool]$audioStream
    audioCodec = if ($audioStream) { $audioStream.codec_name } else { $null }
  }
}

$namedVideoPaths = @($mediaRouting.videos | ForEach-Object { $_.path })
$videoFiles = @($files | Where-Object { ($videoExtensions -contains $_.Extension.ToLowerInvariant()) -and ($namedVideoPaths -contains (Get-RelativeSourcePath -Path $_.FullName)) })
$audioFiles = @($files | Where-Object { $audioExtensions -contains $_.Extension.ToLowerInvariant() })
$subtitleFiles = @($files | Where-Object { $subtitleExtensions -contains $_.Extension.ToLowerInvariant() })
$videos = @($videoFiles | ForEach-Object { Get-VideoProbe -File $_ })

$ranked = @($videos | Where-Object { @($mediaRouting.speechVideos) -contains $_.path } | Sort-Object -Property @(
  @{Expression = {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($_.path)
    $score = 0
    if ($name -match '(?i)a[-_ ]?roll|主讲|口播|正片|成片') { $score += 100 }
    if ($name -match '(?i)b[-_ ]?roll|录屏|演示|素材') { $score -= 80 }
    $score
  }; Descending = $true},
  @{Expression = 'durationSeconds'; Descending = $true}
))
$primaryVideo = $ranked | Select-Object -First 1
$duration = if ($primaryVideo) { [double]$primaryVideo.durationSeconds } else { 0 }

$result = [ordered]@{
  schemaVersion = 1
  inputPath = $item.FullName
  sourceDirectory = $scope
  suggestedTitle = Split-Path -Leaf $scope
  productionIntentDetected = ($videos.Count -gt 0)
  defaultStyle = '双色风'
  primaryVideo = $primaryVideo
  videos = $videos
  mediaRouting = $mediaRouting
  audioFiles = @($audioFiles | ForEach-Object { Get-RelativeSourcePath -Path $_.FullName })
  timedSubtitleFiles = @($subtitleFiles | ForEach-Object { Get-RelativeSourcePath -Path $_.FullName })
  hasTimedSubtitles = ($subtitleFiles.Count -gt 0)
  durationSeconds = $duration
  longForm = ($duration -gt 120)
  recommendSegmentedProduction = ($duration -gt 120)
  nextGate = if ($videos.Count -gt 0) { 'render_style_stills_then_wait_for_confirmation' } else { 'no_video_found' }
}

$result | ConvertTo-Json -Depth 8
