$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
$script:passed = 0
function Assert-Setup {
    param([bool]$Condition, [string]$Name)
    if (-not $Condition) { throw "FAILED: $Name" }
    $script:passed++
}

Assert-Setup ((Get-VideoProjectRoot) -eq [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))) 'project root is independent of cwd'
Assert-Setup (Test-VideoVersion 'Python 3.11.9' ([version]'3.11.0')) 'Python baseline'
Assert-Setup (-not (Test-VideoVersion 'Python 3.10.9' ([version]'3.11.0'))) 'reject old Python'
Assert-Setup (-not (Test-VideoVersion '' ([version]'3.11.0'))) 'missing version is not ready'
Assert-Setup (Test-VideoVersion 'v22.22.1' ([version]'22.0.0')) 'Node baseline'

foreach ($name in @('NVIDIA GeForce RTX 4060', 'RX 7700 XT', 'Intel Arc A770')) {
    $route = Get-VideoAsrRecommendation -DetectedGpu @($name)
    Assert-Setup ($route.route -eq 'local-asr-evaluation') "local-first for $name"
    Assert-Setup (-not $route.localAsrVerified) 'GPU name is not inference evidence'
}
$route = Get-VideoAsrRecommendation -GpuHint 'RTX 3060'
Assert-Setup ($route.route -eq 'local-asr-evaluation' -and $route.gpuSource -eq 'user-reported') 'GPU hint can shortlist'
$route = Get-VideoAsrRecommendation -DetectedGpu @('Intel UHD Graphics') -GpuHint 'RTX 4060'
Assert-Setup ($route.route -eq 'local-asr-evaluation') 'reported discrete GPU supplements detected integrated GPU'
$route = Get-VideoAsrRecommendation -DetectedGpu @('Microsoft Basic Display Adapter') -GpuHint 'RX 7800 XT'
Assert-Setup ($route.route -eq 'local-asr-evaluation') 'generic adapter does not discard GPU hint'
foreach ($names in @(@(), @('unknown'), @('Intel UHD Graphics'), @('Apple M3'))) {
    $route = Get-VideoAsrRecommendation -DetectedGpu $names
    Assert-Setup ($route.route -eq 'chatcut-desktop') 'unknown or unintegrated GPU uses Desktop recommendation'
}
Assert-Setup ((Get-VideoAsrRecommendation -GpuHint 'RTX 4060' -PreferDesktop).route -eq 'chatcut-desktop') 'explicit Desktop choice wins'
Assert-Setup ($null -eq (Invoke-VideoProbe -Executable 'missing-setup-test.exe')) 'missing executable is not usable'
$shell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $shell)) { $shell = Join-Path $PSHOME 'pwsh.exe' }
Assert-Setup ((Invoke-VideoProbe $shell '-NoProfile -Command "Write-Output probe-ok"') -eq 'probe-ok') 'probe actually executes'
Assert-Setup ($null -eq (Invoke-VideoProbe $shell '-NoProfile -Command "exit 2"')) 'nonzero probe fails'
Assert-Setup ($null -eq (Invoke-VideoProbe $shell '-NoProfile -Command "Start-Sleep -Seconds 20"' 1)) 'bounded probe timeout'

# A synthetic fresh clone has no runtimes, configs, launcher or dependencies.
# Mocks stay inside this script process; no installation or hardware access.
& {
    function Get-VideoToolDirectories { param($Root) @() }
    function Find-VideoExecutable { param($Names, $Directories) $null }
    function Get-VideoHardware { param($SkipHardwareProbe) [pscustomobject]@{gpuNames=@(); memoryGiB=$null; freeDiskGiB=$null; errors=@()} }
    function Get-Process { param($Name, $ErrorAction) $null }
    $saved = @{}
    foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'VIDEO_CODEX_EXE')) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    try {
        $empty = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
        $report = Get-VideoEnvironment -Root $empty -SkipHardwareProbe -GpuHint 'RTX 4060'
        Assert-Setup (-not $report.tools.node.usable -and -not $report.tools.python.usable) 'fresh clone reports missing runtimes'
        Assert-Setup (-not $report.tools.remotionDependenciesPresent -and -not $report.tools.localAsrConfigPresent) 'fresh clone reports missing dependencies and config'
        Assert-Setup (-not $report.tools.chatcutDesktop.officialLauncherPresent) 'fresh clone reports missing Desktop launcher'
        Assert-Setup (-not $report.agentReady -and -not $report.tools.chatcutDesktop.connectionVerified) 'never assert agent readiness from inventory'
        Assert-Setup ($report.recommendation.route -eq 'local-asr-evaluation') 'fresh clone is local-first'
        $null = $report | ConvertTo-Json -Depth 8 | ConvertFrom-Json
        Assert-Setup (-not (Test-Path -LiteralPath $empty)) 'doctor does not create a state directory'
    } finally {
        foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
}
Write-Output "PASS: $script:passed setup checks (no installs or network)"
