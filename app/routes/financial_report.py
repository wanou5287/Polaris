"""财务报表API路由

提供财务报表自动化生成系统的核心API接口：
- 一键生成财务报表（数据拉取+清洗+入库+模板填充+加密压缩）
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse
from datetime import datetime
import os
from app.core.logger import logger
from app.services.data_fetch_service import DataFetchService
from app.services.data_process_service import DataProcessService
from app.services.report_generate_service import ReportGenerateService
from app.services.notification_service import NotificationService
from app.core.config import settings
from app.core.one_time_link import create_one_time_token, consume_token
 


router = APIRouter()
def ok(data: dict, message: str = "success"):
    return {"code": 200, "message": message, "data": data}

def fail(message: str, code: int = 500, data: dict = None):
    return {"code": code, "message": message, "data": data or {}}



@router.get("/generate-report")
async def generate_financial_report(
    makeTimeStart: str,
    makeTimeEnd: str,
    background_tasks: BackgroundTasks,
):
    """
    一键生成财务报表
    
    完整流程：
    1. 调用第三方接口获取数据
    2. 数据清洗后入库
    3. 将数据填入模板文件生成新文件
    4. 加密压缩文件
    
    Args:
        makeTimeStart: 开始日期，格式如 "2025-09-01"
        makeTimeEnd: 结束日期，格式如 "2025-09-30"
        background_tasks: 后台任务
        db: 数据库会话
    
    Returns:
        生成结果
    """
    try:
        logger.info(f"开始生成财务报表，时间范围: {makeTimeStart} - {makeTimeEnd}")
        
        # 验证日期格式
        try:
            datetime.strptime(makeTimeStart, "%Y-%m-%d")
            datetime.strptime(makeTimeEnd, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="日期格式错误，请使用 YYYY-MM-DD 格式")
        
        # 异步执行完整流程
        background_tasks.add_task(
            _execute_full_report_generation, 
            makeTimeStart, 
            makeTimeEnd
        )
        
        return ok({
            "makeTimeStart": makeTimeStart,
            "makeTimeEnd": makeTimeEnd,
            "status": "started",
            "message": "财务报表生成任务已在后台启动，请稍后在钉钉群机器人接收通知"
        }, "财务报表生成任务已启动")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动财务报表生成失败: {str(e)}")
        raise HTTPException(status_code=500, detail=fail(f"启动财务报表生成失败: {str(e)}"))

@router.get("/one-time-download/{token}")
async def one_time_download(token: str):
    """一次性下载跳转：消费token并302到OSS签名URL。"""
    try:
        url = consume_token(token)
        if not url:
            return JSONResponse(status_code=410, content=fail("链接已失效或不存在", code=410))
        return RedirectResponse(url=url, status_code=302)
    except Exception as e:
        logger.error(f"一次性下载失败: {str(e)}")
        raise HTTPException(status_code=500, detail=fail("一次性下载失败"))


async def _execute_full_report_generation(makeTimeStart: str, makeTimeEnd: str):
    """执行完整的财务报表生成流程"""
    try:
        logger.info(f"开始执行完整财务报表生成流程: {makeTimeStart} - {makeTimeEnd}")
        
        # 1. 数据拉取服务
        fetch_service = DataFetchService()
        logger.info("步骤1: 开始数据拉取...")
        fetch_results = await fetch_service.fetch_all_companies_data(makeTimeStart, makeTimeEnd)
        
        # 2. 数据处理服务
        process_service = DataProcessService()
        logger.info("步骤2: 开始数据处理...")
        period = datetime.strptime(makeTimeStart, "%Y-%m-%d").strftime("%Y-%m")
        process_results = await process_service.process_all_companies_data(period)
        
        # 3. 报表生成服务（包含Excel生成和加密压缩）
        report_service = ReportGenerateService()
        logger.info("步骤3: 开始报表生成和加密压缩...")
        company_codes = settings.COMPANY_ACCOUNT_CODES.split(',')
        company_data = {
            "company_codes": company_codes,
            "period": period
        }
        final_report = await report_service.generate_monthly_report(period, company_data)
        # 将签名URL包装为一次性下载链接（若生成成功）
        try:
            if isinstance(final_report, dict) and final_report.get("success") and final_report.get("download_url"):
                token = create_one_time_token(final_report["download_url"])
                final_report["one_time_url"] = f"{settings.SERVER_BASE_URL}/api/one-time-download/{token}"
        except Exception:
            pass
        
        logger.info(f"财务报表生成流程完成: {makeTimeStart} - {makeTimeEnd}")
        
    except Exception as e:
        logger.error(f"财务报表生成流程失败: {str(e)}")
        # 发送错误通知
        try:
            notification_service = NotificationService()
            await notification_service.send_error_notification(
                "财务报表生成失败",
                f"时间范围: {makeTimeStart} - {makeTimeEnd}, 错误: {str(e)}"
            )
        except:
            pass


