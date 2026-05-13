param(
    [string]$BackendUrl = "http://localhost:3000",
    [string]$FrontendUrl = "http://localhost:5173",
    [string]$UserId = "local-ai-test-user",
    [int]$ApiTimeoutSeconds = 45,
    [int]$FrontendTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $projectRoot "frontend"
$nodeExe = (Get-Command node).Source

function Wait-JsonEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [hashtable]$Headers = @{},
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds,
        [scriptblock]$Validate
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = "No response received yet."

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 5
            if (-not $Validate -or (& $Validate $response)) {
                return $response
            }

            $lastError = "Endpoint returned an unexpected payload."
        } catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Milliseconds 500
    }

    throw "$Label did not become ready at $Url within $TimeoutSeconds seconds. Last error: $lastError"
}

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = "No response received yet."

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return $response
            }

            $lastError = "Unexpected HTTP status $($response.StatusCode)."
        } catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Milliseconds 500
    }

    throw "$Label did not become ready at $Url within $TimeoutSeconds seconds. Last error: $lastError"
}

function Invoke-DueReviewSmoke {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SmokeFrontendUrl,
        [Parameter(Mandatory = $true)]
        [string]$SmokeBackendUrl,
        [Parameter(Mandatory = $true)]
        [string]$SmokeUserId
    )

    $originalFrontendUrl = $env:SMOKE_FRONTEND_URL
    $originalBackendUrl = $env:SMOKE_BACKEND_URL
    $originalUserId = $env:SMOKE_USER_ID

    $locationPushed = $false

    try {
        $env:SMOKE_FRONTEND_URL = $SmokeFrontendUrl
        $env:SMOKE_BACKEND_URL = $SmokeBackendUrl
        $env:SMOKE_USER_ID = $SmokeUserId

        Push-Location $frontendDir
        $locationPushed = $true
        & $nodeExe ".\scripts\smoke-due-review.mjs"
        if ($LASTEXITCODE -ne 0) {
            throw "Due-review smoke check exited with code $LASTEXITCODE."
        }
    } finally {
        if ($locationPushed) {
            Pop-Location
        }

        if ($null -ne $originalFrontendUrl) {
            $env:SMOKE_FRONTEND_URL = $originalFrontendUrl
        } else {
            Remove-Item Env:SMOKE_FRONTEND_URL -ErrorAction SilentlyContinue
        }

        if ($null -ne $originalBackendUrl) {
            $env:SMOKE_BACKEND_URL = $originalBackendUrl
        } else {
            Remove-Item Env:SMOKE_BACKEND_URL -ErrorAction SilentlyContinue
        }

        if ($null -ne $originalUserId) {
            $env:SMOKE_USER_ID = $originalUserId
        } else {
            Remove-Item Env:SMOKE_USER_ID -ErrorAction SilentlyContinue
        }
    }
}

$apiHeaders = @{ "user-id" = $UserId }

Write-Host "Checking backend due-review endpoint..."
$dueReview = Wait-JsonEndpoint `
    -Label "Backend due-review endpoint" `
    -Url "$BackendUrl/api/lists/due-review" `
    -Headers $apiHeaders `
    -TimeoutSeconds $ApiTimeoutSeconds `
    -Validate {
        param($payload)
        ($payload.PSObject.Properties.Name -contains "id") -and
        ($payload.PSObject.Properties.Name -contains "dueCount") -and
        ($payload.PSObject.Properties.Name -contains "sourceListCount")
    }

Write-Host "Checking backend discipline-status endpoint..."
$disciplineStatus = Wait-JsonEndpoint `
    -Label "Backend discipline-status endpoint" `
    -Url "$BackendUrl/api/lists/discipline-status" `
    -Headers $apiHeaders `
    -TimeoutSeconds $ApiTimeoutSeconds `
    -Validate {
        param($payload)
        ($payload.PSObject.Properties.Name -contains "dueReviewListId") -and
        ($payload.PSObject.Properties.Name -contains "entryState")
    }

Write-Host "Checking frontend reviews route..."
$null = Wait-HttpEndpoint `
    -Label "Frontend reviews route" `
    -Url "$FrontendUrl/reviews" `
    -TimeoutSeconds $FrontendTimeoutSeconds

Write-Host "Running due-review end-to-end smoke check..."
Invoke-DueReviewSmoke `
    -SmokeFrontendUrl $FrontendUrl `
    -SmokeBackendUrl $BackendUrl `
    -SmokeUserId $UserId

Write-Host ""
Write-Host "Local health check passed."
Write-Host "  due-review list id : $($dueReview.id)"
Write-Host "  due-review count   : $($dueReview.dueCount)"
Write-Host "  source list count  : $($dueReview.sourceListCount)"
Write-Host "  discipline state   : $($disciplineStatus.entryState)"
