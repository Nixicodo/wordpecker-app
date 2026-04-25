$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$logsDir = Join-Path $projectRoot "logs"
$runtimeDir = Join-Path $projectRoot ".runtime"
$nodeExe = (Get-Command node).Source
$codexDir = Join-Path $env:USERPROFILE ".codex"
$codexAuthFile = Join-Path $codexDir "auth.json"
$codexConfigFile = Join-Path $codexDir "config.toml"

function Get-ListeningProcess {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if (-not $connection) {
        return $null
    }

    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    $commandLine = $null
    $processName = "PID $($connection.OwningProcess)"

    if ($process) {
        $processName = "$($process.ProcessName) (PID $($process.Id))"
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction SilentlyContinue
        if ($processInfo) {
            $commandLine = $processInfo.CommandLine
        }
    }

    return [pscustomobject]@{
        Id = $connection.OwningProcess
        DisplayName = $processName
        CommandLine = $commandLine
    }
}

function Stop-ProcessTree {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-ProjectPortOwner {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [string]$ProjectRoot
    )

    $owner = Get-ListeningProcess -Port $Port
    if (-not $owner) {
        return
    }

    if ($owner.CommandLine -and $owner.CommandLine.Contains($ProjectRoot)) {
        Write-Host "Stopping stale WordPecker process on port ${Port}: $($owner.DisplayName)"
        Stop-ProcessTree -ProcessId $owner.Id
        Start-Sleep -Seconds 1
        return
    }

    throw "Port $Port is already in use by $($owner.DisplayName). Stop that process first, then rerun scripts\start-local.ps1."
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$backendEnv = Join-Path $backendDir ".env"
$frontendEnv = Join-Path $frontendDir ".env"

$openAiApiKey = "local-placeholder-key"
$openAiBaseUrl = "https://api.openai.com/v1"

if (Test-Path $codexAuthFile) {
    try {
        $authConfig = Get-Content $codexAuthFile -Raw | ConvertFrom-Json
        if ($authConfig.OPENAI_API_KEY) {
            $openAiApiKey = $authConfig.OPENAI_API_KEY
        }
    } catch {
        Write-Warning "Failed to parse $codexAuthFile, falling back to placeholder OPENAI_API_KEY."
    }
}

if (Test-Path $codexConfigFile) {
    try {
        $configContent = Get-Content $codexConfigFile -Raw
        $providerMatch = [regex]::Match($configContent, '(?m)^model_provider\s*=\s*"([^"]+)"')
        if ($providerMatch.Success) {
            $providerName = [regex]::Escape($providerMatch.Groups[1].Value)
            $baseUrlPattern = "(?ms)^\[model_providers\.$providerName\].*?^base_url\s*=\s*""([^""]+)"""
            $baseUrlMatch = [regex]::Match($configContent, $baseUrlPattern)
            if ($baseUrlMatch.Success) {
                $openAiBaseUrl = $baseUrlMatch.Groups[1].Value
            }
        }
    } catch {
        Write-Warning "Failed to parse $codexConfigFile, falling back to default OPENAI_BASE_URL."
    }
}

@"
OPENAI_API_KEY=$openAiApiKey
OPENAI_BASE_URL=$openAiBaseUrl
OPENAI_MODEL=gpt-5.4
ELEVENLABS_API_KEY=local-placeholder-key
PEXELS_API_KEY=
MONGODB_URL=mongodb://127.0.0.1:27017/wordpecker
PORT=3000
NODE_ENV=development
VITE_API_URL=http://localhost:3000
"@ | Set-Content -Path $backendEnv -NoNewline

@"
VITE_API_URL=http://localhost:3000
"@ | Set-Content -Path $frontendEnv -NoNewline

$mongoService = Get-Service MongoDB -ErrorAction SilentlyContinue
if (-not $mongoService) {
    throw "MongoDB service was not found. Please install MongoDB or update the script to use your actual service name."
}

if ($mongoService.Status -ne "Running") {
    Start-Service MongoDB
    Start-Sleep -Seconds 5
    $mongoService.Refresh()
    if ($mongoService.Status -ne "Running") {
        throw "MongoDB service failed to start. Please check the Windows service status first."
    }
}

foreach ($name in @("backend", "frontend")) {
    $pidFile = Join-Path $runtimeDir "$name.pid"
    if (Test-Path $pidFile) {
        $processId = Get-Content $pidFile -Raw
        if ($processId) {
            Stop-ProcessTree -ProcessId $processId
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

Stop-ProjectPortOwner -Port 3000 -ProjectRoot $projectRoot
Stop-ProjectPortOwner -Port 5173 -ProjectRoot $projectRoot

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
$backendErrLog = Join-Path $logsDir "backend.err.log"
$frontendLog = Join-Path $logsDir "frontend.log"
$frontendErrLog = Join-Path $logsDir "frontend.err.log"

if (Test-Path $backendLog) { Remove-Item $backendLog -Force }
if (Test-Path $backendErrLog) { Remove-Item $backendErrLog -Force }
if (Test-Path $frontendLog) { Remove-Item $frontendLog -Force }
if (Test-Path $frontendErrLog) { Remove-Item $frontendErrLog -Force }

$backendProcess = Start-Process -FilePath $nodeExe -WorkingDirectory $backendDir -ArgumentList @(
    ".\node_modules\nodemon\bin\nodemon.js",
    "--watch",
    "src",
    "--ext",
    "ts,json",
    "--ignore",
    "data/**",
    "--ignore",
    "dist/**",
    "--ignore",
    "coverage/**",
    "src/app.ts"
) -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrLog -WindowStyle Hidden -PassThru
$backendProcess.Id | Set-Content -Path (Join-Path $runtimeDir "backend.pid") -NoNewline

Start-Sleep -Seconds 8

$frontendProcess = Start-Process -FilePath $nodeExe -WorkingDirectory $frontendDir -ArgumentList @(
    ".\node_modules\vite\bin\vite.js",
    "--host",
    "0.0.0.0",
    "--strictPort"
) -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrLog -WindowStyle Hidden -PassThru
$frontendProcess.Id | Set-Content -Path (Join-Path $runtimeDir "frontend.pid") -NoNewline

Write-Host ""
Write-Host "Local services should be available at:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:3000"
Write-Host "  MongoDB:  localhost:27017"
Write-Host "  Logs:     $logsDir"
