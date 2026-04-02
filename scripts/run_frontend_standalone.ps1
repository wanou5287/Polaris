$ErrorActionPreference = "Stop"

function Wait-Port {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(1000, $false) -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        } catch {
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

function Read-LogTail {
    param(
        [string]$Path,
        [int]$Tail = 40
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    try {
        return (Get-Content -Path $Path -Tail $Tail -ErrorAction SilentlyContinue) -join "`n"
    } catch {
        return ""
    }
}

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($line in Get-Content -Path $Path -ErrorAction SilentlyContinue) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }

        $pair = $trimmed.Split("=", 2)
        $key = $pair[0].Trim()
        $value = $pair[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

function Ensure-AfterSalesApi {
    param(
        [string]$ProjectRoot
    )

    if ($env:POLARIS_SKIP_AFTER_SALES -eq "1") {
        return
    }

    $afterSalesRoot = $env:POLARIS_AFTER_SALES_SOURCE_DIR
    if (-not $afterSalesRoot) {
        $afterSalesRoot = Join-Path (Split-Path -Parent $ProjectRoot) "Polaris__after_sales_branch"
    }

    $afterSalesServer = Join-Path $afterSalesRoot "apps\\api\\dist\\apps\\api\\src\\server.js"
    $afterSalesDist = Join-Path $afterSalesRoot "apps\\web\\dist"
    if (-not (Test-Path $afterSalesServer) -or -not (Test-Path $afterSalesDist)) {
        return
    }

    $env:POLARIS_AFTER_SALES_WEB_DIST = $afterSalesDist
    if (-not $env:POLARIS_AFTER_SALES_API_BASE_URL) {
        $env:POLARIS_AFTER_SALES_API_BASE_URL = "http://127.0.0.1:3210"
    }

    if (Wait-Port -HostName "127.0.0.1" -Port 3210 -TimeoutSeconds 1) {
        return
    }

    $logsDir = Join-Path $ProjectRoot "logs"
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
    $afterSalesOutLog = Join-Path $logsDir "after-sales-local.out.log"
    $afterSalesErrLog = Join-Path $logsDir "after-sales-local.err.log"

    $scopedEnvKeys = @(
        "PORT",
        "DATABASE_URL",
        "ACTIVATION_MODE",
        "ACTIVATION_MOCK_FILE",
        "ACTIVATION_REAL_BASE_URL",
        "ACTIVATION_REAL_PATH",
        "ACTIVATION_REAL_TIMEOUT_MS",
        "ACTIVATION_REAL_AUTH_TYPE",
        "ACTIVATION_REAL_TOKEN"
    )
    $previousEnv = @{}
    foreach ($key in $scopedEnvKeys) {
        $previousEnv[$key] = [System.Environment]::GetEnvironmentVariable($key, "Process")
    }

    try {
        Import-EnvFile -Path (Join-Path $afterSalesRoot ".env")
        [System.Environment]::SetEnvironmentVariable("PORT", "3210", "Process")
        [System.Environment]::SetEnvironmentVariable(
            "DATABASE_URL",
            ("file:" + ((Join-Path $afterSalesRoot "prisma\\dev.db") -replace "\\", "/")),
            "Process"
        )

        Start-Process -FilePath node -ArgumentList @($afterSalesServer) -WorkingDirectory $afterSalesRoot -WindowStyle Hidden `
            -RedirectStandardOutput $afterSalesOutLog -RedirectStandardError $afterSalesErrLog | Out-Null
    } finally {
        foreach ($key in $scopedEnvKeys) {
            [System.Environment]::SetEnvironmentVariable($key, $previousEnv[$key], "Process")
        }
    }

    if (-not (Wait-Port -HostName "127.0.0.1" -Port 3210 -TimeoutSeconds 45)) {
        $afterSalesLogs = Read-LogTail -Path $afterSalesErrLog
        if (-not $afterSalesLogs) {
            $afterSalesLogs = Read-LogTail -Path $afterSalesOutLog
        }
        throw "After-sales API failed to start on port 3210.`n$afterSalesLogs"
    }
}

function Invoke-Robocopy {
    param(
        [string]$Source,
        [string]$Target
    )

    if (-not (Test-Path $Source)) {
        return
    }

    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    robocopy $Source $Target /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed: $Source -> $Target (exit code $LASTEXITCODE)"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$frontendRoot = Join-Path $projectRoot "frontend"
$standaloneRoot = Join-Path $frontendRoot ".next\\standalone"
$standaloneServer = Join-Path $standaloneRoot "server.js"
$staticSource = Join-Path $frontendRoot ".next\\static"
$staticTarget = Join-Path $standaloneRoot ".next\\static"
$publicSource = Join-Path $frontendRoot "public"
$publicTarget = Join-Path $standaloneRoot "public"

if (-not (Test-Path $standaloneServer)) {
    throw "Standalone server not found: $standaloneServer. Run 'npm run build' in frontend first."
}

Invoke-Robocopy -Source $staticSource -Target $staticTarget
Invoke-Robocopy -Source $publicSource -Target $publicTarget
Ensure-AfterSalesApi -ProjectRoot $projectRoot

if (-not $env:PORT) {
    $env:PORT = "3000"
}
if (-not $env:HOSTNAME) {
    $env:HOSTNAME = "0.0.0.0"
}
if (-not $env:NODE_ENV) {
    $env:NODE_ENV = "production"
}

Push-Location $standaloneRoot
try {
    & node "server.js"
} finally {
    Pop-Location
}
