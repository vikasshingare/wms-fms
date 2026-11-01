param([switch]$Lan, [switch]$SkipMobile)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$services = @(
    @{ Name = 'api'; Directory = 'server'; Entry = 'src/index.js'; Arguments = @(); Port = 4000; Url = 'http://127.0.0.1:4000/api/health' },
    @{ Name = 'web'; Directory = 'web'; Entry = 'node_modules/vite/bin/vite.js'; Arguments = @('--host', '127.0.0.1', '--port', '5174', '--strictPort'); Port = 5174; Url = 'http://127.0.0.1:5174' }
)
if (-not $SkipMobile) {
    $expoHost = if ($Lan) { 'lan' } else { 'localhost' }
    $services += @{ Name = 'mobile'; Directory = 'mobile'; Entry = 'node_modules/expo/bin/cli'; Arguments = @('start', '--web', '--host', $expoHost, '--port', '8081'); Port = 8081; Url = 'http://127.0.0.1:8081' }
}
$lanAddress = $null
if ($Lan) {
    $lanAddress = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
    if (-not $lanAddress) { throw 'No active LAN address was found.' }
}
$savedHost = $env:HOST
$savedApiUrl = $env:EXPO_PUBLIC_API_URL
$savedCI = $env:CI
try {
    $env:HOST = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
    $env:EXPO_PUBLIC_API_URL = if ($Lan) { "http://${lanAddress}:4000/api" } else { 'http://127.0.0.1:4000/api' }
    $env:CI = '1'
    foreach ($service in $services) {
        $workingDirectory = Join-Path $projectRoot $service.Directory
        $entryPath = Join-Path $workingDirectory $service.Entry
        if (-not (Test-Path -LiteralPath $entryPath)) { throw "Missing $entryPath. Run Setup-Service360.ps1 first." }
        $statePath = Join-Path $runtimeDir "$($service.Name).json"
        $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -in @('127.0.0.1','0.0.0.0') } | Select-Object -First 1
        if ($listener) {
            $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
            $isOurs = $listenerProcess.CommandLine -and ($listenerProcess.CommandLine.Contains($projectRoot) -or ($service.Name -eq 'api' -and (Test-Path -LiteralPath $statePath) -and ((Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).pid -eq $listener.OwningProcess)))
            if (-not $isOurs) { throw "Port $($service.Port) is already occupied by a different process. It has not been stopped." }
            Write-Host "$($service.Name) is already running on port $($service.Port)." -ForegroundColor Green
            continue
        }
        $argumentList = @('"' + $entryPath + '"') + $service.Arguments
        $process = Start-Process -FilePath $nodeExecutable -ArgumentList $argumentList -WorkingDirectory $workingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir "$($service.Name).log") -RedirectStandardError (Join-Path $runtimeDir "$($service.Name).error.log") -PassThru
        @{ pid = $process.Id; entry = $entryPath; name = $service.Name; port = $service.Port; started_at = [DateTime]::UtcNow.ToString('o'); lan = [bool]$Lan } | ConvertTo-Json | Set-Content -LiteralPath $statePath
        Write-Host "Starting $($service.Name) (PID $($process.Id))..." -ForegroundColor Cyan
        $ready = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if ($process.HasExited) { throw "$($service.Name) exited. Read .runtime/$($service.Name).error.log." }
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri $service.Url -TimeoutSec 2
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            } catch { Start-Sleep -Milliseconds 500 }
            $process.Refresh()
        }
        if (-not $ready) { throw "$($service.Name) has not become ready. Inspect .runtime logs." }
    }
    Write-Host "`nAdmin / customer portals: http://localhost:5174" -ForegroundColor Green
    if (-not $SkipMobile) { Write-Host 'Field engineer app:       http://localhost:8081' -ForegroundColor Green }
    Write-Host 'API health:               http://localhost:4000/api/health'
    if ($Lan) { Write-Host "Phone API:                http://${lanAddress}:4000/api"; Write-Host "Expo Go:                  exp://${lanAddress}:8081" }
    Write-Host 'Stop only these app processes with .\Stop-Service360.ps1.'
} finally {
    $env:HOST = $savedHost
    $env:EXPO_PUBLIC_API_URL = $savedApiUrl
    $env:CI = $savedCI
}
