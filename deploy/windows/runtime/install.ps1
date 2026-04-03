param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Get-DataRoot {
    param([string]$AppPath)

    $explicit = [System.Environment]::GetEnvironmentVariable("POLARIS_DATA_ROOT", "Process")
    if (-not $explicit) {
        $explicit = [System.Environment]::GetEnvironmentVariable("POLARIS_DATA_ROOT", "User")
    }
    if (-not $explicit) {
        $explicit = Join-Path $env:LOCALAPPDATA "PolarisData"
    }
    return $explicit
}

function Get-LanIp {
    try {
        $candidate = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPv4Address -and
                $_.IPv4DefaultGateway -and
                $_.NetAdapter -and
                $_.NetAdapter.Status -eq "Up"
            } |
            ForEach-Object { $_.IPv4Address.IPAddress } |
            Where-Object {
                $_ -and
                $_ -ne "127.0.0.1" -and
                -not $_.StartsWith("169.254.") -and
                -not $_.StartsWith("198.18.") -and
                -not $_.StartsWith("198.19.")
            } |
            Select-Object -First 1
        if ($candidate) {
            return $candidate
        }
    } catch {
    }

    try {
        $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -ne "127.0.0.1" -and
                -not $_.IPAddress.StartsWith("169.254.") -and
                -not $_.IPAddress.StartsWith("198.18.") -and
                -not $_.IPAddress.StartsWith("198.19.")
            } |
            Sort-Object SkipAsSource, InterfaceMetric, AddressState |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($candidate) {
            return $candidate
        }
    } catch {
    }

    return "127.0.0.1"
}

