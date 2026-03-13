"""
模板文件上传接口
财务人员可以上传更新Excel模板文件到OSS
"""

import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import logging

from app.core.config import settings
from app.services.oss_service import OSSService
from app.core.logger import logger

router = APIRouter()


@router.post("/template/upload")
async def upload_template(file: UploadFile = File(...)):
    """
    上传Excel模板文件到OSS
    
    Args:
        file: 上传的Excel文件
        
    Returns:
        JSONResponse: 上传结果
    """
    try:
        # 验证文件类型
        if not file.filename.endswith('.xlsx'):
            raise HTTPException(status_code=400, detail="只支持.xlsx格式的Excel文件")
        
        # 验证文件大小（限制20MB）
        file_content = await file.read()
        if len(file_content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="文件大小不能超过10MB")
        
        logger.info(f"开始上传模板文件: {file.filename}, 大小: {len(file_content)} bytes")
        
        # 创建临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            # 上传到OSS
            oss_service = OSSService()
            upload_url = await oss_service.upload_file(temp_file_path, settings.TEMPLATE_OSS_KEY)
            
            logger.info(f"模板文件上传成功: {upload_url}")
            
            return JSONResponse(content= {
                "code": 200,
                "message": "模板文件上传成功",
                "data": {
                    "template_url": upload_url,
                    "oss_key": settings.TEMPLATE_OSS_KEY,
                    "file_size": len(file_content),
                    "filename": file.filename
                }
            })
            
        finally:
            # 清理临时文件
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"模板文件上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

