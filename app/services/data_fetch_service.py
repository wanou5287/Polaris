"""数据拉取服务

实现多线程分页数据拉取，包括：
- 11家公司并发拉取
- 分页查询直到数据完整
"""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from app.core.logger import logger
from app.core.database import get_session
from app.core.config import settings
from app.models.voucher import VoucherData
from app.services.yonyou_client import YonyouClient
from app.services.notification_service import NotificationService
from sqlalchemy.orm import Session
from decimal import Decimal


class DataFetchService:
    """数据拉取服务"""
    
    def __init__(self, max_workers: int = 5):
        self.max_workers = max_workers
        self.notification_service = NotificationService()
        self.yonyou_client = YonyouClient()
    
    async def fetch_all_companies_data(self, makeTimeStart: str, makeTimeEnd: str) -> Dict[str, Dict]:
        """拉取所有公司的数据"""
        logger.info(f"开始拉取所有公司数据，时间范围: {makeTimeStart} - {makeTimeEnd}")
        
        # 从配置获取公司账蒲代码列表
        company_codes = settings.COMPANY_ACCOUNT_CODES.split(',')
        logger.info(f"需要拉取的公司数量: {len(company_codes)}")
        
        # 并发拉取数据
        results = {}
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # 提交所有任务
            future_to_company = {
                executor.submit(self._fetch_company_data, company_code, makeTimeStart, makeTimeEnd): company_code
                for company_code in company_codes
            }
            
            # 收集结果
            for future in as_completed(future_to_company):
                company_code = future_to_company[future]
                try:
                    result = future.result()
                    results[company_code] = result
                    logger.info(f"公司 {company_code} 数据拉取完成")
                except Exception as e:
                    logger.error(f"公司 {company_code} 数据拉取失败: {str(e)}")
                    # 发送错误通知
                    await self.notification_service.send_error_notification(
                        company_code, 
                        f"数据拉取失败: {str(e)}"
                    )
                    results[company_code] = {
                        "success": False,
                        "error": str(e),
                        "voucher_count": 0
                    }
        
        # 统计结果（仅日志记录，不发送汇总通知）
        success_count = sum(1 for r in results.values() if r.get("success", False))
        total_count = len(results)
        logger.info(f"数据拉取完成，成功: {success_count}/{total_count}")
        
        return results
    
    def _fetch_company_data(self, company_code: str, makeTimeStart: str, makeTimeEnd: str) -> Dict:
        """拉取单个公司数据 - 实现完整分页查询"""
        logger.info(f"开始拉取公司数据: {company_code}, 时间范围: {makeTimeStart} - {makeTimeEnd}")
        
        try:
            import asyncio
            
            # 实现完整分页查询逻辑
            all_vouchers = []
            page = 1
            page_size = 20
            total_pages = 0
            
            while True:
                logger.info(f"拉取公司 {company_code} 第 {page} 页数据，每页 {page_size} 条")
                
                # 调用API获取当前页数据
                result = asyncio.run(self.yonyou_client.query_vouchers(company_code, makeTimeStart, makeTimeEnd, page, page_size))
                
                if not result:
                    logger.warning(f"公司 {company_code} 第 {page} 页没有数据，查询结束")
                    break
                
                # 解析返回数据
                data = result.get("data", {})
                vouchers = data.get("recordList", [])
                
                if not vouchers:
                    logger.info(f"公司 {company_code} 第 {page} 页没有数据，查询结束")
                    break
                
                # 添加当前页数据
                all_vouchers.extend(vouchers)
                logger.info(f"公司 {company_code} 第 {page} 页拉取到 {len(vouchers)} 条凭证")
                
                # 获取总页数信息
                if total_pages == 0:
                    record_count = data.get("recordCount", 0)
                    total_pages = (record_count + page_size - 1) // page_size
                    logger.info(f"公司 {company_code} 总记录数: {record_count}, 总页数: {total_pages}")
                
                # 检查是否还有更多数据
                if page >= total_pages:
                    logger.info(f"公司 {company_code} 所有页面拉取完成，共 {total_pages} 页")
                    break
                
                page += 1
                
                # 避免请求过于频繁
                time.sleep(0.5)
            
            if not all_vouchers:
                # 视为正常但无数据的情况，不算失败
                logger.info(f"公司 {company_code} 本期无数据")
                period_str = datetime.strptime(makeTimeStart, "%Y-%m-%d").strftime("%Y-%m")
                # 清理旧数据（保持与有数据时一致的行为）
                try:
                    self._clear_old_data(get_session(), company_code, period_str)
                except Exception:
                    pass
                return {
                    "success": True,
                    "company_code": company_code,
                    "voucher_count": 0,
                    "total_fetched": 0,
                    "total_vouchers": 0,
                    "total_pages": 0,
                    "period": period_str
                }
            
            # 提取关键数据
            extracted_data = []
            for voucher in all_vouchers:
                extracted_items = self.yonyou_client.extract_voucher_data(voucher)
                extracted_data.extend(extracted_items)
            
            logger.info(f"公司 {company_code} 提取到 {len(extracted_data)} 条关键数据")
            
            # 打印数据示例
            print(f"\n=== 公司 {company_code} 数据摘要 ===")
            print(f"总凭证数: {len(all_vouchers)}")
            print(f"总分录数: {len(extracted_data)}")
            print(f"查询页数: {total_pages}")
            
            # 保存数据到数据库
            period_str = datetime.strptime(makeTimeStart, "%Y-%m-%d").strftime("%Y-%m")
            saved_count = self._save_voucher_data(company_code, period_str, extracted_data)
            
            logger.info(f"公司 {company_code} 数据拉取完成，共 {len(extracted_data)} 条分录，保存 {saved_count} 条")
            
            return {
                "success": True,
                "company_code": company_code,
                "voucher_count": saved_count,
                "total_fetched": len(extracted_data),
                "total_vouchers": len(all_vouchers),
                "total_pages": total_pages,
                "period": period_str
            }
            
        except Exception as e:
            logger.error(f"拉取公司 {company_code} 数据异常: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "voucher_count": 0,
                "total_pages": 0
            }
    
    def _save_voucher_data(self, company_code: str, period: str, extracted_data: List[Dict]) -> int:
        """保存凭证数据到数据库（存储前进行科目代码过滤）"""
        db = get_session()
        saved_count = 0
        filtered_count = 0
        
        try:
            # 清理旧数据
            self._clear_old_data(db, company_code, period)
            
            # 获取科目代码前缀过滤规则
            subject_prefixes = settings.SUBJECT_CODES.split(',')
            logger.info(f"科目代码前缀过滤规则: {subject_prefixes}")

            for item in extracted_data:
                try:
                    # 检查科目代码是否符合前缀过滤规则
                    accsubject_code = item.get("accsubject_code", "")
                    is_valid_prefix = False
                    
                    for prefix in subject_prefixes:
                        if accsubject_code.startswith(prefix):
                            is_valid_prefix = True
                            break
                    
                    # 如果不符合前缀规则，跳过这条记录
                    if not is_valid_prefix:
                        filtered_count += 1
                        continue
                    
                    # 处理日期格式
                    maketime = None
                    if item.get("maketime"):
                        try:
                            # 尝试解析日期字符串
                            maketime = datetime.strptime(item["maketime"], "%Y-%m-%d")
                        except ValueError:
                            # 如果解析失败，尝试其他格式
                            try:
                                maketime = datetime.strptime(item["maketime"], "%Y-%m-%d %H:%M:%S")
                            except ValueError:
                                logger.warning(f"无法解析日期: {item.get('maketime')}")
                                maketime = None
                    
                    # 创建凭证数据记录（统一使用数据库字段名）
                    voucher_data = VoucherData(
                        company_code=item.get("company_code", company_code),
                        period=item.get("period", period),
                        accsubject_code=item.get("accsubject_code", ""),
                        accsubject_name=item.get("accsubject_name", ""),
                        maketime=maketime,
                        auxiliary_code=item.get("auxiliary_code", ""),
                        auxiliary_name=item.get("auxiliary_name", ""),
                        accbook_name=item.get("accbook_name", ""),
                        displayname=item.get("displayname", ""),
                        description=item.get("description", ""),
                        debit_org=Decimal(str(item.get("debit_org", 0))),
                        credit_org=Decimal(str(item.get("credit_org", 0)))
                    )
                    
                    db.add(voucher_data)
                    saved_count += 1
                    
                except Exception as e:
                    logger.error(f"保存凭证数据失败: {str(e)}")
                    continue
            
            db.commit()
            logger.info(f"公司 {company_code} 科目代码过滤完成: 保存 {saved_count} 条，过滤掉 {filtered_count} 条")
            
        except Exception as e:
            logger.error(f"保存公司 {company_code} 数据异常: {str(e)}")
            db.rollback()
        finally:
            db.close()
        
        return saved_count
    
    def _clear_old_data(self, db: Session, company_code: str, period: str):
        """清理指定公司和期间的旧数据"""
        db.query(VoucherData).filter(
            VoucherData.company_code == company_code,
            VoucherData.period == period
        ).delete()
        db.commit()
        logger.info(f"已清理公司 {company_code} 期间 {period} 的旧凭证数据")
    
    # 移除未使用的重试与状态查询函数，保留核心拉取逻辑