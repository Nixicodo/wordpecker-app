$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime"

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

Write-Host "Stopping WordPecker services..."

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
