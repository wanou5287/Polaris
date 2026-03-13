"""
用友凭证拉取测试

测试用友API拉取凭证数据，并将原始数据保存为JSON格式到临时目录供查看

运行：python tests/test_yonyou_voucher_fetch.py
"""

import sys
import os
import json
import asyncio
from datetime import datetime
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.yonyou_client import YonyouClient
from app.core.config import settings


async def test_voucher_fetch():
    """测试用友凭证拉取"""
    print("🚀 开始测试用友凭证拉取...")
    
    # 创建临时目录
    temp_dir = Path("temp_voucher_data")
    temp_dir.mkdir(exist_ok=True)
    print(f"📁 临时数据目录: {temp_dir.absolute()}")
    
    # 测试参数
    company_codes = settings.COMPANY_ACCOUNT_CODES.split(',')  # 测试所有公司
    makeTimeStart = "2025-09-01"  # 扩大时间范围
    makeTimeEnd = "2025-09-30"
    
    print(f"📋 测试公司: {company_codes}")
    print(f"📅 时间范围: {makeTimeStart} - {makeTimeEnd}")
    
    # 初始化用友客户端
    client = YonyouClient()
    
    # 获取access_token
    print("\n🔑 获取access_token...")
    token = await client.get_access_token()
    if not token:
        print("❌ 获取access_token失败")
        return
    print(f"✅ access_token获取成功: {token[:20]}...")
    
    # 测试每个公司的凭证拉取，以公司为key组织数据
    company_results = {}
    total_vouchers = 0
    
    for company_code in company_codes:
        print(f"\n🏢 测试公司: {company_code}")
        
        try:
            # 拉取第一页数据
            result = await client.query_vouchers(
                company_code=company_code,
                makeTimeStart=makeTimeStart,
                makeTimeEnd=makeTimeEnd,
                page=1,
                page_size=20
            )
            
            if result and result.get("code") == "200":
                data = result.get("data", {})
                vouchers = data.get("recordList", [])
                total_count = data.get("recordCount", 0)
                
                print(f"✅ 公司 {company_code} 拉取成功:")
                print(f"   - 凭证数量: {len(vouchers)}")
                print(f"   - 总数量: {total_count}")
                
                # 组织公司数据
                company_results[company_code] = {
                    "status": "success",
                    "voucher_count": len(vouchers),
                    "total_count": total_count,
                    "vouchers": vouchers,
                    "raw_response": result
                }
                
                total_vouchers += len(vouchers)
                
                # 显示第一个凭证的示例结构
                if vouchers:
                    print(f"   - 凭证示例结构:")
                    sample_voucher = vouchers[0]
                    for key, value in sample_voucher.items():
                        if isinstance(value, (str, int, float, bool)):
                            print(f"     {key}: {value}")
                        else:
                            print(f"     {key}: {type(value).__name__}")
                
            else:
                error_msg = result.get("message", "未知错误") if result else "请求失败"
                print(f"❌ 公司 {company_code} 拉取失败: {error_msg}")
                
                # 记录失败的公司数据
                company_results[company_code] = {
                    "status": "failed",
                    "error": error_msg,
                    "voucher_count": 0,
                    "total_count": 0,
                    "vouchers": [],
                    "raw_response": result
                }
                
        except Exception as e:
            error_msg = str(e)
            print(f"❌ 公司 {company_code} 拉取异常: {error_msg}")
            
            # 记录异常的公司数据
            company_results[company_code] = {
                "status": "error",
                "error": error_msg,
                "voucher_count": 0,
                "total_count": 0,
                "vouchers": [],
                "raw_response": None
            }
    
    # 保存按公司组织的汇总数据
    summary_file = temp_dir / f"vouchers_by_company_{makeTimeStart}_{makeTimeEnd}.json"
    summary_data = {
        "test_info": {
            "timestamp": datetime.now().isoformat(),
            "company_codes": company_codes,
            "date_range": f"{makeTimeStart} - {makeTimeEnd}",
            "total_vouchers": total_vouchers,
            "success_count": sum(1 for r in company_results.values() if r["status"] == "success"),
            "failed_count": sum(1 for r in company_results.values() if r["status"] == "failed"),
            "error_count": sum(1 for r in company_results.values() if r["status"] == "error")
        },
        "company_data": company_results
    }
    
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n📊 按公司组织的数据已保存: {summary_file}")
    print(f"📈 统计信息:")
    print(f"   - 总凭证数: {total_vouchers}")
    print(f"   - 成功公司: {summary_data['test_info']['success_count']}")
    print(f"   - 失败公司: {summary_data['test_info']['failed_count']}")
    print(f"   - 异常公司: {summary_data['test_info']['error_count']}")
    
    print(f"\n✅ 测试完成！查看临时目录: {temp_dir.absolute()}")


def main():
    """主函数"""
    asyncio.run(test_voucher_fetch())


if __name__ == "__main__":
    main()
