"""报表生成服务

实现Excel报表生成、加密压缩、OSS上传等功能，包括：
- Excel模板生成
- 数据填充与格式化
- 文件加密压缩
- OSS上传与链接生成
- 密码管理
"""

import os
import tempfile
import secrets
import string
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import pandas as pd
import pyzipper
from app.core.logger import logger
from app.core.config import settings
from app.services.oss_service import OSSService
from app.services.notification_service import NotificationService


class ReportGenerateService:
    """报表生成服务"""
    
    def __init__(self):
        self.oss_service = OSSService()
        self.notification_service = NotificationService()
        self.template_path = getattr(settings, 'TEMPLATE_PATH', 'templates/report_template.xlsx')
    
    async def generate_monthly_report(self, period: str, company_data: Dict) -> Dict:
        """生成月度报表"""
        logger.info(f"开始生成月度报表，期间: {period}")
        
        try:
            # 1. 生成Excel文件
            excel_path = await self._generate_excel_report(period, company_data)
            if not excel_path:
                return {
                    "success": False,
                    "error": "Excel文件生成失败"
                }
            
            # 2. 加密压缩
            zip_path, password = await self._encrypt_and_compress(excel_path, period)
            if not zip_path:
                return {
                    "success": False,
                    "error": "文件加密失败"
                }
            
            # 3. 上传到OSS
            download_url = await self._upload_to_oss(zip_path, period)
            if not download_url:
                return {
                    "success": False,
                    "error": "文件上传失败"
                }
            
            # 4. 获取文件信息
            file_size = os.path.getsize(zip_path)
            
            # 5. 发送通知（一次性链接：消费后删除OSS对象）
            one_time_url = None
            try:
                from app.core.one_time_link import create_one_time_token
                from app.core.config import settings
                # 提取对象键用于删除
                object_key = download_url.split('.aliyuncs.com/')[1].split('?')[0]
                def cleanup():
                    try:
                        # 使用现有客户端删除对象
                        if self.oss_service.client:
                            self.oss_service.client.delete_object(object_key)
                    except Exception:
                        pass
                token = create_one_time_token(download_url, on_consume=cleanup)
                one_time_url = f"{settings.SERVER_BASE_URL}/financial/one-time-download/{token}"
            except Exception:
                pass

            await self.notification_service.send_file_download_notification(
                period, one_time_url or download_url, password, file_size
            )
            
            # 6. 清理临时文件（不清理ZIP文件，因为它是最终输出）
            self._cleanup_temp_files([excel_path])
            
            logger.info(f"月度报表生成完成，期间: {period}, 文件大小: {file_size} 字节")
            
            return {
                "success": True,
                "period": period,
                "zip_path": zip_path,
                "download_url": download_url,
                "password": password,
                "file_size": file_size,
                "generated_at": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"生成月度报表异常: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _generate_excel_report(self, period: str, company_data: Dict) -> Optional[str]:
        """生成Excel报表"""
        try:
            # 创建临时文件
            temp_dir = tempfile.mkdtemp()
            excel_path = os.path.join(temp_dir, f"月度财务报表_{period}.xlsx")
            
            # 从数据库获取所有公司的数据
            from app.services.excel_export_service import ExcelExportService
            excel_service = ExcelExportService()
            
            # 获取公司代码列表
            company_codes = company_data.get("company_codes", [])
            if not company_codes:
                from app.core.config import settings
                company_codes = settings.COMPANY_ACCOUNT_CODES.split(',')
            
            # 使用ExcelExportService生成包含所有公司数据的Excel文件
            excel_file = await excel_service.export_with_consolidation(company_codes, period, temp_dir)
            
            if excel_file and os.path.exists(excel_file):
                # 将生成的文件移动到目标位置
                import shutil
                shutil.move(excel_file, excel_path)
                logger.info(f"Excel报表生成完成: {excel_path}")
                return excel_path
            else:
                logger.error("Excel文件生成失败")
                return None
            
        except Exception as e:
            logger.error(f"生成Excel报表异常: {str(e)}")
            return None
    
    async def _encrypt_and_compress(self, excel_path: str, period: str) -> Tuple[Optional[str], str]:
        """加密压缩文件"""
        try:
            # 生成强密码
            password = self._generate_strong_password()
            
            # 使用配置的ZIP目录
            from app.core.config import settings
            os.makedirs(settings.ZIP_DIR, exist_ok=True)
            zip_path = os.path.join(settings.ZIP_DIR, f"月度财务报表_{period}.zip")
            
            # 使用pyzipper创建加密ZIP
            with pyzipper.AESZipFile(
                zip_path, 'w', 
                compression=pyzipper.ZIP_LZMA, 
                encryption=pyzipper.WZ_AES
            ) as zf:
                # 设置密码（使用AES-256加密）
                zf.setpassword(password.encode('utf-8'))
                # 写入文件
                zf.write(excel_path, os.path.basename(excel_path))
            
            # 验证加密是否正确 - 尝试实际读取文件内容
            try:
                with pyzipper.AESZipFile(zip_path, 'r') as zf:
                    zf.setpassword(password.encode('utf-8'))
                    # 尝试读取文件内容来验证密码
                    file_list = zf.namelist()
                    if not file_list:
                        raise Exception("密码验证失败：无法读取文件列表")
                    
                    # 尝试读取第一个文件的内容来验证密码
                    with zf.open(file_list[0]) as f:
                        content = f.read()
                        if not content:
                            raise Exception("密码验证失败：无法读取文件内容")
                    
                    logger.info(f"密码验证成功，文件列表: {file_list}")
            except Exception as e:
                logger.error(f"密码验证失败: {str(e)}")
                raise Exception(f"加密文件密码验证失败: {str(e)}")
            
            logger.info(f"文件加密完成: {zip_path}")
            return zip_path, password
            
        except Exception as e:
            logger.error(f"文件加密异常: {str(e)}")
            return None, ""
    
    def _generate_strong_password(self, length: int = 16) -> str:
        """生成强密码"""
        # 确保包含所有字符类型
        lowercase = string.ascii_lowercase
        uppercase = string.ascii_uppercase
        digits = string.digits
        special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
        
        # 每种字符至少包含一个
        password = [
            secrets.choice(lowercase),
            secrets.choice(uppercase),
            secrets.choice(digits),
            secrets.choice(special_chars)
        ]
        
        # 填充剩余长度
        all_chars = lowercase + uppercase + digits + special_chars
        password.extend(secrets.choice(all_chars) for _ in range(length - 4))
        
        # 打乱密码
        password_list = list(password)
        secrets.SystemRandom().shuffle(password_list)
        
        return ''.join(password_list)
    
    async def _upload_to_oss(self, zip_path: str, period: str) -> Optional[str]:
        """上传文件到OSS"""
        try:
            # 生成OSS文件名（去掉时间戳）
            filename = f"月度财务报表_{period}.zip"
            
            # 上传文件
            download_url = await self.oss_service.upload_file(zip_path, filename)
            
            if download_url:
                logger.info(f"文件上传成功: {download_url}")
                return download_url
            else:
                logger.error("文件上传失败")
                return None
                
        except Exception as e:
            logger.error(f"上传文件异常: {str(e)}")
            return None
    
    def _cleanup_temp_files(self, file_paths: List[str]):
        """清理临时文件"""
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.debug(f"清理临时文件: {file_path}")
            except Exception as e:
                logger.warning(f"清理临时文件失败: {file_path}, 错误: {str(e)}")
    
    async def _generate_company_excel(self, company_code: str, period: str, company_data: Dict) -> Optional[str]:
        """生成公司Excel报表"""
        try:
            temp_dir = tempfile.mkdtemp()
            excel_path = os.path.join(temp_dir, f"{company_code}_财务报表_{period}.xlsx")
            
            with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
                # 原始数据
                if 'raw_data' in company_data:
                    df_raw = pd.DataFrame(company_data['raw_data'])
                    df_raw.to_excel(writer, sheet_name='原始数据', index=False)
                
                # 处理数据
                if 'processed_data' in company_data:
                    df_processed = pd.DataFrame(company_data['processed_data'])
                    df_processed.to_excel(writer, sheet_name='处理数据', index=False)
                
                # 抵消数据
                if 'offset_data' in company_data:
                    df_offset = pd.DataFrame(company_data['offset_data'])
                    df_offset.to_excel(writer, sheet_name='抵消数据', index=False)
            
            logger.info(f"公司Excel报表生成完成: {excel_path}")
            return excel_path
            
        except Exception as e:
            logger.error(f"生成公司Excel报表异常: {str(e)}")
            return None
