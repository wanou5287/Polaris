# Remote Access

This project now supports remote access through a Cloudflare Quick Tunnel.

## What it does

- Keeps the 北极星看板 on local `http://127.0.0.1:8888`
- Creates a temporary public HTTPS address on `trycloudflare.com`
- Uses the dashboard login page on `/financial/bi-dashboard`

## Prerequisites

- `main.py` is running and listening on port `8888`
- `.tmp\cloudflared.exe` exists

## Start remote access

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_remote_access.ps1
```

Batch wrapper:

```bat
scripts\start_remote_access.bat
```

## One-click start

This starts MySQL if needed, ensures the local dashboard is ready, and then starts the Cloudflare tunnel.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_bi_stack.ps1
```

Batch wrapper:

```bat
scripts\start_bi_stack.bat
```

If the public URL is not printed, check:

- `logs\cloudflared.err.log`
- `logs\cloudflared.out.log`

## Stop remote access

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop_remote_access.ps1
```

Batch wrapper:

```bat
scripts\stop_remote_access.bat
```

## One-click stop

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop_bi_stack.ps1
```

Batch wrapper:

```bat
scripts\stop_bi_stack.bat
```

## Notes

- The public URL changes every time the quick tunnel restarts.
- Quick Tunnel is good for personal remote access and temporary sharing.
- For a stable fixed domain, the next step is a named Cloudflare Tunnel with a Cloudflare account and domain.
- User accounts are managed in `config\bi_dashboard_users.local.yaml`.