function Wait-Port {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds = 30
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

function Start-MySqlProcess {
    param(
        [string]$MySqlDExe,
        [string]$MyIniPath,
        [string]$PidFile,
        [string[]]$ExtraArguments = @()
    )

    $arguments = @("--defaults-file=$MyIniPath", "--console") + $ExtraArguments
    $proc = Start-Process -FilePath $MySqlDExe -ArgumentList $arguments -WindowStyle Hidden -PassThru
    Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii
    return $proc
}

function Invoke-CmdChecked {
    param([string]$Command)

    cmd.exe /c $Command | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

function Ensure-FirewallRule {
    param(
        [string]$DisplayName,
        [int]$Port
    )

    try {
        $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
        if ($existing) {
            return
        }
        New-NetFirewallRule -DisplayName $DisplayName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
        return
    } catch {
    }

    try {
        & netsh advfirewall firewall add rule name="$DisplayName" dir=in action=allow protocol=TCP localport=$Port profile=private | Out-Null
    } catch {
    }
}

function Test-DirectoryHasContent {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $false
    }

    return [bool](Get-ChildItem -Path $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Copy-DirectoryContents {
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

function Copy-FileIfDifferent {
    param(
        [string]$Source,
        [string]$Target
    )

    if (-not (Test-Path $Source)) {
        return $false
    }

    $copyNeeded = $true
    if (Test-Path $Target) {
        $sourceHash = (Get-FileHash -Algorithm SHA256 -Path $Source).Hash
        $targetHash = (Get-FileHash -Algorithm SHA256 -Path $Target).Hash
        $copyNeeded = $sourceHash -ne $targetHash
    }

    if ($copyNeeded) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Target -Force
    }

    return $copyNeeded
}

function Get-StringSha256 {
    param([string]$Value)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        $hash = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Wait-ServiceDeleted {
    param(
        [string]$Name,
        [int]$TimeoutSeconds = 15
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if (-not $svc) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Ensure-ServiceStarted {
    param([string]$Name)

    try {
        Start-Service -Name $Name -ErrorAction SilentlyContinue
    } catch {
    }
}

function Configure-CloudflareTunnel {
    param(
        [pscustomobject]$TunnelConfig,
        [string]$CloudflaredExe,
        [string]$StatePath,
        [string]$LogsPath
    )

    if (-not $TunnelConfig.enabled -or -not $TunnelConfig.token) {
        return
    }
    if (-not (Test-Path $CloudflaredExe)) {
        throw "cloudflared.exe not found: $CloudflaredExe"
    }

    $serviceName = [string]$TunnelConfig.service_name
    if (-not $serviceName) {
        $serviceName = "PolarisCloudflared"
    }

    $tokenPath = Join-Path $StatePath "cloudflare-tunnel.token"
    $tokenHashPath = Join-Path $StatePath "cloudflare-tunnel.token.sha256"
    $statusPath = Join-Path $StatePath "cloudflare-tunnel.json"
    $publicUrlPath = Join-Path $StatePath "public-url.txt"
    $logPath = Join-Path $LogsPath "cloudflared.log"
    $newTokenHash = Get-StringSha256 -Value ([string]$TunnelConfig.token)

    $existingHash = ""
    if (Test-Path $tokenHashPath) {
        $existingHash = (Get-Content $tokenHashPath -Raw).Trim()
    }

    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    $serviceNeedsRecreate = -not $service -or ($existingHash -ne $newTokenHash)

    New-Item -ItemType Directory -Force -Path $StatePath, $LogsPath | Out-Null
    Set-Content -Path $tokenPath -Value ([string]$TunnelConfig.token) -Encoding ascii
    Set-Content -Path $tokenHashPath -Value $newTokenHash -Encoding ascii

    if ($serviceNeedsRecreate -and $service) {
        try {
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
        } catch {
        }
        & sc.exe delete $serviceName | Out-Null
        if (-not (Wait-ServiceDeleted -Name $serviceName -TimeoutSeconds 20)) {
            throw "Cloudflare tunnel service $serviceName could not be removed cleanly."
        }
    }

    if ($serviceNeedsRecreate) {
        $binPath = "`"$CloudflaredExe`" tunnel --no-autoupdate --logfile `"$logPath`" --loglevel info run --token-file `"$tokenPath`""
        & sc.exe create $serviceName binPath= $binPath start= auto DisplayName= "`"$serviceName`"" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create Cloudflare tunnel service $serviceName."
        }
        & sc.exe description $serviceName "Polaris public connector powered by Cloudflare Tunnel." | Out-Null
        & sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
        & sc.exe failureflag $serviceName 1 | Out-Null
    }

    Ensure-ServiceStarted -Name $serviceName

    $publicHostname = ([string]$TunnelConfig.public_hostname).Trim()
    $publicUrl = ""
    if ($publicHostname) {
        $publicUrl = "https://$publicHostname/login"
        Set-Content -Path $publicUrlPath -Value $publicUrl -Encoding utf8
    }

    $status = @{
        enabled = $true
        service_name = $serviceName
        public_hostname = $publicHostname
        public_url = $publicUrl
        token_hash = $newTokenHash
        updated_at = (Get-Date).ToString("s")
    } | ConvertTo-Json -Depth 4
    Set-Content -Path $statusPath -Value $status -Encoding utf8
}

function Migrate-LegacyDirectory {
    param(
        [string]$LegacyPath,
        [string]$TargetPath
    )

    if (-not (Test-DirectoryHasContent -Path $LegacyPath)) {
        return
    }
    if (Test-DirectoryHasContent -Path $TargetPath) {
        return
    }
    Copy-DirectoryContents -Source $LegacyPath -Target $TargetPath
}

$appPath = (Resolve-Path $AppDir).Path
$runtimeDir = Join-Path $appPath "runtime"
$manifestPath = Join-Path $runtimeDir "bootstrap-manifest.json"
$dataRoot = Get-DataRoot -AppPath $appPath
$stateDir = Join-Path $dataRoot "runtime"
$markerPath = Join-Path $stateDir ".bundle_initialized"
$mysqlPidPath = Join-Path $stateDir "mysql.pid"
$envPath = Join-Path $stateDir "app.env"
$myIniPath = Join-Path $stateDir "mysql.my.ini"
$configDir = Join-Path $dataRoot "config"
$logsDir = Join-Path $dataRoot "logs"
$outputDir = Join-Path $dataRoot "output"
$excelDir = Join-Path $outputDir "excel"
$zipDir = Join-Path $outputDir "zip"
$storageDir = Join-Path $outputDir "storage"
$mysqlDataDir = Join-Path $dataRoot "mysql-data"
$afterSalesDataDir = Join-Path $dataRoot "after-sales"
$afterSalesPrismaDir = Join-Path $afterSalesDataDir "prisma"
$cloudflaredDataDir = Join-Path $stateDir "cloudflared"
$cloudflaredDataExe = Join-Path $cloudflaredDataDir "cloudflared.exe"
$mysqlBaseDir = Join-Path $runtimeDir "mysql"
$cloudflaredBundleExe = Join-Path $runtimeDir "cloudflared\\cloudflared.exe"
$mysqlBinDir = Join-Path $mysqlBaseDir "bin"
$mysqldExe = Join-Path $mysqlBinDir "mysqld.exe"
$mysqlExe = Join-Path $mysqlBinDir "mysql.exe"
$legacyRuntimeDir = Join-Path $appPath "runtime"
$legacyConfigDir = Join-Path $appPath "config"
$legacyLogsDir = Join-Path $appPath "logs"
$legacyOutputDir = Join-Path $appPath "output"
$legacyMySqlDataDir = Join-Path $legacyRuntimeDir "mysql-data"
$afterSalesEnabled = $false
$afterSalesBundleRoot = ""
$afterSalesBundleDbPath = ""
$afterSalesAppEnvPath = ""
$afterSalesDistEnvPath = ""
$afterSalesApiUrl = ""
$afterSalesLocalEntry = ""
$afterSalesLanEntry = ""
$afterSalesPublicEntry = ""

if (-not (Test-Path $manifestPath)) {
    throw "bootstrap-manifest.json not found: $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$lanIp = Get-LanIp
$frontendBaseUrl = "http://${lanIp}:$($manifest.frontend.port)"
$backendBaseUrl = "http://${lanIp}:$($manifest.backend.port)"
if ($manifest.after_sales -and $manifest.after_sales.enabled) {
    $afterSalesEnabled = $true
    $afterSalesBundleRoot = Join-Path $appPath $manifest.after_sales.root_dir
    $afterSalesBundleDbPath = Join-Path $appPath $manifest.after_sales.database_file
    $afterSalesAppEnvPath = Join-Path $afterSalesBundleRoot ".env"
    $afterSalesDistEnvPath = Join-Path $afterSalesBundleRoot "apps\api\dist\.env"
    $afterSalesApiUrl = "http://127.0.0.1:$($manifest.after_sales.api_port)"
    $afterSalesLocalEntry = "http://127.0.0.1:$($manifest.frontend.port)$($manifest.after_sales.public_entry_path)"
    $afterSalesLanEntry = "http://${lanIp}:$($manifest.frontend.port)$($manifest.after_sales.public_entry_path)"
    if ($manifest.cloudflare_tunnel.public_hostname) {
        $afterSalesPublicEntry = "https://$($manifest.cloudflare_tunnel.public_hostname)$($manifest.after_sales.public_entry_path)"
    }
}

New-Item -ItemType Directory -Force -Path $stateDir, $configDir, $logsDir, $outputDir, $excelDir, $zipDir, $storageDir, $mysqlDataDir, $afterSalesDataDir, $afterSalesPrismaDir | Out-Null
Copy-FileIfDifferent -Source $cloudflaredBundleExe -Target $cloudflaredDataExe | Out-Null

Migrate-LegacyDirectory -LegacyPath $legacyMySqlDataDir -TargetPath $mysqlDataDir
Migrate-LegacyDirectory -LegacyPath $legacyOutputDir -TargetPath $outputDir
Migrate-LegacyDirectory -LegacyPath $legacyLogsDir -TargetPath $logsDir
Migrate-LegacyDirectory -LegacyPath $legacyConfigDir -TargetPath $configDir

$mysqlBaseDirIni = $mysqlBaseDir -replace "\\", "/"
$mysqlDataDirIni = $mysqlDataDir -replace "\\", "/"
$logsDirIni = $logsDir -replace "\\", "/"

$myIni = @"
[mysqld]
basedir=$mysqlBaseDirIni
datadir=$mysqlDataDirIni
port=$($manifest.mysql.port)
bind-address=127.0.0.1
character-set-server=utf8mb4
collation-server=utf8mb4_general_ci
default-time-zone=+08:00
skip-name-resolve
max_connections=100
sql_mode=STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
log-error=$logsDirIni/mysql-error.log

[client]
port=$($manifest.mysql.port)
default-character-set=utf8mb4
"@
Set-Content -Path $myIniPath -Value $myIni -Encoding ascii

if (-not (Test-Path (Join-Path $mysqlDataDir "mysql"))) {
    & $mysqldExe "--defaults-file=$myIniPath" "--initialize-insecure" | Out-Null

    $dbName = $manifest.mysql.database
    $dbUser = $manifest.mysql.username
    $dbPassword = $manifest.mysql.password
    $bootstrapSql = @"
CREATE DATABASE IF NOT EXISTS $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '$dbUser'@'127.0.0.1' IDENTIFIED BY '$dbPassword';
CREATE USER IF NOT EXISTS '$dbUser'@'localhost' IDENTIFIED BY '$dbPassword';
GRANT ALL PRIVILEGES ON $dbName.* TO '$dbUser'@'127.0.0.1';
GRANT ALL PRIVILEGES ON $dbName.* TO '$dbUser'@'localhost';
FLUSH PRIVILEGES;
"@
    $bootstrapSqlPath = Join-Path $stateDir "bootstrap.sql"
    Set-Content -Path $bootstrapSqlPath -Value $bootstrapSql -Encoding ascii
    Start-MySqlProcess -MySqlDExe $mysqldExe -MyIniPath $myIniPath -PidFile $mysqlPidPath -ExtraArguments @("--init-file=$bootstrapSqlPath") | Out-Null
    if (-not (Wait-Port -HostName "127.0.0.1" -Port ([int]$manifest.mysql.port) -TimeoutSeconds 45)) {
        throw "MySQL failed to start on port $($manifest.mysql.port)"
    }

    $bootstrapReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        & $mysqlExe "--protocol=TCP" "--host=127.0.0.1" "--port=$($manifest.mysql.port)" "--user=$dbUser" "--password=$dbPassword" "--default-character-set=utf8mb4" "-e" "SELECT 1;" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $bootstrapReady = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $bootstrapReady) {
        throw "MySQL bootstrap SQL did not finish creating the application user"
    }
    Remove-Item -LiteralPath $bootstrapSqlPath -Force -ErrorAction SilentlyContinue

    $dumpPath = Join-Path $appPath $manifest.mysql.dump_file
    if (Test-Path $dumpPath) {
        $cmd = "`"$mysqlExe`" --host=127.0.0.1 --port=$($manifest.mysql.port) --user=$($manifest.mysql.username) --password=$($manifest.mysql.password) --default-character-set=utf8mb4 $($manifest.mysql.database) < `"$dumpPath`""
        Invoke-CmdChecked -Command $cmd
    }
}

if ($afterSalesEnabled) {
    $afterSalesDbTarget = Join-Path $afterSalesPrismaDir "dev.db"
    if (-not (Test-Path $afterSalesDbTarget) -and (Test-Path $afterSalesBundleDbPath)) {
        Copy-Item -LiteralPath $afterSalesBundleDbPath -Destination $afterSalesDbTarget -Force
    }

    $afterSalesDbUri = ("file:" + ($afterSalesDbTarget -replace "\\", "/"))
    $afterSalesMockFile = [string]$manifest.after_sales.env.activation_mock_file
    if (-not $afterSalesMockFile) {
        $afterSalesMockFile = "../../../mock/activation-data.json"
    }
    $afterSalesActivationMode = [string]$manifest.after_sales.env.activation_mode
    if (-not $afterSalesActivationMode) {
        $afterSalesActivationMode = "real"
    }
    $afterSalesEnvContent = @"
DATABASE_URL=$afterSalesDbUri
PORT=$($manifest.after_sales.api_port)
ACTIVATION_MODE=$afterSalesActivationMode
ACTIVATION_MOCK_FILE=$afterSalesMockFile
ACTIVATION_REAL_BASE_URL=$($manifest.after_sales.env.activation_real_base_url)
ACTIVATION_REAL_PATH=$($manifest.after_sales.env.activation_real_path)
ACTIVATION_REAL_TIMEOUT_MS=$($manifest.after_sales.env.activation_real_timeout_ms)
ACTIVATION_REAL_AUTH_TYPE=$($manifest.after_sales.env.activation_real_auth_type)
ACTIVATION_REAL_TOKEN=$($manifest.after_sales.env.activation_real_token)
VITE_API_BASE_URL=/after-sales-api
"@
    Set-Content -Path $afterSalesAppEnvPath -Value $afterSalesEnvContent -Encoding utf8
    Set-Content -Path $afterSalesDistEnvPath -Value $afterSalesEnvContent -Encoding utf8
}

$envContent = @"
APP_ENV=prod
POLARIS_APP_HOME=$appPath
POLARIS_DATA_ROOT=$dataRoot
POLARIS_PUBLIC_HOST=$lanIp
POLARIS_PUBLIC_URL=$frontendBaseUrl
DB_HOST=127.0.0.1
DB_PORT=$($manifest.mysql.port)
DB_NAME=$($manifest.mysql.database)
DB_USERNAME=$($manifest.mysql.username)
DB_PASSWORD=$($manifest.mysql.password)
DB_URL=mysql+pymysql://$($manifest.mysql.username):$($manifest.mysql.password)@127.0.0.1:$($manifest.mysql.port)/$($manifest.mysql.database)?charset=utf8mb4
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=$storageDir
OUTPUT_DIR=$outputDir
EXCEL_DIR=$excelDir
ZIP_DIR=$zipDir
SERVER_HOST=0.0.0.0
SERVER_PORT=$($manifest.backend.port)
SERVER_BASE_URL=$backendBaseUrl
YONYOU_BASE_URL=$($manifest.yonyou.base_url)
YONYOU_APP_KEY=$($manifest.yonyou.app_key)
YONYOU_APP_SECRET=$($manifest.yonyou.app_secret)
BI_DASH_USERNAME=$($manifest.auth.username)
BI_DASH_PASSWORD=$($manifest.auth.password)
BI_DASH_TEST_USERNAME=test
BI_DASH_TEST_PASSWORD=test123
POLARIS_PUBLIC_DOMAIN=$($manifest.cloudflare_tunnel.public_hostname)
POLARIS_AFTER_SALES_ENABLED=$afterSalesEnabled
POLARIS_AFTER_SALES_WEB_DIST=$(if ($afterSalesEnabled) { Join-Path $afterSalesBundleRoot "apps\\web\\dist" } else { "" })
POLARIS_AFTER_SALES_API_BASE_URL=$(if ($afterSalesEnabled) { $afterSalesApiUrl } else { "" })
DATABASE_URL=$(if ($afterSalesEnabled) { "file:" + ((Join-Path $afterSalesPrismaDir "dev.db") -replace "\\", "/") } else { "" })
PORT=$(if ($afterSalesEnabled) { $manifest.after_sales.api_port } else { "" })
ACTIVATION_MODE=$(if ($afterSalesEnabled) { $afterSalesActivationMode } else { "" })
ACTIVATION_MOCK_FILE=$(if ($afterSalesEnabled) { $afterSalesMockFile } else { "" })
ACTIVATION_REAL_BASE_URL=$(if ($afterSalesEnabled) { $manifest.after_sales.env.activation_real_base_url } else { "" })
ACTIVATION_REAL_PATH=$(if ($afterSalesEnabled) { $manifest.after_sales.env.activation_real_path } else { "" })
ACTIVATION_REAL_TIMEOUT_MS=$(if ($afterSalesEnabled) { $manifest.after_sales.env.activation_real_timeout_ms } else { "" })
ACTIVATION_REAL_AUTH_TYPE=$(if ($afterSalesEnabled) { $manifest.after_sales.env.activation_real_auth_type } else { "" })
ACTIVATION_REAL_TOKEN=$(if ($afterSalesEnabled) { $manifest.after_sales.env.activation_real_token } else { "" })
"@
Set-Content -Path $envPath -Value $envContent -Encoding utf8
Set-Content -Path (Join-Path $appPath ".env.prod") -Value $envContent -Encoding utf8

Configure-CloudflareTunnel -TunnelConfig $manifest.cloudflare_tunnel -CloudflaredExe $cloudflaredDataExe -StatePath $stateDir -LogsPath $logsDir

$accessInfo = @"
Polaris local access:
http://127.0.0.1:$($manifest.frontend.port)/login

Polaris LAN access:
$frontendBaseUrl/login

Polaris public access:
$(
    if ($manifest.cloudflare_tunnel.public_hostname) {
        "https://$($manifest.cloudflare_tunnel.public_hostname)/login"
    } else {
        "Not configured"
    }
)

Backend API / docs:
$backendBaseUrl
$backendBaseUrl/financial/docs

Data root:
$dataRoot

After-sales entry (local):
$(if ($afterSalesEnabled) { $afterSalesLocalEntry } else { "Not enabled" })

After-sales entry (LAN):
$(if ($afterSalesEnabled) { $afterSalesLanEntry } else { "Not enabled" })

After-sales entry (public):
$(if ($afterSalesPublicEntry) { $afterSalesPublicEntry } elseif ($afterSalesEnabled) { "Not configured" } else { "Not enabled" })
"@
Set-Content -Path (Join-Path $stateDir "access-info.txt") -Value $accessInfo -Encoding utf8

$usersConfigPath = Join-Path $configDir "bi_dashboard_users.local.yaml"
if (-not (Test-Path $usersConfigPath)) {
    $usersYaml = @"
settings:
  session_secret: polaris-local-session-secret

users:
  - username: $($manifest.auth.username)
    password: $($manifest.auth.password)
  - username: test
    password: test123
"@
    Set-Content -Path $usersConfigPath -Value $usersYaml -Encoding utf8
} else {
    $usersYaml = Get-Content -Path $usersConfigPath -Raw
    if ($usersYaml -notmatch '(?m)^\s*-\s+username:\s*test\s*$' -and $usersYaml -notmatch '(?m)^\s*username:\s*test\s*$') {
        Add-Content -Path $usersConfigPath -Value @"
  - username: test
    password: test123
"@ -Encoding utf8
    }
}

Set-Content -Path $markerPath -Value (Get-Date -Format s) -Encoding ascii

Ensure-FirewallRule -DisplayName "Polaris Frontend 3000" -Port ([int]$manifest.frontend.port)
Ensure-FirewallRule -DisplayName "Polaris Backend 8888" -Port ([int]$manifest.backend.port)

Write-Output "Polaris bundle initialized at $appPath"
Write-Output "Polaris data root: $dataRoot"
