#!/usr/bin/env bash

set -euo pipefail

# 固定生产环境
APP_ENV="prod"
VENV_DIR="${VENV_DIR:-.venv}"
LOG_DIR="logs"
OUT_LOG="$LOG_DIR/python.out"
mkdir -p "$LOG_DIR"

echo "[start-prod] APP_ENV=$APP_ENV"

# 注入环境变量：OS 环境优先，不覆盖已有
safe_source_env() {
  local file="$1"
  if [ -f "$file" ]; then
    while IFS= read -r raw || [ -n "$raw" ]; do
      line="${raw%%#*}"; line="${line%%$'\r'}"; line="${line%%$'\n'}"; line="${line## }"; line="${line%% }"
      [ -z "$line" ] && continue
      case "$line" in *=*) : ;; *) continue ;; esac
      key="${line%%=*}"; val="${line#*=}"
      key="${key## }"; key="${key%% }"; val="${val## }"; val="${val%% }"
      if [[ "$val" =~ ^\".*\"$ ]] || [[ "$val" =~ ^\'.*\'$ ]]; then
        val="${val:1:${#val}-2}"
      fi
      if [ -z "${!key-}" ]; then export "$key"="$val"; fi
    done < "$file"
    echo "[start-prod] loaded env file: $file"
  fi
}

export APP_ENV
safe_source_env ".env"
safe_source_env ".env.${APP_ENV}"

# 端口：优先 SERVER_PORT/PORT，默认 8888
PORT="${SERVER_PORT:-${PORT:-8888}}"
echo "[start-prod] target: python main.py on :$PORT"

# 杀掉占用端口
if lsof -i :"$PORT" -t >/dev/null 2>&1; then
  echo "[start-prod] port $PORT in use, killing"
  lsof -i :"$PORT" -t | xargs -r kill -9 || true
fi

# venv
if [ -f "$VENV_DIR/bin/activate" ]; then
  echo "[start-prod] activating venv: $VENV_DIR"; source "$VENV_DIR/bin/activate"
fi

# 配置摘要
echo "[start-prod] SERVER_BASE_URL=${SERVER_BASE_URL:-}"
echo "[start-prod] DB=${DB_USERNAME:-}:***@${DB_HOST:-}:${DB_PORT:-}/${DB_NAME:-}"
echo "[start-prod] OSS_BUCKET=${OSS_BUCKET_NAME:-} PREFIX=${OSS_PREFIX:-}"

# 后台启动
echo "[start-prod] starting (nohup)"
nohup python main.py > "$OUT_LOG" 2>&1 &
sleep 1
PID=$(pgrep -f "python main.py" || true)
echo "[start-prod] started pid(s): ${PID:-none}"
echo "[start-prod] logs: $OUT_LOG"

exit 0


