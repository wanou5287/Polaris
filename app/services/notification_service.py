"""通知服务

实现钉钉Webhook通知，包括：
- 错误通知
- 文件下载通知
"""

import json
import requests
import time
import hmac
import hashlib
import base64
import urllib.parse
from typing import Dict, List, Optional
from app.core.logger import logger
from app.core.config import settings


class NotificationService:
    """通知服务（仅保留错误通知与文件下载通知）"""
    
    def __init__(self):
        self.dingtalk_webhook_url = getattr(settings, 'DINGTALK_WEBHOOK_URL', None)
        self.dingtalk_secret = getattr(settings, 'DINGTALK_SECRET', None)
    
    def _generate_dingtalk_sign(self, secret: str, timestamp: str) -> str:
        """生成钉钉机器人签名"""
        if not secret:
            return ""
        
        string_to_sign = f"{timestamp}\n{secret}"
        hmac_code = hmac.new(
            secret.encode('utf-8'),
            string_to_sign.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()
        sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
        return sign
    
    async def send_error_notification(self, company_code: str, error_message: str) -> bool:
        """发送错误通知"""
        if not self.dingtalk_webhook_url:
            logger.warning("钉钉Webhook URL未配置，跳过错误通知")
            return False
        
        try:
            message = {
                "msgtype": "text",
                "text": {
                    "content": f"🚨 数据拉取失败通知\n\n"
                              f"公司编码: {company_code}\n"
                              f"错误信息: {error_message}\n"
                              f"时间: {self._get_current_time()}\n\n"
                              f"请检查接口状态并重新调用。"
                }
            }
            
            return await self._send_dingtalk_message(message)
            
        except Exception as e:
            logger.error(f"发送错误通知失败: {str(e)}")
            return False
    
    
    async def send_file_download_notification(self, period: str, download_url: str, password: str, file_size: int) -> bool:
        """发送文件下载通知"""
        if not self.dingtalk_webhook_url:
            logger.warning("钉钉Webhook URL未配置，跳过文件下载通知")
            return False
        
        try:
            # 转换文件大小为KB
            file_size_kb = round(file_size / 1024, 2)
            
            # 生成可点击的链接（如果是本地文件，转换为绝对路径）
            if download_url.startswith('file://'):
                clickable_url = download_url
            else:
                clickable_url = download_url
            
            message = {
                "msgtype": "text",
                "text": {
                    "content": f"📁 财务报表生成完成\n\n"
                              f"期间: {period}\n"
                              f"文件大小: {file_size_kb} KB\n"
                              f"下载链接: {clickable_url}\n"
                              f"解压密码: {password}\n"
                              f"时间: {self._get_current_time()}\n\n"
                              f"请及时下载并妥善保管密码。"
                }
            }
            
            return await self._send_dingtalk_message(message)
            
        except Exception as e:
            logger.error(f"发送文件下载通知失败: {str(e)}")
            return False
    
    
    async def _send_dingtalk_message(self, message: Dict) -> bool:
        """发送钉钉消息"""
        try:
            # 如果没有配置SECRET，直接使用原始URL
            if not self.dingtalk_secret:
                logger.warning("钉钉SECRET未配置，尝试不使用签名发送消息")
                webhook_url = self.dingtalk_webhook_url
            else:
                # 生成签名
                timestamp = str(round(time.time() * 1000))
                sign = self._generate_dingtalk_sign(self.dingtalk_secret, timestamp)
                
                # 构建带签名的URL
                separator = "&" if "?" in self.dingtalk_webhook_url else "?"
                webhook_url = f"{self.dingtalk_webhook_url}{separator}timestamp={timestamp}&sign={sign}"
            
            headers = {
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                webhook_url,
                json=message,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("errcode") == 0:
                    logger.info("钉钉消息发送成功")
                    return True
                else:
                    logger.error(f"钉钉消息发送失败: {result.get('errmsg')}")
                    # 如果是签名问题，记录警告但不中断流程
                    if "签名" in str(result.get('errmsg', '')):
                        logger.warning("钉钉机器人签名验证失败，请检查SECRET配置")
                    return False
            else:
                logger.error(f"钉钉消息发送失败，状态码: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"发送钉钉消息异常: {str(e)}")
            return False
    
    def _get_current_time(self) -> str:
        """获取当前时间字符串"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # test_webhook 移除，减少非核心接口
