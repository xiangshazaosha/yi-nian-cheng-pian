# Shared, dependency-free Windows environment discovery. Never installs software.
function Get-VideoProjectRoot {
    [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Get-VideoToolDirectories {
    param([string]$Root = (Get-VideoProjectRoot))
    $relative = @('tools/node', 'tools/python', 'tools/python/Scripts', 'tools/ffmpeg/bin')
    $paths = @($relative | ForEach-Object { Join-Path $Root $_ })
    foreach ($name in @('node', 'python')) {
        $base = Join-Path $Root "tools/$name"
        if (Test-Path -LiteralPath $base -PathType Container) {
            $paths += @(Get-ChildItem -LiteralPath $base -Directory | ForEach-Object { $_.FullName })
        }
    }
    $legacyFfmpeg = Join-Path $Root 'tools/chatcut-runtime/.chatcut/cache/ffmpeg'
    if (Test-Path -LiteralPath $legacyFfmpeg -PathType Container) {
        $paths += @(Get-ChildItem -Path (Join-Path $legacyFfmpeg '*/win32-x64') -Directory -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty FullName)
    }
    @($paths | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -Unique)
}

function Find-VideoExecutable {
    param([string[]]$Names, [string[]]$Directories = @())
    foreach ($dir in $Directories) {
        foreach ($name in $Names) {
            $path = Join-Path $dir $name
            if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
        }
    }
    foreach ($name in $Names) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        # App execution aliases can open a Store or auto-install a runtime.
        if ($command -and $command.Source -notmatch '(?i)[\\/]Microsoft[\\/]WindowsApps[\\/]') {
            return $command.Source
        }
    }
    return $null
}

function Invoke-VideoProbe {
    param([string]$Executable, [string]$Arguments = '--version', [int]$TimeoutSeconds = 10)
    if (-not $Executable) { return $null }
    $process = New-Object System.Diagnostics.Process
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { return $null }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill()
            $process.WaitForExit()
            return $null
        }
        $output = ($stdout.Result + "`n" + $stderr.Result).Trim()
        if ($process.ExitCode -eq 0) { return $output }
    } catch {
        return $null
    } finally {
        $process.Dispose()
    }
    return $null
}

function Test-VideoVersion {
    param([string]$Text, [version]$Minimum)
    if ($Text -match '(\d+)\.(\d+)\.(\d+)') {
        return ([version]$Matches[0] -ge $Minimum)
    }
    return $false
}

function Get-VideoAsrRecommendation {
    param([string[]]$DetectedGpu = @(), [string]$GpuHint = '', [switch]$PreferDesktop)
    $detected = @($DetectedGpu | Where-Object { $_ -and $_ -notmatch '(?i)basic display|remote display' })
    $names = ($detected -join '; ').Trim()
    $source = 'detected'
    if ($GpuHint.Trim()) {
        if ($names) { $names += '; ' + $GpuHint.Trim(); $source = 'detected-and-user-reported' }
        else { $names = $GpuHint.Trim(); $source = 'user-reported' }
    }
    $candidate = $null
    if ($names -match '(?i)nvidia|geforce|quadro|tesla|\bRTX\s*\d|\bGTX\s*\d') {
        $candidate = 'whisper.cpp Vulkan; current project launcher is Vulkan-only'
    } elseif ($names -match '(?i)radeon|\bAMD\b|\bRX\s*\d|intel.*arc|\barc\s+[ab]\d') {
        $candidate = 'whisper.cpp Vulkan; verify the exact device and driver'
    } elseif ($names -match '(?i)apple.*\bM[1-9]|\bM[1-9](\s|$)') {
        $candidate = 'whisper.cpp Metal; project launcher requires a separate platform adapter'
    }
    $route = 'chatcut-desktop'
    if (-not $PreferDesktop -and $candidate -and $candidate -notmatch 'Metal') { $route = 'local-asr-evaluation' }
    [pscustomobject]@{
        route = $route
        gpuSource = $(if ($names) { $source } else { 'unknown' })
        gpuDescription = $names
        localCandidate = $candidate
        confidence = 'preliminary-only'
        localAsrVerified = $false
        requiresRealGpuSample = $true
    }
}

