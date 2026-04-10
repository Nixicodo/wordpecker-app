$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $projectRoot ".env.docker") $envFile
}

$envContent = Get-Content $envFile -Raw
if ($envContent -match "OPENAI_API_KEY=your_openai_api_key_here") {
    $envContent = $envContent -replace "OPENAI_API_KEY=your_openai_api_key_here", "OPENAI_API_KEY=local-placeholder-key"
    Set-Content -Path $envFile -Value $envContent -NoNewline
}

Write-Host "Starting WordPecker services with Docker Compose..."
docker compose up -d --build

Write-Host ""
Write-Host "Services should be available at:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:3000"
Write-Host "  MongoDB:  localhost:27017"
