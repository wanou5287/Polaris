"""
模板同步测试

测试模板文件的下载、更新和同步逻辑
"""

import sys
import os
import asyncio
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.excel_export_service import ExcelExportService
from app.core.config import settings


async def test_template_sync():
    """测试模板同步逻辑"""
    print("🚀 开始测试模板同步逻辑...")
    
    # 1. 测试模板下载
    print("\n1️⃣ 测试从OSS下载模板...")
    excel_service = ExcelExportService()
    
    template_path = await excel_service._download_template_from_oss()
    if template_path:
        print(f"   ✅ 模板下载成功: {template_path}")
        print(f"   📁 文件大小: {os.path.getsize(template_path)} bytes")
        print(f"   📍 是否为本地路径: {os.path.exists(template_path)}")
    else:
        print("   ❌ 模板下载失败")
        return
    
    # 2. 检查本地模板文件
    print("\n2️⃣ 检查本地模板文件...")
    local_template = f"templates/{settings.TEMPLATE_FILENAME}"
    if os.path.exists(local_template):
        print(f"   ✅ 本地模板文件存在: {local_template}")
        print(f"   📁 文件大小: {os.path.getsize(local_template)} bytes")
        
        # 检查文件时间戳
        import time
        mtime = os.path.getmtime(local_template)
        print(f"   🕐 修改时间: {time.ctime(mtime)}")
    else:
        print(f"   ❌ 本地模板文件不存在: {local_template}")
    
    # 3. 测试模拟数据写入
    print("\n3️⃣ 测试模拟数据写入...")
    try:
        # 创建模拟数据
        test_data = [
            {
                "月份": "9月",
                "科目编码": "1001",
                "科目名称": "库存现金",
                "日期": "2025-09-01",
                "费用项目编码": "TEST01",
                "费用项目名称": "测试项目",
                "核算账簿": "0001",
                "凭证号": "记-1",
                "摘要": "测试数据",
                "借方本币": 100.00,
                "贷方本币": 0.00
            }
        ]
        
        # 测试导出（这会触发模板更新）
        result = await excel_service.export_with_consolidation(
            company_codes=["0001"], 
            period="2025-09", 
            output_dir="test_output"
        )
        
        if result:
            print(f"   ✅ 导出成功: {result}")
            print(f"   📁 输出文件大小: {os.path.getsize(result)} bytes")
        else:
            print("   ❌ 导出失败")
            
    except Exception as e:
        print(f"   ❌ 测试异常: {str(e)}")
    
    # 4. 检查模板文件是否被更新
    print("\n4️⃣ 检查模板文件更新...")
    if os.path.exists(local_template):
        new_mtime = os.path.getmtime(local_template)
        print(f"   🕐 更新后修改时间: {time.ctime(new_mtime)}")
        if new_mtime > mtime:
            print("   ✅ 模板文件已被更新")
        else:
            print("   ⚠️  模板文件未被更新")
    
    print("\n✅ 模板同步测试完成！")


async def main():
    """主函数"""
    await test_template_sync()


if __name__ == "__main__":
    asyncio.run(main())
