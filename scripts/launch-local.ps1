$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiPort = 3210
$webPort = 5173
$apiUrl = "http://localhost:$apiPort/api/health"
$webUrl = "http://localhost:$webPort"

function Write-Step($message) {
  Write-Host ""
  Write-Host "[Warranty Launcher] $message" -ForegroundColor Cyan
}

function Test-PortListening($port) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return $null -ne $connection
  } catch {
    return $false
  }
}

function Wait-HttpReady($url, $timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  return $false
}

function Ensure-Command($name, $displayName) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    return $false
  }

  return $true
}

function Install-NodeIfMissing() {
  if ((Ensure-Command "node" "Node.js") -and (Ensure-Command "npm" "npm")) {
    return
  }

  Write-Step "Node.js not found, trying automatic install"

  if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
    throw "Node.js is missing and winget is not available. Please install Node.js LTS first, then run the launcher again."
  }

  $install = Start-Process -FilePath "winget" -ArgumentList @(
    "install",
    "--id", "OpenJS.NodeJS.LTS",
    "--exact",
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements"
  ) -Wait -PassThru -NoNewWindow

  if ($install.ExitCode -ne 0) {
    throw "Automatic Node.js installation failed. Please install Node.js LTS manually, then run the launcher again."
  }

  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"

  if (-not (Ensure-Command "node" "Node.js") -or -not (Ensure-Command "npm" "npm")) {
    throw "Node.js installation finished, but current session still cannot find node/npm. Please close and run the launcher again."
  }
}

function Run-CheckedCommand($filePath, $arguments, $workingDirectory, $stepName) {
  Write-Step $stepName
  $process = Start-Process -FilePath $filePath -ArgumentList $arguments -WorkingDirectory $workingDirectory -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0) {
    throw "${stepName} failed with exit code $($process.ExitCode)."
  }
}

try {
  Write-Step "Checking runtime"
  Install-NodeIfMissing

  Set-Location $projectRoot

  $nodeModulesPath = Join-Path $projectRoot "node_modules"
  $prismaClientPath = Join-Path $projectRoot "node_modules\.prisma\client"
  $databasePath = Join-Path $projectRoot "prisma\\dev.db"

  if (-not (Test-Path $nodeModulesPath)) {
    Run-CheckedCommand "npm.cmd" @("install") $projectRoot "Installing dependencies"
  } else {
    Write-Step "Dependencies already installed"
  }

  if (-not (Test-Path $prismaClientPath)) {
    Run-CheckedCommand "npx.cmd" @("prisma", "generate") $projectRoot "Generating Prisma client"
  } else {
    Write-Step "Prisma client already exists"
  }

  Run-CheckedCommand "npx.cmd" @("prisma", "db", "push") $projectRoot "Syncing database schema"

  if (-not (Test-Path $databasePath)) {
    Run-CheckedCommand "npm.cmd" @("run", "db:seed") $projectRoot "Seeding demo data"
  } else {
    Write-Step "Database already exists"
  }

  $apiRunning = Test-PortListening $apiPort
  $webRunning = Test-PortListening $webPort

  if (-not $apiRunning -or -not $webRunning) {
    Write-Step "Starting local services"
    if (-not $apiRunning) {
      Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$projectRoot`" && npm run dev:api" -WorkingDirectory $projectRoot -WindowStyle Minimized
    }
    if (-not $webRunning) {
      Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "cd /d `"$projectRoot`" && npm run dev:web" -WorkingDirectory $projectRoot -WindowStyle Minimized
    }
  } else {
    Write-Step "Services already running"
  }

  Write-Step "Waiting for service readiness"
  $apiReady = Wait-HttpReady $apiUrl 90
  $webReady = Wait-HttpReady $webUrl 90

  if (-not $apiReady -or -not $webReady) {
    throw "Service startup timed out. Please try stop-local.bat and then start-local.bat again."
  }

  Write-Step "Opening browser"
  Start-Process $webUrl
  Write-Host ""
  Write-Host "System opened at $webUrl" -ForegroundColor Green
  exit 0
} catch {
  Write-Host ""
  Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Press any key to close..." -ForegroundColor Yellow
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 1
}
