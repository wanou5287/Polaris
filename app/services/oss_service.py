"""OSS存储服务

实现阿里云OSS文件上传功能，包括：
- OSS客户端初始化
- 文件上传
- 下载链接生成
- 文件管理
"""

import os
from typing import Optional
from app.core.logger import logger
from app.core.config import settings


class OSSService:
    """OSS存储服务"""
    
    def __init__(self):
        self.bucket_name = getattr(settings, 'OSS_BUCKET_NAME', 'finvispy-reports')
        self.region = getattr(settings, 'OSS_REGION', 'oss-cn-hangzhou')
        self.access_key_id = getattr(settings, 'OSS_ACCESS_KEY_ID', '')
        self.access_key_secret = getattr(settings, 'OSS_ACCESS_KEY_SECRET', '')
        # endpoint 保持地域域名，例如 https://oss-cn-hangzhou.aliyuncs.com
        # endpoint：例如 https://oss-cn-hangzhou.aliyuncs.com
        self.endpoint = getattr(settings, 'OSS_ENDPOINT', f'https://{self.region}.aliyuncs.com')
        # 统一的目录前缀（规范化为以/结尾）
        raw_prefix = getattr(settings, 'OSS_PREFIX', 'financial-reports/')
        if not raw_prefix.endswith('/'):
            raw_prefix = raw_prefix.rstrip('/') + '/'
        self.prefix = raw_prefix
        # public-read 直链支持
        self.public_read = getattr(settings, 'OSS_PUBLIC_READ', False)
        self.custom_domain = getattr(settings, 'OSS_CUSTOM_DOMAIN', '').rstrip('/')
        
        # 初始化OSS客户端
        self.client = self._init_oss_client()
    
    def _init_oss_client(self):
        """初始化OSS客户端"""
        try:
            # 检查是否配置了OSS参数
            if not self.access_key_id or not self.access_key_secret:
                logger.warning("OSS配置不完整，使用本地存储模拟")
                return None
            
            # 导入OSS SDK
            try:
                import oss2
                auth = oss2.Auth(self.access_key_id, self.access_key_secret)
                bucket = oss2.Bucket(auth, self.endpoint, self.bucket_name)
                logger.info("OSS客户端初始化成功")
                return bucket
            except ImportError:
                logger.warning("OSS SDK未安装，使用本地存储模拟")
                return None
                
        except Exception as e:
            logger.error(f"初始化OSS客户端失败: {str(e)}")
            return None
    
    def head_object(self, object_key: str) -> Optional[dict]:
        """获取对象元信息（ETag, Size, Last-Modified）"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                path = os.path.join(storage_dir, object_key)
                if not os.path.exists(path):
                    return None
                stat = os.stat(path)
                import hashlib
                with open(path, 'rb') as f:
                    md5 = hashlib.md5(f.read()).hexdigest()
                return {
                    'etag': md5,
                    'size': stat.st_size,
                    'last_modified': stat.st_mtime,
                }
            result = self.client.get_object_meta(object_key)
            return {
                'etag': getattr(result, 'etag', None),
                'size': int(result.headers.get('Content-Length', 0)),
                'last_modified': result.headers.get('Last-Modified')
            }
        except Exception:
            return None

    def copy_object(self, src_key: str, dst_key: str) -> bool:
        """在OSS端复制对象到新键（避免下载/上传，强制规范化文件名）"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                src = os.path.join(storage_dir, src_key)
                dst = os.path.join(storage_dir, dst_key)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                import shutil
                shutil.copy2(src, dst)
                return True
            # 远端复制：注意目标bucket与源bucket相同
            import oss2
            res = self.client.copy_object(self.bucket_name, src_key, dst_key)
            return res.status in (200, 204)
        except Exception as e:
            logger.error(f"复制对象失败: {str(e)}")
            return False

    def generate_presigned_put_url(self, object_key: str, expires_in: int = 600) -> Optional[str]:
        """生成预签名PUT直传URL（客户端直传到OSS，服务端不经手大文件）"""
        try:
            if not self.client:
                # 本地存储模式不生成直传URL
                return None
            return self.client.sign_url('PUT', object_key, expires_in)
        except Exception as e:
            logger.error(f"生成预签名PUT链接异常: {str(e)}")
            return None
    async def upload_file(self, local_file_path: str, remote_filename: str) -> Optional[str]:
        """上传文件到OSS"""
        try:
            if not os.path.exists(local_file_path):
                logger.error(f"本地文件不存在: {local_file_path}")
                return None
            
            # 如果OSS客户端未初始化，使用本地存储模拟
            if not self.client:
                return await self._upload_to_local_storage(local_file_path, remote_filename)
            
            # 上传到OSS
            # 对于模板文件，保持原始路径结构；否则走前缀规则
            if remote_filename.startswith('templates/'):
                object_key = remote_filename
                sanitized_name = os.path.basename(remote_filename)
            else:
                sanitized_name = os.path.basename(remote_filename)
                if sanitized_name.startswith('financial-reports_'):
                    sanitized_name = sanitized_name[len('financial-reports_'):]
                object_key = f"{self.prefix}{sanitized_name}"
            # Content-Disposition 需 ASCII；使用 RFC 5987 写法支持中文文件名
            from urllib.parse import quote
            if remote_filename.startswith('templates/'):
                encoded_name = quote(os.path.basename(remote_filename))
            else:
                encoded_name = quote(sanitized_name)
            headers = {
                'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_name}"
            }
            with open(local_file_path, 'rb') as f:
                # 注意：oss2 的 put_object 支持 headers 作为可选参数
                result = self.client.put_object(object_key, f, headers=headers)
            
            if result.status == 200:
                # 生成下载链接
                download_url = self._generate_download_url(object_key)
                logger.info(f"文件上传成功: {download_url}")
                return download_url
            else:
                logger.error(f"文件上传失败，状态码: {result.status}")
                return None
                
        except Exception as e:
            logger.error(f"上传文件异常: {str(e)}")
            return None
    
    async def _upload_to_local_storage(self, local_file_path: str, remote_filename: str) -> str:
        """上传到本地存储（模拟OSS）"""
        try:
            # 使用ZIP目录作为存储目录
            from app.core.config import settings
            storage_dir = settings.ZIP_DIR
            os.makedirs(storage_dir, exist_ok=True)
            
            # 检查文件是否已经在正确位置
            remote_path = os.path.join(storage_dir, remote_filename)
            if os.path.abspath(local_file_path) == os.path.abspath(remote_path):
                # 文件已经在正确位置，不需要复制
                logger.info(f"文件已在正确位置: {remote_path}")
            else:
                # 复制文件到存储目录
                import shutil
                shutil.copy2(local_file_path, remote_path)
            
            # 生成HTTP下载URL
            # 从期间提取文件名，构建下载链接
            period = remote_filename.replace("月度财务报表_", "").replace(".zip", "")
            download_url = f"{settings.SERVER_BASE_URL}/financial/download/{period}"
            logger.info(f"文件保存到本地存储，HTTP下载链接: {download_url}")
            return download_url
            
        except Exception as e:
            logger.error(f"本地存储上传异常: {str(e)}")
            return None
    
    def _generate_download_url(self, remote_filename: str) -> str:
        """生成下载链接"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                local_path = os.path.join(storage_dir, remote_filename)
                return f"file://{os.path.abspath(local_path)}"
            
            # 如配置为 public-read，返回不带签名的直链
            if self.public_read:
                if self.custom_domain:
                    return f"{self.custom_domain}/{remote_filename}"
                # 标准公网直链：<bucket>.oss-<region>.aliyuncs.com/<key>
                return f"https://{self.bucket_name}.{self.region}.aliyuncs.com/{remote_filename}"
            # 否则返回签名链接
            expire_seconds = 7 * 24 * 3600
            return self.client.sign_url('GET', remote_filename, expire_seconds)
            
        except Exception as e:
            logger.error(f"生成下载链接异常: {str(e)}")
            return None
    
    def generate_signed_url(self, object_key: str, expires_in: int = 3600) -> str:
        """生成带签名的下载链接"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                local_path = os.path.join(storage_dir, object_key)
                return f"file://{os.path.abspath(local_path)}"
            
            # 生成签名链接
            return self.client.sign_url('GET', object_key, expires_in)
            
        except Exception as e:
            logger.error(f"生成签名链接异常: {str(e)}")
            return None
    
    def file_exists(self, object_key: str) -> bool:
        """检查文件是否存在"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                local_path = os.path.join(storage_dir, object_key)
                return os.path.exists(local_path)
            
            # 检查OSS文件是否存在
            return self.client.object_exists(object_key)
            
        except Exception as e:
            logger.error(f"检查文件存在性异常: {str(e)}")
            return False
    
    def delete_file(self, object_key: str) -> bool:
        """删除文件"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                local_path = os.path.join(storage_dir, object_key)
                if os.path.exists(local_path):
                    os.remove(local_path)
                    return True
                return False
            
            # 删除OSS文件
            result = self.client.delete_object(object_key)
            return result.status == 204
            
        except Exception as e:
            logger.error(f"删除文件异常: {str(e)}")
            return False
    
    def download_file(self, object_key: str, local_path: str) -> bool:
        """下载文件到本地"""
        try:
            if not self.client:
                # 本地存储模式
                storage_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './storage')
                source_path = os.path.join(storage_dir, object_key)
                if os.path.exists(source_path):
                    import shutil
                    shutil.copy2(source_path, local_path)
                    return True
                return False
            
            # 从OSS下载文件
            result = self.client.get_object_to_file(object_key, local_path)
            return result.status == 200
            
        except Exception as e:
            logger.error(f"下载文件异常: {str(e)}")
            return False
    
    