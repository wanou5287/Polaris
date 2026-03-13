from datetime import datetime

from fastapi import APIRouter

from app.core.logger import logger

# Mount all APIs under /financial
api_router = APIRouter(prefix="/financial")

# Keep BI dashboard always available.
from .bi_dashboard import router as bi_dashboard_router

api_router.include_router(bi_dashboard_router, tags=["BI Dashboard"])

# Load heavy routers defensively so one missing dependency does not
# prevent the whole app from starting.
try:
    from .financial_report import router as financial_router

    api_router.include_router(financial_router, tags=["Financial Report"])
except Exception as exc:  # pragma: no cover - startup guard
    logger.warning("Skip financial_report router: %s", exc)

try:
    from .template_upload import router as template_router

    api_router.include_router(template_router, tags=["Template"])
except Exception as exc:  # pragma: no cover - startup guard
    logger.warning("Skip template_upload router: %s", exc)


@api_router.get("/")
async def financial_root():
    return {
        "message": "financial prefix alive",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/financial/health",
    }


@api_router.get("/health")
async def financial_health():
    return {
        "status": "healthy",
        "message": "system is running",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
