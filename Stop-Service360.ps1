$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path $PSScriptRoot '.runtime'
if (-not (Test-Path -LiteralPath $runtimeDir)) { Write-Host 'No Service360 processes are recorded.'; exit 0 }
foreach ($name in @('mobile', 'web', 'api')) {
    $statePath = Join-Path $runtimeDir "$name.json"
    if (-not (Test-Path -LiteralPath $statePath)) { continue }
    $record = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($record.entry)) {
        Stop-Process -Id $record.pid -ErrorAction Stop
        Write-Host "Stopped Service360 $name."
    } elseif ($process) {
        Write-Warning "PID $($record.pid) no longer belongs to Service360 $name; left untouched."
    }
    Remove-Item -LiteralPath $statePath
}
