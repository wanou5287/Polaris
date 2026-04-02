"""Polaris FastAPI entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.logger import logger
from app.routes.base import api_router
from app.routes.bi_dashboard import start_sync_scheduler, stop_sync_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Polaris startup in progress...")
    try:
        init_db()
        logger.info("Database initialized.")
    except Exception as exc:  # pragma: no cover - startup guard
        logger.warning("Database init failed, continue startup: %s", exc)

    start_sync_scheduler()
    logger.info("Storage backend: %s", settings.STORAGE_BACKEND)
    yield
    stop_sync_scheduler()
    logger.info("Polaris shutdown complete.")


app = FastAPI(
    title="Polaris Supply Chain Workspace",
    description=(
        "Polaris operations platform for BI dashboards, inventory flow, "
        "procurement supply, and workflow automation."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/financial/docs",
    redoc_url="/financial/redoc",
    openapi_url="/financial/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.SERVER_PORT,
        reload=False,
        log_level="info",
    )
