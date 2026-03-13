"""
模板上传下载测试

测试模板文件的上传、下载和报表生成流程
"""

import sys
import os
import asyncio
import requests
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.services.oss_service import OSSService
from app.services.excel_export_service import ExcelExportService


async def test_template_upload_download():
    """测试模板上传下载流程"""
    print("🚀 开始测试模板上传下载流程...")
    
    # 1. 测试OSS服务
    print("\n1️⃣ 测试OSS服务...")
    oss_service = OSSService()
    
    # 检查模板文件是否存在
    template_oss_key = settings.TEMPLATE_OSS_KEY
    exists = oss_service.file_exists(template_oss_key)
    print(f"   模板文件是否存在: {exists}")
    
    if exists:
        # 生成下载链接
        download_url = oss_service.generate_signed_url(template_oss_key, expires_in=3600)
        print(f"   下载链接: {download_url}")
    
    # 2. 测试Excel导出服务
    print("\n2️⃣ 测试Excel导出服务...")
    excel_service = ExcelExportService()
    
    # 测试模板下载
    template_path = await excel_service._download_template_from_oss()
    if template_path:
        print(f"   模板下载成功: {template_path}")
        print(f"   文件大小: {os.path.getsize(template_path)} bytes")
        
        # 清理临时文件
        os.unlink(template_path)
        print("   临时文件已清理")
    else:
        print("   ❌ 模板下载失败")
    
    # 3. 测试API接口
    print("\n3️⃣ 测试API接口...")
    base_url = settings.SERVER_BASE_URL
    
    # 测试模板信息接口
    try:
        response = requests.get(f"{base_url}/api/template/info")
        if response.status_code == 200:
            data = response.json()
            print(f"   模板信息: {data}")
        else:
            print(f"   ❌ 获取模板信息失败: {response.status_code}")
    except Exception as e:
        print(f"   ❌ API测试失败: {str(e)}")
    
    print("\n✅ 模板上传下载流程测试完成！")


def test_template_upload_api():
    """测试模板上传API（需要手动提供文件）"""
    print("\n📤 测试模板上传API...")
    print("   请手动测试以下API接口：")
    print(f"   POST {settings.SERVER_BASE_URL}/api/template/upload")
    print("   参数: file (Excel文件)")
    print(f"   GET  {settings.SERVER_BASE_URL}/api/template/info")
    print(f"   DELETE {settings.SERVER_BASE_URL}/api/template/delete")


async def main():
    """主函数"""
    await test_template_upload_download()
    test_template_upload_api()


if __name__ == "__main__":
    asyncio.run(main())
