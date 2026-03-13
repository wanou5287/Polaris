"""一次性下载链接注册表

提供一次性令牌注册、消费与失效的内存实现。
注意：进程内存实现，重启后令牌丢失；如需持久化可改为DB。
"""

import uuid
import threading
from typing import Optional, Dict, Callable


_lock = threading.Lock()
_token_to_url: Dict[str, str] = {}
_token_cleanup: Dict[str, Callable[[], None]] = {}


def create_one_time_token(download_url: str, on_consume: Optional[Callable[[], None]] = None) -> str:
    """为给定下载URL创建一次性token并注册，可附带消费回调（如删除OSS对象）。"""
    token = uuid.uuid4().hex
    with _lock:
        _token_to_url[token] = download_url
        if on_consume:
            _token_cleanup[token] = on_consume
    return token


def consume_token(token: str) -> Optional[str]:
    """消费一次性token，返回URL并立即失效。"""
    with _lock:
        url = _token_to_url.pop(token, None)
        cleanup = _token_cleanup.pop(token, None)
    # 执行清理回调（例如删除OSS文件）
    if cleanup:
        try:
            cleanup()
        except Exception:
            pass
    return url


