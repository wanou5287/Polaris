"""数据处理服务

实现数据清洗、去重、合并抵消等处理逻辑，包括：
- 数据清洗与规范化
- 去重处理
- 合并关联交易
- 生成抵消数据
"""

from typing import List, Dict
from datetime import datetime
from app.core.logger import logger
from app.core.database import get_session
from app.models.voucher import VoucherData
from app.core.config import settings


class DataProcessService:
    """数据处理服务"""
    
    def __init__(self):
        self.internal_transaction_keywords = ["关联交易"]
    
    def process_company_data(self, company_code: str, period: str) -> Dict:
        """处理单个公司的数据"""
        logger.info(f"开始处理公司数据: {company_code}, 期间: {period}")
        
        try:
            # 获取原始数据
            raw_data = self._get_raw_voucher_data(company_code, period)
            if not raw_data:
                logger.warning(f"公司 {company_code} 没有找到数据")
                return {
                    "success": False,
                    "error": "没有找到数据",
                    "processed_count": 0
                }
            
            # 数据清洗
            cleaned_data = self._clean_data(raw_data)
            logger.info(f"数据清洗完成，原始: {len(raw_data)}, 清洗后: {len(cleaned_data)}")
            
            # 去重处理
            deduplicated_data = self._deduplicate_data(cleaned_data)
            logger.info(f"去重完成，清洗后: {len(cleaned_data)}, 去重后: {len(deduplicated_data)}")
            
            # 识别内部交易
            internal_transactions = self._identify_internal_transactions(deduplicated_data)
            logger.info(f"识别内部交易: {len(internal_transactions)} 条")
            
            # 生成抵消数据
            offset_data = self._generate_offset_data(internal_transactions)
            logger.info(f"生成抵消数据: {len(offset_data)} 条")
            
            # 保存处理后的数据
            saved_count = self._save_processed_data(company_code, period, deduplicated_data, offset_data)
            
            logger.info(f"公司 {company_code} 数据处理完成，保存: {saved_count} 条")
            
            return {
                "success": True,
                "processed_count": saved_count,
                "internal_transactions": len(internal_transactions),
                "offset_data": len(offset_data),
                "company_code": company_code,
                "period": period
            }
            
        except Exception as e:
            logger.error(f"处理公司 {company_code} 数据异常: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "processed_count": 0
            }
    
    def _get_raw_voucher_data(self, company_code: str, period: str) -> List[Dict]:
        """获取原始凭证数据"""
        db = get_session()
        try:
            # 查询凭证数据
            vouchers = db.query(VoucherData).filter(
                VoucherData.company_code == company_code,
                VoucherData.period == period
            ).all()
            
            raw_data = []
            for voucher in vouchers:
                voucher_data = {
                    "header": {
                        "id": voucher.id,
                        "billcode": voucher.displayname,
                        "description": voucher.description,
                        "totaldebit_org": voucher.debit_org,
                        "totalcredit_org": voucher.credit_org,
                        "maketime": voucher.maketime,
                        "maker_name": "",
                        "accbook_name": voucher.accbook_name,
                        "vouchertype_name": "",
                    },
                    "bodies": [
                        {
                            "id": voucher.id,
                            "recordnumber": 1,
                            "description": voucher.description,
                            "debit_org": float(voucher.debit_org),
                            "credit_org": float(voucher.credit_org),
                            "accsubject_code": voucher.accsubject_code,
                            "accsubject_name": voucher.accsubject_name,
                            "auxiliary": voucher.auxiliary_code,
                            "auxiliary_show": voucher.auxiliary_name,
                            "billtime": voucher.maketime,
                            "billno": voucher.displayname,
                        }
                    ]
                }
                raw_data.append(voucher_data)
            
            return raw_data
            
        except Exception as e:
            logger.error(f"获取原始数据失败: {str(e)}")
            return []
        finally:
            db.close()
    
    def _clean_data(self, raw_data: List[Dict]) -> List[Dict]:
        """数据清洗"""
        cleaned_data = []
        
        for voucher in raw_data:
            try:
                # 检查必要字段
                if not voucher.get("header", {}).get("id"):
                    continue
                
                # 清洗凭证头数据
                header = voucher["header"]
                cleaned_header = {
                    "id": header.get("id", ""),
                    "billcode": header.get("billcode", 0),
                    "description": self._clean_text(header.get("description", "")),
                    "totaldebit_org": float(header.get("totaldebit_org", 0)),
                    "totalcredit_org": float(header.get("totalcredit_org", 0)),
                    "maketime": header.get("maketime"),
                    "maker_name": self._clean_text(header.get("maker_name", "")),
                    "accbook_name": self._clean_text(header.get("accbook_name", "")),
                    "vouchertype_name": self._clean_text(header.get("vouchertype_name", "")),
                }
                
                # 清洗凭证体数据
                cleaned_bodies = []
                for body in voucher.get("bodies", []):
                    cleaned_body = {
                        "id": body.get("id"),
                        "recordnumber": body.get("recordnumber", 0),
                        "description": self._clean_text(body.get("description", "")),
                        "debit_org": float(body.get("debit_org", 0)),
                        "credit_org": float(body.get("credit_org", 0)),
                        "accsubject_code": self._clean_text(body.get("accsubject_code", "")),
                        "accsubject_name": self._clean_text(body.get("accsubject_name", "")),
                        "auxiliary": body.get("auxiliary", ""),
                        "auxiliary_show": self._clean_text(body.get("auxiliary_show", "")),
                        "billtime": body.get("billtime"),
                        "billno": self._clean_text(body.get("billno", "")),
                    }
                    
                    # 检查金额是否有效
                    if cleaned_body["debit_org"] >= 0 and cleaned_body["credit_org"] >= 0:
                        cleaned_bodies.append(cleaned_body)
                
                if cleaned_bodies:  # 只保留有有效凭证体的凭证
                    cleaned_data.append({
                        "header": cleaned_header,
                        "bodies": cleaned_bodies
                    })
                    
            except Exception as e:
                logger.warning(f"清洗凭证数据失败: {str(e)}")
                continue
        
        return cleaned_data
    
    def _clean_text(self, text: str) -> str:
        """清洗文本数据"""
        if not text:
            return ""
        
        # 去除前后空格
        text = text.strip()
        
        # 去除特殊字符
        text = text.replace("\n", " ").replace("\r", " ").replace("\t", " ")
        
        # 去除多余空格
        while "  " in text:
            text = text.replace("  ", " ")
        
        return text
    
    def _deduplicate_data(self, data: List[Dict]) -> List[Dict]:
        """去重处理"""
        seen_ids = set()
        deduplicated_data = []
        
        for voucher in data:
            voucher_id = voucher["header"]["id"]
            if voucher_id not in seen_ids:
                seen_ids.add(voucher_id)
                deduplicated_data.append(voucher)
        
        return deduplicated_data
    
    def _identify_internal_transactions(self, data: List[Dict]) -> List[Dict]:
        """识别关联交易"""
        internal_transactions = []
        
        for voucher in data:
            header = voucher["header"]
            bodies = voucher["bodies"]
            
            # 检查摘要是否包含内部交易关键词
            description = str(header.get("description", ""))
            is_internal = any(keyword in description for keyword in self.internal_transaction_keywords)
            
            if is_internal:
                internal_transactions.append(voucher)
                continue
            
            # 检查辅助核算是否包含内部交易信息
            for body in bodies:
                auxiliary_show = str(body.get("auxiliary_show", ""))
                if any(keyword in auxiliary_show for keyword in self.internal_transaction_keywords):
                    internal_transactions.append(voucher)
                    break
        
        return internal_transactions
    
    def _generate_offset_data(self, internal_transactions: List[Dict]) -> List[Dict]:
        """生成抵消数据"""
        offset_data = []
        
        # 按科目汇总内部交易
        subject_summary = {}
        
        for transaction in internal_transactions:
            for body in transaction["bodies"]:
                subject_code = body.get("accsubject_code", "")
                if not subject_code:
                    continue
                
                if subject_code not in subject_summary:
                    subject_summary[subject_code] = {
                        "subject_name": body.get("accsubject_name", ""),
                        "total_debit": 0,
                        "total_credit": 0,
                        "count": 0
                    }
                
                subject_summary[subject_code]["total_debit"] += body.get("debit_org", 0)
                subject_summary[subject_code]["total_credit"] += body.get("credit_org", 0)
                subject_summary[subject_code]["count"] += 1
        
        # 生成抵消分录
        for subject_code, summary in subject_summary.items():
            if summary["total_debit"] > 0 or summary["total_credit"] > 0:
                offset_entry = {
                    "subject_code": subject_code,
                    "subject_name": summary["subject_name"],
                    "total_debit": summary["total_debit"],
                    "total_credit": summary["total_credit"],
                    "count": summary["count"],
                    "offset_type": "内部交易抵消"
                }
                offset_data.append(offset_entry)
        
        return offset_data
    
    def _save_processed_data(self, company_code: str, period: str, processed_data: List[Dict], offset_data: List[Dict]) -> int:
        """保存处理后的数据"""
        # 这里可以保存到专门的处理结果表
        # 暂时返回处理数量
        return len(processed_data)

    async def process_all_companies_data(self, period: str) -> Dict:
        """按配置公司列表批量处理数据，返回汇总结果"""
        results: Dict[str, Dict] = {}
        company_codes = settings.COMPANY_ACCOUNT_CODES.split(',') if getattr(settings, 'COMPANY_ACCOUNT_CODES', '') else []
        success_count = 0
        for company_code in company_codes:
            try:
                result = self.process_company_data(company_code, period)
                results[company_code] = result
                if result.get("success"):
                    success_count += 1
            except Exception as e:
                logger.error(f"公司 {company_code} 处理异常: {str(e)}")
                results[company_code] = {"success": False, "error": str(e), "processed_count": 0}
        logger.info(f"批量数据处理完成，成功: {success_count}/{len(company_codes)}")
        return {
            "success": True,
            "summary": {"success": success_count, "total": len(company_codes)},
            "details": results,
            "period": period,
        }
    
