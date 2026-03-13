#!/usr/bin/env bash
set -euo pipefail

# 切到项目根目录
cd "$(dirname "$0")"

# 端口: 优先取环境变量 SERVER_PORT，否则默认 8888
PORT="${SERVER_PORT:-8888}"
echo "[start-dev] 使用端口: $PORT"

# 杀掉占用同端口的进程（优先 lsof，不可用则回退 pgrep）
PIDS=""
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
else
  # 回退：查 main.py 的 Python 进程（可能不只一个）
  PIDS="$(pgrep -f "python main.py" || true)"
fi

if [ -n "$PIDS" ]; then
  echo "[start-dev] 发现占用端口的进程: ${PIDS}, 执行 kill -9"
  # shellcheck disable=SC2086
  kill -9 $PIDS >/dev/null 2>&1 || true
fi

# 设置开发环境变量
export APP_ENV=dev

mkdir -p logs
echo "[start-dev] 启动开发服务: python main.py"
python main.py


