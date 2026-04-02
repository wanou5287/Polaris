# Polaris Windows Installer

This packaging flow produces a Windows installer that can be deployed on a single PC and used locally, across the LAN, and optionally through a Cloudflare Named Tunnel.

## What the installer includes

- Backend: PyInstaller-packaged `PolarisBackend.exe`
- Frontend: Next.js standalone output plus `node.exe`
- Database runtime: local MySQL binaries
- Seed data: SQL dump exported from the local MySQL source at build time
- Runtime scripts: initialize, launch, stop, and cleanup
- Optional public access runtime: bundled `cloudflared.exe`
- Installer: Inno Setup generated `Polaris-Setup-*.exe`

## Key locations

- Build script: `deploy/windows/build_windows_installer.ps1`
- Runtime scripts: `deploy/windows/runtime/`
- Installer definition: `deploy/windows/installer/PolarisInstaller.iss`
- Optional Cloudflare local config: `deploy/windows/cloudflare_tunnel.local.json`
- Cloudflare example config: `deploy/windows/cloudflare_tunnel.example.json`

## Build prerequisites

The build machine should provide:

- Windows
- Python via `py`
- `pyinstaller`
- Node.js / npm
- a working local MySQL installation
- `config/yonyou_inventory_sync.yaml`
- Inno Setup 6 if you want to output the `.exe` installer directly

Default dependency locations:

- MySQL: `C:\Program Files\MySQL\MySQL Server 8.4`
- Node: `C:\Program Files\nodejs\node.exe`

## Build commands

Build a full installer:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\build_windows_installer.ps1
```

Prepare staging only and skip the installer compilation step:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\build_windows_installer.ps1 -SkipInstaller
```

Build with a Cloudflare Named Tunnel baked in:

```powershell
$env:POLARIS_CLOUDFLARE_TUNNEL_TOKEN = "<your tunnel token>"
$env:POLARIS_CLOUDFLARE_PUBLIC_HOSTNAME = "polaris.example.com"
powershell -ExecutionPolicy Bypass -File .\deploy\windows\build_windows_installer.ps1
```

You can also place the token and hostname in `deploy/windows/cloudflare_tunnel.local.json` and keep that file out of Git.

## Build outputs

- Staging bundle: `build/windows-installer/stage/Polaris`
- Installers: `build/windows-installer/installer`

## Install-time behavior

On first install the bundle will:

1. initialize the local MySQL data directory
2. import the seed SQL dump
3. generate runtime environment files
4. start MySQL, backend, and frontend
5. optionally register the Cloudflare tunnel service if a tunnel token is bundled
6. open the local login page

## Access after install

Local:

- `http://127.0.0.1:3000/login`

LAN:

- `http://<deployment-pc-lan-ip>:3000/login`

When a Cloudflare Named Tunnel is bundled and the hostname is already configured in Cloudflare:

- `https://<public-hostname>/login`

The installer writes the resolved URLs to:

- `%LOCALAPPDATA%\PolarisData\runtime\access-info.txt`
- `%LOCALAPPDATA%\PolarisData\runtime\public-url.txt` (only when public access is enabled)

Default login:

- Username: `bi_admin`
- Password: `ChangeMe123!`

## Upgrade-safe layout

Program directory:

- `%LOCALAPPDATA%\Programs\Polaris`

Data directory:

- `%LOCALAPPDATA%\PolarisData`

The following stay in the data directory and are preserved across upgrades:

- MySQL history data
- exported files and runtime artifacts
- logs
- generated runtime configuration
- Cloudflare tunnel runtime state and connector binary

The installer does not re-import seed data on upgrade.

## Ports

- Frontend: `3000`
- Backend: `8888`
- Bundled MySQL: `13306`

## Cloudflare Named Tunnel notes

- `cloudflared.exe` is copied into the persistent data directory during install
- the tunnel runs as a dedicated Windows service named `PolarisCloudflared`
- upgrades do not remove or recreate the tunnel service when the token is unchanged
- the tunnel token is stored in the data directory and not committed to the repository

If you ever need to remove the public tunnel from a machine completely, use:

- Start menu entry: `Remove Polaris Cloudflare Tunnel`
- or script: `%LOCALAPPDATA%\Programs\Polaris\runtime\scripts\remove_cloudflare_tunnel.cmd`

## Routine maintenance

- Launch: Start menu `Polaris`
- Stop: Start menu `Stop Polaris`
- Remove public tunnel: Start menu `Remove Polaris Cloudflare Tunnel`
- Logs directory: `%LOCALAPPDATA%\PolarisData\logs\`