function Get-VideoHardware {
    param([switch]$SkipHardwareProbe)
    $result = [ordered]@{ gpuNames = @(); memoryGiB = $null; freeDiskGiB = $null; errors = @() }
    if ($SkipHardwareProbe) { return [pscustomobject]$result }
    try {
        # AdapterRAM is commonly a truncated 32-bit value; do not use it as VRAM.
        $result.gpuNames = @(Get-CimInstance Win32_VideoController -OperationTimeoutSec 10 -ErrorAction Stop |
            Select-Object -ExpandProperty Name)
        $os = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 10 -ErrorAction Stop
        $result.memoryGiB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        $drive = Get-PSDrive -Name ((Get-VideoProjectRoot).Substring(0, 1)) -ErrorAction Stop
        $result.freeDiskGiB = [math]::Round($drive.Free / 1GB, 1)
    } catch { $result.errors += 'Hardware inspection incomplete; ask for a GPU name, or recommend Desktop.' }
    [pscustomobject]$result
}

function Get-VideoEnvironment {
    param([string]$Root = (Get-VideoProjectRoot), [switch]$SkipHardwareProbe,
          [string]$GpuHint = '', [switch]$PreferDesktop)
    $dirs = @(Get-VideoToolDirectories -Root $Root)
    $node = Find-VideoExecutable -Names @('node.exe') -Directories $dirs
    $python = Find-VideoExecutable -Names @('python.exe', 'python3.exe') -Directories $dirs
    $ffmpeg = Find-VideoExecutable -Names @('ffmpeg.exe') -Directories $dirs
    $ffprobe = Find-VideoExecutable -Names @('ffprobe.exe') -Directories $dirs
    $codex = $null
    if ($env:VIDEO_CODEX_EXE -and (Test-Path -LiteralPath $env:VIDEO_CODEX_EXE -PathType Leaf)) {
        $codex = $env:VIDEO_CODEX_EXE
    } elseif ($env:LOCALAPPDATA) {
        $base = Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin'
        $codex = Get-ChildItem -Path (Join-Path $base '*/codex.exe') -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $codex) { $codex = Find-VideoExecutable -Names @('codex.exe', 'codex') }
    $nodeVersion = Invoke-VideoProbe -Executable $node
    $pythonVersion = Invoke-VideoProbe -Executable $python
    $launcher = $null
    if ($env:APPDATA) { $launcher = Join-Path $env:APPDATA 'ChatCut/chatcut-mcp.cmd' }
    $desktopRunning = [bool](Get-Process -Name ChatCut -ErrorAction SilentlyContinue | Select-Object -First 1)
    $hardware = Get-VideoHardware -SkipHardwareProbe:$SkipHardwareProbe
    $recommendation = Get-VideoAsrRecommendation -DetectedGpu $hardware.gpuNames -GpuHint $GpuHint -PreferDesktop:$PreferDesktop
    [pscustomobject]@{
        schemaVersion = 1
        platform = [pscustomobject]@{
            os = [Environment]::OSVersion.Platform.ToString()
            architecture = $env:PROCESSOR_ARCHITECTURE
            projectBaseline = 'Windows x64; other platforms are not yet validated'
            supportedByCurrentScripts = ([Environment]::OSVersion.Platform -eq 'Win32NT' -and $env:PROCESSOR_ARCHITECTURE -eq 'AMD64')
        }
        hardware = $hardware
        tools = [pscustomobject]@{
            node = [pscustomobject]@{ path = $node; version = $nodeVersion; usable = (Test-VideoVersion $nodeVersion ([version]'22.0.0')) }
            npm = [pscustomobject]@{ path = (Find-VideoExecutable -Names @('npm.cmd') -Directories $dirs) }
            python = [pscustomobject]@{ path = $python; version = $pythonVersion; usable = (Test-VideoVersion $pythonVersion ([version]'3.11.0')) }
            codex = [pscustomobject]@{ path = $codex; available = [bool]$codex }
            chatcutDesktop = [pscustomobject]@{
                officialLauncherPresent = [bool]($launcher -and (Test-Path -LiteralPath $launcher -PathType Leaf))
                processRunning = $desktopRunning
                connectionVerified = $false
            }
            ffmpeg = [pscustomobject]@{ path = $ffmpeg; executableVerified = [bool](Invoke-VideoProbe $ffmpeg '-version') }
            ffprobe = [pscustomobject]@{ path = $ffprobe; executableVerified = [bool](Invoke-VideoProbe $ffprobe '-version') }
            remotionDependenciesPresent = (Test-Path -LiteralPath (Join-Path $Root 'remotion-clone/node_modules/typescript/bin/tsc'))
            localAsrConfigPresent = (Test-Path -LiteralPath (Join-Path $Root 'tools/whisper-cpp/runtime-config.json'))
        }
        recommendation = $recommendation
        agentReady = $false
        nextStep = 'Read docs/workflows/new-machine-setup.md; installation and live capability checks remain required.'
    }
}
