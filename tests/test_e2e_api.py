"""
端到端接口测试（简洁版）

GET /financial/generate-report?makeTimeStart=YYYY-MM-DD&makeTimeEnd=YYYY-MM-DD
触发：用友拉取 -> 清洗/入库 -> 模板生成Excel -> 加密ZIP -> 上传OSS -> 钉钉通知

运行：python tests/test_e2e_api.py
"""

import sys
import os
import requests

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


def main():
    base = settings.SERVER_BASE_URL
    url = f"{base}/financial/generate-report"
    params = {
        "makeTimeStart": "2025-09-01",
        "makeTimeEnd": "2025-09-30",
    }
    print("Request:", url, params)
    r = requests.get(url, params=params, timeout=60)
    print("Status:", r.status_code)
    try:
        print(r.json())
    except Exception:
        print(r.text)


if __name__ == "__main__":
    main()


