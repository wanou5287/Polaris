param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
    [string]$BuildRoot = "",
    [string]$MySqlSourceDir = "C:\\Program Files\\MySQL\\MySQL Server 8.4",
    [string]$NodeExePath = "C:\\Program Files\\nodejs\\node.exe",
    [string]$AfterSalesSourceDir = "",
    [string]$PackageVersion = (Get-Date -Format "yyyy.MM.dd.HHmm"),
    [string]$CloudflaredExePath = "",
    [string]$CloudflareTunnelToken = "",
    [string]$CloudflarePublicHostname = "",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

function Invoke-Robocopy {
    param(
        [string]$Source,
        [string]$Target,
        [string[]]$ExtraArgs = @()
    )

    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    $baseArgs = @($Source, $Target, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS")
    robocopy @baseArgs @ExtraArgs | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed: $Source -> $Target (exit code $LASTEXITCODE)"
    }
}

function Remove-PathIfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Copy-FileIfExists {
    param(
        [string]$Source,
        [string]$Target
    )

    if (-not (Test-Path $Source)) {
        return
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Target -Force
}

function Copy-AfterSalesWorkspace {
    param(
        [string]$SourceRoot,
        [string]$TargetRoot
    )

    New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
    Copy-FileIfExists -Source (Join-Path $SourceRoot "package.json") -Target (Join-Path $TargetRoot "package.json")
    Copy-FileIfExists -Source (Join-Path $SourceRoot "package-lock.json") -Target (Join-Path $TargetRoot "package-lock.json")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "apps\\api\\dist") -Target (Join-Path $TargetRoot "apps\\api\\dist")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "apps\\web\\dist") -Target (Join-Path $TargetRoot "apps\\web\\dist")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "prisma") -Target (Join-Path $TargetRoot "prisma")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "mock") -Target (Join-Path $TargetRoot "mock")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "node_modules") -Target (Join-Path $TargetRoot "node_modules")

    $warrantyModulesTarget = Join-Path $TargetRoot "node_modules\\@warranty"
    Remove-PathIfExists -Path (Join-Path $warrantyModulesTarget "api")
    Remove-PathIfExists -Path (Join-Path $warrantyModulesTarget "web")
    Remove-PathIfExists -Path (Join-Path $warrantyModulesTarget "shared")
    Invoke-Robocopy -Source (Join-Path $SourceRoot "packages\\shared") -Target (Join-Path $warrantyModulesTarget "shared")

    $sharedPackageJsonPath = Join-Path $warrantyModulesTarget "shared\\package.json"
    if (Test-Path $sharedPackageJsonPath) {
        $sharedPackage = Get-Content -Path $sharedPackageJsonPath -Raw | ConvertFrom-Json
        $sharedPackage.main = "./dist/index.js"
        $sharedPackage.types = "./src/index.ts"
        $sharedPackage | ConvertTo-Json -Depth 8 | Set-Content -Path $sharedPackageJsonPath -Encoding utf8
    }
}

