$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$logsDir = Join-Path $projectRoot "logs"
$runtimeDir = Join-Path $projectRoot ".runtime"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$backendEnv = Join-Path $backendDir ".env"
$frontendEnv = Join-Path $frontendDir ".env"

@"
OPENAI_API_KEY=local-placeholder-key
OPENAI_BASE_URL=https://api.openai.com/v1
ELEVENLABS_API_KEY=
PEXELS_API_KEY=
MONGODB_URL=mongodb://127.0.0.1:27017/wordpecker
PORT=3000
NODE_ENV=development
VITE_API_URL=http://localhost:3000
"@ | Set-Content -Path $backendEnv -NoNewline

@"
VITE_API_URL=http://localhost:3000
"@ | Set-Content -Path $frontendEnv -NoNewline

if ((Get-Service MongoDB -ErrorAction SilentlyContinue).Status -ne "Running") {
    Start-Service MongoDB
    Start-Sleep -Seconds 5
}

if (-not (Test-Path (Join-Path $backendDir "node_modules"))) {
    Write-Host "Installing backend dependencies..."
    Push-Location $backendDir
    npm ci
    Pop-Location
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $frontendDir
    npm ci
    Pop-Location
}

$backendLog = Join-Path $logsDir "backend.log"
$frontendLog = Join-Path $logsDir "frontend.log"

$backendProcess = Start-Process powershell -WorkingDirectory $backendDir -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", "npm run dev *> '$backendLog'"
) -PassThru
$backendProcess.Id | Set-Content -Path (Join-Path $runtimeDir "backend.pid") -NoNewline

Start-Sleep -Seconds 8

$frontendProcess = Start-Process powershell -WorkingDirectory $frontendDir -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", "npm run dev -- --host 0.0.0.0 *> '$frontendLog'"
) -PassThru
$frontendProcess.Id | Set-Content -Path (Join-Path $runtimeDir "frontend.pid") -NoNewline

Write-Host ""
Write-Host "Local services should be available at:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:3000"
Write-Host "  MongoDB:  localhost:27017"
Write-Host "  Logs:     $logsDir"
