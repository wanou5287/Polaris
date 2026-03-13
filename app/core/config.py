import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus
import socket


def _detect_lan_ip() -> str:
    """尽力探测本机局域网IP，失败回退127.0.0.1"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


def _prime_env_from_files() -> None:
    """优先使用进程环境变量；若缺失则从 .env.{env} 补齐；再从 .env 补齐。

    优先级（高→低）：OS 环境变量 > .env.{env} > .env
    """
    env = os.getenv("APP_ENV", "dev").lower()
    project_root = Path(__file__).resolve().parents[2]
    base_file = project_root / ".env"
    env_file = project_root / f".env.{env}"

    def load_env_file_to_dict(file_path: Path) -> dict:
        values = {}
        if not file_path.exists():
            return values
        try:
            for raw in file_path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                # 去掉可选的引号包裹
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                values[key] = val
        except Exception:
            # 静默失败，保持健壮
            pass
        return values

    # 先加载 env 专属，再加载 base，用于回退；但只在 os.environ 缺失时才注入
    env_map = load_env_file_to_dict(env_file)
    base_map = load_env_file_to_dict(base_file)

    # 先用 env_map 补齐缺失
    for k, v in env_map.items():
        if k not in os.environ:
            os.environ[k] = v

    # 再用 base_map 补齐剩余缺失
    for k, v in base_map.items():
        if k not in os.environ:
            os.environ[k] = v


# 在 Settings 加载前先补齐环境变量
_prime_env_from_files()


class Settings(BaseSettings):
    # 运行环境：dev/test/prod（从环境变量读取，默认 dev）
    APP_ENV: str = os.getenv("APP_ENV", "dev")
    
    # 数据库配置（全部从环境变量提供；端口提供安全回退）
    DB_HOST: str = ""
    DB_PORT: int = int(os.getenv("DB_PORT", "3306"))
    DB_NAME: str = ""
    DB_USERNAME: str = ""
    DB_PASSWORD: str = ""
    DB_URL: str = ""  # 动态生成
    
    # 存储后端：local / oss
    STORAGE_BACKEND: str = "oss"
    # 本地"伪 OSS"根目录
    LOCAL_STORAGE_DIR: str = str(Path("output").absolute())

    # OSS 配置（统一由环境变量提供）
    OSS_BUCKET_NAME: str = ""
    OSS_REGION: str = ""
    OSS_ENDPOINT: str = ""
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_PREFIX: str = ""
    OSS_PUBLIC_READ: bool = False
    OSS_CUSTOM_DOMAIN: str = ""

    # 模板文件配置（没放在环境变量中，对于使用函数会有问题）
    TEMPLATE_OSS_KEY: str = "templates/report_template.xlsx"
    TEMPLATE_FILENAME: str = "report_template.xlsx"
    TEMPLATE_PATH: str = str(Path(f"templates/{TEMPLATE_FILENAME}").absolute())
    OUTPUT_DIR: str = str(Path("output").absolute())
    EXCEL_DIR: str = str(Path("output/excel").absolute())
    ZIP_DIR: str = str(Path("output/zip").absolute())

    # ZIP 口令长度
    ZIP_PASSWORD_LENGTH: int = 10
    
    # 用友接口配置（由环境变量提供）
    YONYOU_APP_KEY: str = ""
    YONYOU_APP_SECRET: str = ""
    YONYOU_BASE_URL: str = ""
    
    # 公司账蒲/科目代码（建议从 .env 提供，若缺失可在此给默认）
    COMPANY_ACCOUNT_CODES: str = os.getenv("COMPANY_ACCOUNT_CODES", "")
    SUBJECT_CODES: str = os.getenv("SUBJECT_CODES", "")
    
    # 钉钉通知配置（由环境变量提供）
    DINGTALK_WEBHOOK_URL: str = ""
    DINGTALK_SECRET: str = ""
    
    # 服务器配置
    SERVER_HOST: str = _detect_lan_ip()
    SERVER_PORT: int = 8888
    # 统一使用一个 SERVER_BASE_URL，由各环境文件提供；dev 若未提供则自动回退
    SERVER_BASE_URL: str = ""

    # 不再依赖 pydantic 自动读取 env_file，已在模块顶部用 _prime_env_from_files 补齐
    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore"
    )

@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    env = (s.APP_ENV or "dev").lower()
    
    # SERVER_BASE_URL：各环境文件提供；若 dev 且未提供，则回退到本机IP:端口
    if not s.SERVER_BASE_URL and env == "dev":
        s.SERVER_BASE_URL = f"http://{s.SERVER_HOST}:{s.SERVER_PORT}"
    
    # 统一重算 DB_URL（支持 .env 覆盖）
    s.DB_URL = (
        f"mysql+pymysql://{s.DB_USERNAME}:{quote_plus(s.DB_PASSWORD)}@{s.DB_HOST}:{s.DB_PORT}/{s.DB_NAME}"
    )
    
    return s

settings = get_settings()
