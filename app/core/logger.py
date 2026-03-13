# app/core/logger.py
import logging, sys
from pathlib import Path
from logging.handlers import TimedRotatingFileHandler

logger = logging.getLogger("finance")
logger.setLevel(logging.INFO)

# 控制台输出
console_handler = logging.StreamHandler(sys.stdout)
fmt = logging.Formatter("[%(asctime)s] %(levelname)s %(name)s - %(message)s")
console_handler.setFormatter(fmt)

"""按天滚动日志，保留7天，文件名按当天命名。
日志目录：logs/
文件名格式：app-YYYY-MM-DD.log
"""
log_dir = Path("logs")
log_dir.mkdir(parents=True, exist_ok=True)

# TimedRotatingFileHandler 会在午夜轮转，将当前文件重命名为 app-YYYY-MM-DD.log
file_handler = TimedRotatingFileHandler(
    filename=log_dir / "app.log",
    when="midnight",
    interval=1,
    backupCount=7,
    encoding="utf-8",
    utc=False
)
file_handler.suffix = "%Y-%m-%d"
file_handler.setFormatter(fmt)

if not logger.handlers:
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
