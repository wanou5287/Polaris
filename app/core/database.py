# app/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.base import Base
from app.core.logger import logger
from pathlib import Path

_engine = None
SessionLocal = None

def get_engine():
    global _engine
    if _engine is None:
        connect_args = {}
        if settings.DB_URL.startswith("sqlite"):
            Path(settings.DB_URL.split("///")[-1]).parent.mkdir(parents=True, exist_ok=True)
            connect_args = {"check_same_thread": False}
        else: # For MySQL, add a connection timeout
            connect_args = {"connect_timeout": 10} # 10 seconds timeout
        
        # 确保支持 DECIMAL 类型
        _engine = create_engine(
            settings.DB_URL, 
            pool_pre_ping=True, 
            future=True, 
            connect_args=connect_args,
            echo=False  # 设置为 True 可以看到 SQL 语句
        )
    return _engine

def get_session():
    global SessionLocal
    if SessionLocal is None:
        SessionLocal = sessionmaker(bind=get_engine(), autocommit=False, autoflush=False, future=True)
    return SessionLocal()

def init_db():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    logger.info("DB initialized.")
