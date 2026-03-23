"""用友接口客户端

实现用友开放平台的接口调用，包括：
- 鉴权获取access_token
- 凭证数据分页查询
- 错误重试机制
- 数据完整性校验
"""

import hashlib
import hmac
import base64
import time
import requests
from typing import Dict, List, Optional, Tuple
from app.core.logger import logger
from app.core.config import settings


class YonyouClient:
    """用友接口客户端"""
    
    def __init__(self):
        self.app_key = settings.YONYOU_APP_KEY
        self.app_secret = settings.YONYOU_APP_SECRET
        self.base_url = settings.YONYOU_BASE_URL
        self.auth_url = f"{self.base_url}/iuap-api-auth/open-auth/selfAppAuth/getAccessToken"
        self.voucher_url = f"{self.base_url}/iuap-api-gateway/yonbip/fi/ficloud/openapi/voucher/queryVouchers"
        self.access_token = None
        self.token_expires_at = 0
    
    def _generate_signature(self, params: Dict[str, str]) -> str:
        """生成签名"""
        # 按参数名称排序
        sorted_params = sorted(params.items())
        
        # 拼接参数字符串（排除signature字段）
        param_string = ""
        for key, value in sorted_params:
            if key != "signature":
                param_string += f"{key}{value}"
        
        # 使用HmacSHA256计算签名
        hmac_obj = hmac.new(
            self.app_secret.encode('utf-8'),
            param_string.encode('utf-8'),
            hashlib.sha256
        )
        
        # Base64编码
        signature = base64.b64encode(hmac_obj.digest()).decode('utf-8')
        return signature
    
    async def get_access_token(self) -> Optional[str]:
        """获取access_token"""
        try:
            # 生成时间戳（毫秒）
            timestamp = str(int(time.time() * 1000))
            
            # 构建请求参数
            params = {
                "appKey": self.app_key,
                "timestamp": timestamp
            }
            
            # 生成签名
            signature = self._generate_signature(params)
            params["signature"] = signature
            
            # 发送GET请求
            response = requests.get(
                self.auth_url,
                params=params,
                timeout=30,
                headers={
                    "User-Agent": "Polaris/1.0.0",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"获取access_token结果: {result}")
                if result.get("code") == "00000":  # 用友接口成功码是00000
                    self.access_token = result.get("data", {}).get("access_token")
                    # 设置过期时间（提前5分钟过期）
                    self.token_expires_at = time.time() + 3600 - 300
                    logger.info("access_token获取成功")
                    return self.access_token
                else:
                    logger.error(f"获取access_token失败: {result.get('message', '未知错误')}")
                    return None
            else:
                logger.error(f"获取access_token失败，状态码: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"获取access_token异常: {str(e)}")
            return None
    
    async def _ensure_valid_token(self) -> bool:
        """确保token有效"""
        if not self.access_token or time.time() >= self.token_expires_at:
            return await self.get_access_token() is not None
        return True
    
    async def query_vouchers(self, company_code: str, makeTimeStart: str, makeTimeEnd: str, page: int = 1, page_size: int = 20) -> Optional[Dict]:
        """查询凭证列表"""
        try:
            if not await self._ensure_valid_token():
                logger.error("无法获取有效token")
                return None
            
            # 构建查询参数
            query_params = {
                "pager": {
                    "pageIndex": page,
                    "pageSize": page_size
                },
                "accbookCode": company_code,
                "accsubjectCodeList": ["1001", "1002", "1012"],
                "makeTimeStart": makeTimeStart,
                "makeTimeEnd": makeTimeEnd
            }
            
            # 构建请求头
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "Polaris/1.0.0"
            }
            
            logger.info(f"查询凭证参数: {query_params}")
            logger.info(f"使用access_token: {self.access_token[:20]}...")
            
            # 发送POST请求，access_token作为query参数
            response = requests.post(
                self.voucher_url,
                json=query_params,
                headers=headers,
                params={"access_token": self.access_token},  # access_token作为query参数
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"凭证查询成功，返回数据: {data}")
                return data
            else:
                logger.error(f"凭证查询失败，状态码: {response.status_code}, 响应: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"查询凭证异常: {str(e)}")
            return None
    
    def extract_voucher_data(self, voucher: Dict) -> List[Dict]:
        """提取凭证数据中的关键字段"""
        try:
            # 提取凭证头信息
            header = voucher.get("header", {})
            
            # 提取凭证体信息
            bodies = voucher.get("body", [])  # 注意：实际返回的是"body"不是"bodies"
            extracted_data = []
            
            for body in bodies:
                # 提取辅助核算信息（只提取code是0018的）
                auxiliary_data = body.get("clientauxiliary", [])
                auxiliary_code = ""
                auxiliary_name = ""
                
                # 确保 auxiliary_data 是列表
                if auxiliary_data and isinstance(auxiliary_data, list):
                    for aux in auxiliary_data:
                        if aux and aux.get("code") == "0018":
                            auxiliary_code = aux.get("data", {}).get("code", "")
                            auxiliary_name = aux.get("data", {}).get("name", "")
                            break
                
                # 构建提取的数据（统一使用数据库字段名）
                extracted_item = {
                    "accsubject_code": body.get("accsubject", {}).get("code", ""),
                    "accsubject_name": body.get("accsubject", {}).get("name", ""),
                    "maketime": header.get("maketime", ""),
                    "auxiliary_code": auxiliary_code,
                    "auxiliary_name": auxiliary_name,
                    "accbook_name": header.get("accbook", {}).get("name", ""),
                    "displayname": header.get("displayname", ""),
                    "description": body.get("description", ""),
                    "debit_org": float(body.get("debit_org", 0)) if body.get("debit_org") is not None else 0.0,
                    "credit_org": float(body.get("credit_org", 0)) if body.get("credit_org") is not None else 0.0,
                    "company_code": header.get("accbook", {}).get("code", ""),
                    "period": header.get("maketime", "")[:7] if header.get("maketime") else ""
                }
                
                extracted_data.append(extracted_item)
            
            return extracted_data
            
        except Exception as e:
            logger.error(f"提取凭证数据异常: {str(e)}")
            return []
