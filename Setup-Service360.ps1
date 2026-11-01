$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    foreach ($projectName in @('server', 'web', 'mobile')) {
        Write-Host "Installing $projectName dependencies..." -ForegroundColor Cyan
        & npm.cmd --prefix $projectName install
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed for $projectName." }
    }
    & npm.cmd --prefix server run db:init
    if ($LASTEXITCODE -ne 0) { throw 'Database setup failed. Check server/.env and make sure MySQL is running.' }
    Write-Host 'Setup complete. Run .\Start-Service360.ps1 to start all three applications.' -ForegroundColor Green
} finally {
    Pop-Location
}