function Resolve-IsccPath {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\\Inno Setup 6\\ISCC.exe"),
        "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
        "C:\\Program Files\\Inno Setup 6\\ISCC.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

function Get-CloudflareTunnelConfig {
    param([string]$ProjectPath)

    $configPath = Join-Path $ProjectPath "deploy\\windows\\cloudflare_tunnel.local.json"
    if (-not (Test-Path $configPath)) {
        return $null
    }

    return Get-Content -Path $configPath -Raw | ConvertFrom-Json
}

function Resolve-CloudflaredExePath {
    param(
        [string]$ExplicitPath,
        [string]$DownloadDirectory
    )

    if ($ExplicitPath) {
        $resolved = (Resolve-Path $ExplicitPath).Path
        if (-not (Test-Path $resolved)) {
            throw "cloudflared.exe not found: $resolved"
        }
        return $resolved
    }

    $downloadPath = Join-Path $DownloadDirectory "cloudflared-windows-amd64.exe"
    if (Test-Path $downloadPath) {
        return $downloadPath
    }

    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/cloudflare/cloudflared/releases/latest"
    $asset = $release.assets | Where-Object { $_.name -eq "cloudflared-windows-amd64.exe" } | Select-Object -First 1
    if (-not $asset) {
        throw "Could not find cloudflared-windows-amd64.exe in the latest cloudflared release."
    }

    Write-Host "Downloading cloudflared from $($asset.browser_download_url)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $downloadPath
    return $downloadPath
}

$projectRoot = (Resolve-Path $ProjectRoot).Path
if (-not $BuildRoot) {
    $BuildRoot = Join-Path $projectRoot "build\\windows-installer"
}
if (-not $AfterSalesSourceDir) {
    $internalAfterSalesCandidate = Join-Path $projectRoot "vendor\\after-sales-source"
    if (Test-Path $internalAfterSalesCandidate) {
        $AfterSalesSourceDir = $internalAfterSalesCandidate
    }
}
if (-not $AfterSalesSourceDir) {
    $afterSalesCandidate = Join-Path (Split-Path -Parent $projectRoot) "Polaris__after_sales_branch"
    if (Test-Path $afterSalesCandidate) {
        $AfterSalesSourceDir = $afterSalesCandidate
    }
}
$afterSalesSourceResolved = $null
if ($AfterSalesSourceDir -and (Test-Path $AfterSalesSourceDir)) {
    $afterSalesSourceResolved = (Resolve-Path $AfterSalesSourceDir).Path
}
$buildRoot = $BuildRoot
$stageRoot = Join-Path $buildRoot "stage\\Polaris"
$pyInstallerRoot = Join-Path $buildRoot "pyinstaller"
$installerOutputDir = Join-Path $buildRoot "installer"
$runtimeStage = Join-Path $stageRoot "runtime"
$runtimeScriptsStage = Join-Path $runtimeStage "scripts"
$runtimeCloudflaredStage = Join-Path $runtimeStage "cloudflared"
$frontendStage = Join-Path $stageRoot "frontend"
$backendStage = Join-Path $stageRoot "backend"
$afterSalesStage = Join-Path $stageRoot "after-sales"
$specPath = Join-Path $projectRoot "deploy\\windows\\runtime\\polaris-backend.spec"
$issPath = Join-Path $projectRoot "deploy\\windows\\installer\\PolarisInstaller.iss"

if (-not (Test-Path $MySqlSourceDir)) {
    throw "MySQL source directory not found: $MySqlSourceDir"
}
if (-not (Test-Path $NodeExePath)) {
    throw "node.exe not found: $NodeExePath"
}
if (-not (Test-Path $specPath)) {
    throw "PyInstaller spec not found: $specPath"
}
$yonyouConfigPath = Join-Path $projectRoot "config\\yonyou_inventory_sync.yaml"
if (-not (Test-Path $yonyouConfigPath)) {
    Write-Warning "config\\yonyou_inventory_sync.yaml not found. Build will continue with embedded minimal seed data."
}

Remove-PathIfExists -Path $stageRoot
Remove-PathIfExists -Path $pyInstallerRoot
New-Item -ItemType Directory -Force -Path $stageRoot, $pyInstallerRoot, $runtimeScriptsStage, $installerOutputDir | Out-Null

$cloudflareTunnelConfig = Get-CloudflareTunnelConfig -ProjectPath $projectRoot
if (-not $CloudflareTunnelToken) {
    $CloudflareTunnelToken = [System.Environment]::GetEnvironmentVariable("POLARIS_CLOUDFLARE_TUNNEL_TOKEN", "Process")
}
if (-not $CloudflarePublicHostname) {
    $CloudflarePublicHostname = [System.Environment]::GetEnvironmentVariable("POLARIS_CLOUDFLARE_PUBLIC_HOSTNAME", "Process")
}
if (-not $CloudflareTunnelToken -and $cloudflareTunnelConfig -and $cloudflareTunnelConfig.enabled) {
    $CloudflareTunnelToken = [string]$cloudflareTunnelConfig.token
}
if (-not $CloudflarePublicHostname -and $cloudflareTunnelConfig -and $cloudflareTunnelConfig.enabled) {
    $CloudflarePublicHostname = [string]$cloudflareTunnelConfig.public_hostname
}
$enableCloudflareTunnel = -not [string]::IsNullOrWhiteSpace($CloudflareTunnelToken)
if ($enableCloudflareTunnel -and [string]::IsNullOrWhiteSpace($CloudflarePublicHostname)) {
    throw "Cloudflare public hostname is required when a tunnel token is provided."
}
if ($CloudflarePublicHostname -and -not $enableCloudflareTunnel) {
    Write-Warning "Cloudflare public hostname is set, but tunnel token is empty. Public tunnel packaging will be skipped."
}
$cloudflaredResolvedPath = $null
if ($enableCloudflareTunnel) {
    $cloudflaredResolvedPath = Resolve-CloudflaredExePath -ExplicitPath $CloudflaredExePath -DownloadDirectory $buildRoot
}

Push-Location $projectRoot
try {
    Write-Host "[1/9] Building frontend standalone bundle..."
    Push-Location (Join-Path $projectRoot "frontend")
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "frontend build failed"
        }
    } finally {
        Pop-Location
    }

    if ($afterSalesSourceResolved) {
        Write-Host "[2/9] Building after-sales workspace..."
        Push-Location $afterSalesSourceResolved
        try {
            if (-not (Test-Path (Join-Path $afterSalesSourceResolved "node_modules"))) {
                Write-Host "Installing after-sales workspace dependencies..."
                & npm.cmd ci
                if ($LASTEXITCODE -ne 0) {
                    throw "after-sales npm ci failed"
                }
            }

            Write-Host "Generating after-sales Prisma client..."
            $env:DATABASE_URL = "file:./prisma/dev.db"
            & npx.cmd prisma generate --schema prisma/schema.prisma
            if ($LASTEXITCODE -ne 0) {
                throw "after-sales prisma generate failed"
            }

            Push-Location (Join-Path $afterSalesSourceResolved "packages\\shared")
            try {
                & npm.cmd run build
                if ($LASTEXITCODE -ne 0) {
                    throw "after-sales shared build failed"
                }
            } finally {
                Pop-Location
            }

            Push-Location (Join-Path $afterSalesSourceResolved "apps\\api")
            try {
                & npm.cmd run build
                if ($LASTEXITCODE -ne 0) {
                    throw "after-sales api build failed"
                }
            } finally {
                Pop-Location
            }

            Push-Location (Join-Path $afterSalesSourceResolved "apps\\web")
            try {
                $env:VITE_API_BASE_URL = "/after-sales-api"
                & npm.cmd run build -- --base=/after-sales-app/
                if ($LASTEXITCODE -ne 0) {
                    throw "after-sales web build failed"
                }
            } finally {
                Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
                Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
                Pop-Location
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warning "After-sales source directory not found. Installer will be built without after-sales module."
    }

    Write-Host "[3/9] Copying frontend bundle..."
    Invoke-Robocopy -Source (Join-Path $projectRoot "frontend\\.next\\standalone") -Target $frontendStage
    Invoke-Robocopy -Source (Join-Path $projectRoot "frontend\\.next\\static") -Target (Join-Path $frontendStage ".next\\static")
    if (Test-Path (Join-Path $projectRoot "frontend\\public")) {
        Invoke-Robocopy -Source (Join-Path $projectRoot "frontend\\public") -Target (Join-Path $frontendStage "public")
    }

    if ($afterSalesSourceResolved) {
        Write-Host "[4/9] Copying after-sales workspace..."
        Copy-AfterSalesWorkspace -SourceRoot $afterSalesSourceResolved -TargetRoot $afterSalesStage
    }

    Write-Host "[5/9] Packaging backend with PyInstaller..."
    & py -m PyInstaller --noconfirm --clean `
        --distpath (Join-Path $pyInstallerRoot "dist") `
        --workpath (Join-Path $pyInstallerRoot "build") `
        $specPath
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller build failed"
    }
    Invoke-Robocopy -Source (Join-Path $pyInstallerRoot "dist\\PolarisBackend") -Target (Join-Path $backendStage "PolarisBackend")

    Write-Host "[6/9] Copying runtime dependencies..."
    New-Item -ItemType Directory -Force -Path (Join-Path $runtimeStage "node"), $runtimeCloudflaredStage | Out-Null
    Copy-Item -LiteralPath $NodeExePath -Destination (Join-Path $runtimeStage "node\\node.exe") -Force
    Invoke-Robocopy -Source $MySqlSourceDir -Target (Join-Path $runtimeStage "mysql") -ExtraArgs @("/XD", "data")
    if ($cloudflaredResolvedPath) {
        Copy-Item -LiteralPath $cloudflaredResolvedPath -Destination (Join-Path $runtimeCloudflaredStage "cloudflared.exe") -Force
    }

    Write-Host "[7/9] Copying app config and assets..."
    Invoke-Robocopy -Source (Join-Path $projectRoot "config") -Target (Join-Path $stageRoot "config")
    Invoke-Robocopy -Source (Join-Path $projectRoot "templates") -Target (Join-Path $stageRoot "templates")
    if (Test-Path (Join-Path $projectRoot "vendor")) {
        Invoke-Robocopy -Source (Join-Path $projectRoot "vendor") -Target (Join-Path $stageRoot "vendor")
    }

    Write-Host "[8/9] Preparing bootstrap manifest and historical data dump..."
    $prepareArgs = @(
        (Join-Path $projectRoot "scripts\\prepare_windows_bundle.py"),
        "--project-root", $projectRoot,
        "--output-dir", $stageRoot,
        "--mysql-bin-dir", (Join-Path $MySqlSourceDir "bin")
    )
    if ($afterSalesSourceResolved) {
        $prepareArgs += @("--after-sales-source-dir", $afterSalesSourceResolved)
    }
    if ($CloudflareTunnelToken) {
        $prepareArgs += @("--cloudflare-tunnel-token", $CloudflareTunnelToken)
    }
    if ($CloudflarePublicHostname) {
        $prepareArgs += @("--cloudflare-public-hostname", $CloudflarePublicHostname)
    }
    & py @prepareArgs
    if ($LASTEXITCODE -ne 0) {
        throw "prepare_windows_bundle.py failed"
    }

    Write-Host "[9/9] Copying Windows runtime scripts..."
    Get-ChildItem (Join-Path $projectRoot "deploy\\windows\\runtime") -File | Where-Object {
        $_.Extension -in @(".ps1", ".cmd")
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $runtimeScriptsStage $_.Name) -Force
    }

    $manifest = @{
        version = $PackageVersion
        built_at = (Get-Date).ToString("s")
    } | ConvertTo-Json -Depth 4
    Set-Content -Path (Join-Path $stageRoot "build-info.json") -Value $manifest -Encoding utf8

    if ($SkipInstaller) {
        Write-Host "[9/9] Skipping installer compilation."
        Write-Host "Stage ready: $stageRoot"
        return
    }

    Write-Host "[9/9] Compiling Inno Setup installer..."
    $iscc = Resolve-IsccPath
    if (-not $iscc) {
        throw "ISCC.exe not found. Install Inno Setup 6 or rerun with -SkipInstaller."
    }

    & $iscc "/DAppVersion=$PackageVersion" "/DSourceDir=$stageRoot" "/DOutputDir=$installerOutputDir" $issPath
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed"
    }

    Write-Host "Installer output: $installerOutputDir"
} finally {
    Pop-Location
}
