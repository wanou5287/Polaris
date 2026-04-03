from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import yaml


DEFAULT_PACKAGE_MYSQL_PORT = 13306
DEFAULT_BACKEND_PORT = 8888
DEFAULT_FRONTEND_PORT = 3000
DEFAULT_DB_URL = "mysql+pymysql://bi_client:Polaris123456@127.0.0.1:3306/bi_center?charset=utf8mb4"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare Windows installer bundle assets.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--mysql-bin-dir", required=True)
    parser.add_argument("--package-mysql-port", type=int, default=DEFAULT_PACKAGE_MYSQL_PORT)
    parser.add_argument("--backend-port", type=int, default=DEFAULT_BACKEND_PORT)
    parser.add_argument("--frontend-port", type=int, default=DEFAULT_FRONTEND_PORT)
    parser.add_argument("--cloudflare-tunnel-token", default="")
    parser.add_argument("--cloudflare-public-hostname", default="")
    parser.add_argument("--cloudflare-service-name", default="PolarisCloudflared")
    parser.add_argument("--after-sales-source-dir", default="")
    return parser.parse_args()


def parse_database_url(url: str) -> dict:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 3306,
        "database": parsed.path.lstrip("/"),
        "username": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "charset": query.get("charset", ["utf8mb4"])[0],
    }


def dump_database(mysql_bin_dir: Path, db: dict, dump_path: Path) -> None:
    mysqldump = mysql_bin_dir / "mysqldump.exe"
    if not mysqldump.exists():
        raise FileNotFoundError(f"mysqldump.exe not found: {mysqldump}")

    command = [
        str(mysqldump),
        f"--host={db['host']}",
        f"--port={db['port']}",
        f"--user={db['username']}",
        f"--password={db['password']}",
        "--default-character-set=utf8mb4",
        "--single-transaction",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        "--routines",
        "--events",
        "--triggers",
        db["database"],
    ]
    dump_path.parent.mkdir(parents=True, exist_ok=True)
    with dump_path.open("w", encoding="utf-8", newline="\n") as handle:
        subprocess.run(command, check=True, stdout=handle)


def write_fallback_seed(project_root: Path, dump_path: Path) -> None:
    fallback_seed = project_root / "deploy" / "windows" / "mysql" / "polaris_seed.sql"
    if not fallback_seed.exists():
        raise FileNotFoundError(f"Fallback seed SQL not found: {fallback_seed}")
    dump_path.parent.mkdir(parents=True, exist_ok=True)
    dump_path.write_text(fallback_seed.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")


def parse_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    mysql_bin_dir = Path(args.mysql_bin_dir).resolve()
    after_sales_source_dir = Path(args.after_sales_source_dir).resolve() if args.after_sales_source_dir else None

    config_path = project_root / "config" / "yonyou_inventory_sync.yaml"
    config = {}
    if config_path.exists():
        config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    yonyou = config.get("yonyou", {})
    database = config.get("database", {})

    db_url = str(database.get("url") or "").strip()
    if not db_url:
        db_url = DEFAULT_DB_URL

    db = parse_database_url(db_url)
    if "mysql" not in db["scheme"]:
        raise ValueError(f"Only MySQL URLs are supported for bundle export, got: {db['scheme']}")

    seed_dir = output_dir / "seed"
    runtime_dir = output_dir / "runtime"
    dump_path = seed_dir / f"{db['database']}.sql"
    try:
        dump_database(mysql_bin_dir, db, dump_path)
    except Exception:
        write_fallback_seed(project_root, dump_path)

    manifest = {
        "app_name": "Polaris",
        "backend": {
            "host": "0.0.0.0",
            "port": args.backend_port,
        },
        "frontend": {
            "host": "0.0.0.0",
            "port": args.frontend_port,
        },
        "mysql": {
            "host": "127.0.0.1",
            "port": args.package_mysql_port,
            "database": db["database"],
            "username": db["username"],
            "password": db["password"],
            "charset": db["charset"],
            "dump_file": f"seed\\{db['database']}.sql",
        },
        "yonyou": {
            "base_url": str(yonyou.get("base_url") or ""),
            "app_key": str(yonyou.get("app_key") or ""),
            "app_secret": str(yonyou.get("app_secret") or ""),
        },
        "auth": {
            "username": "bi_admin",
            "password": "ChangeMe123!",
        },
        "cloudflare_tunnel": {
            "enabled": bool(args.cloudflare_tunnel_token.strip()),
            "service_name": args.cloudflare_service_name.strip() or "PolarisCloudflared",
            "token": args.cloudflare_tunnel_token.strip(),
            "public_hostname": args.cloudflare_public_hostname.strip(),
        },
        "after_sales": {
            "enabled": False,
        },
    }

    if after_sales_source_dir and after_sales_source_dir.exists():
        after_sales_env = parse_env_file(after_sales_source_dir / ".env")
        manifest["after_sales"] = {
            "enabled": True,
            "root_dir": "after-sales",
            "public_entry_path": "/after-sales-entry",
            "public_app_path": "/after-sales-app/",
            "api_proxy_path": "/after-sales-api",
            "api_port": 3210,
            "database_file": "after-sales/prisma/dev.db",
            "web_dist_dir": "after-sales/apps/web/dist",
            "api_entry": "after-sales/apps/api/dist/apps/api/src/server.js",
            "env": {
                "port": "3210",
                "activation_mode": after_sales_env.get("ACTIVATION_MODE", "mock"),
                "activation_mock_file": after_sales_env.get(
                    "ACTIVATION_MOCK_FILE", "./mock/activation-data.json"
                ),
                "activation_real_base_url": after_sales_env.get("ACTIVATION_REAL_BASE_URL", ""),
                "activation_real_path": after_sales_env.get(
                    "ACTIVATION_REAL_PATH", "/wo/tt/main/activation/info"
                ),
                "activation_real_timeout_ms": after_sales_env.get(
                    "ACTIVATION_REAL_TIMEOUT_MS", "5000"
                ),
                "activation_real_auth_type": after_sales_env.get("ACTIVATION_REAL_AUTH_TYPE", ""),
                "activation_real_token": after_sales_env.get("ACTIVATION_REAL_TOKEN", ""),
            },
        }

    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "bootstrap-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
