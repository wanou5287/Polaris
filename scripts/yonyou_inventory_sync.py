from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import hmac
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import quote_plus

import requests
import yaml
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import DECIMAL, Column, Date, DateTime, Integer, String, Text, UniqueConstraint, create_engine, func
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session, declarative_base, sessionmaker


Base = declarative_base()
SUCCESS_CODES = {"0", "00000", "200", "success", "SUCCESS"}
PROJECT_ROOT = Path(__file__).resolve().parents[1]
WAREHOUSE_XIAOSHAN = "精准学乾盛萧山云仓"
WAREHOUSE_YUHANG = "精准学余杭速豪盒马云仓"
WAREHOUSE_RETURN = "精准学销退仓"
INVENTORY_WAREHOUSE_DEFAULTS: List[Tuple[str, str, int]] = [
    ("精准学二级不良品仓", "不良品仓", 10),
    ("精准学良品仓", "良品仓", 20),
    ("精准学乾盛萧山云仓", "萧山云仓", 30),
    ("精准学生产仓", "生产仓", 40),
    ("精准学委外仓", "委外仓", 50),
    ("精准学销退仓", "销退仓", 60),
    ("精准学余杭速豪盒马云仓", "余杭云仓", 70),
    ("精准学自营仓", "自营仓", 80),
]
INVENTORY_STATUS_DEFAULTS: List[Tuple[str, str, int]] = [
    ("2180202022719455294", "采购良品", 10),
    ("2417568647360806923", "翻新良品", 20),
    ("2180202022719455297", "不良品", 30),
    ("2417569283025403913", "翻新不良品", 40),
    ("2180202022719455295", "待检", 50),
    ("2356902801270898695", "屏幕不良", 60),
    ("2356903127684743177", "背壳不良", 70),
    ("2356903454106976287", "屏幕+背壳不良", 80),
    ("2356903711803965479", "原厂不良", 90),
    ("2417570013176659968", "采购不良品", 100),
    ("2423691157621964803", "后摄镜头不良", 110),
]


class InventorySnapshotDaily(Base):
    __tablename__ = "bi_inventory_snapshot_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, comment="Inventory snapshot date")
    captured_at = Column(DateTime, nullable=False, comment="Actual capture timestamp")
    stock_org_id = Column(String(64), nullable=False, default="", comment="Stock organization id")
    stock_org_name = Column(String(128), nullable=False, default="", comment="Stock organization name")
    warehouse_id = Column(String(64), nullable=False, default="", comment="Warehouse id")
    warehouse_name = Column(String(128), nullable=False, default="", comment="Warehouse name")
    material_id = Column(String(64), nullable=False, default="", comment="Material id")
    material_code = Column(String(64), nullable=False, default="", comment="Material code")
    material_name = Column(String(256), nullable=False, default="", comment="Material name")
    sku_id = Column(String(64), nullable=False, default="", comment="SKU id")
    sku_code = Column(String(64), nullable=False, default="", comment="SKU code")
    sku_name = Column(String(256), nullable=False, default="", comment="SKU name")
    unit_name = Column(String(64), nullable=False, default="", comment="Unit name")
    batch_no = Column(String(128), nullable=False, default="", comment="Batch number")
    stock_status_id = Column(String(64), nullable=False, default="", comment="Stock status id")
    store_id = Column(String(64), nullable=False, default="", comment="Store id")
    current_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Current quantity")
    available_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Available quantity")
    plan_available_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Planned available quantity")
    incoming_notice_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Incoming notice quantity")
    source_pubts = Column(String(64), nullable=False, default="", comment="Source timestamp")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "snapshot_date",
            "stock_org_id",
            "warehouse_id",
            "material_id",
            "sku_id",
            "batch_no",
            "stock_status_id",
            "store_id",
            name="uq_bi_inventory_snapshot_daily",
        ),
    )


class MaterialSalesDaily(Base):
    __tablename__ = "bi_material_sales_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biz_date = Column(Date, nullable=False, comment="Business date")
    source_row_key = Column(String(128), nullable=False, default="", comment="Stable unique key for source row")
    source_doc_id = Column(String(64), nullable=False, default="", comment="Source document id")
    source_line_id = Column(String(64), nullable=False, default="", comment="Source line id")
    source_code = Column(String(64), nullable=False, default="", comment="Source document code")
    source_lineno = Column(String(64), nullable=False, default="", comment="Source line number")
    source_bar_code = Column(String(128), nullable=False, default="", comment="Source barcode")
    source_bustype = Column(String(64), nullable=False, default="", comment="Source business type id")
    source_bustype_name = Column(String(128), nullable=False, default="", comment="Source business type name")
    source_vouchdate = Column(DateTime, nullable=True, comment="Source voucher datetime")
    source_create_time = Column(DateTime, nullable=True, comment="Source create datetime")
    source_pubts = Column(String(64), nullable=False, default="", comment="Source pubts")
    stock_org_id = Column(String(64), nullable=False, default="", comment="Stock organization id")
    stock_org_name = Column(String(128), nullable=False, default="", comment="Stock organization name")
    sales_org_id = Column(String(64), nullable=False, default="", comment="Sales organization id")
    sales_org_name = Column(String(128), nullable=False, default="", comment="Sales organization name")
    warehouse_id = Column(String(64), nullable=False, default="", comment="Warehouse id")
    warehouse_name = Column(String(128), nullable=False, default="", comment="Warehouse name")
    customer_id = Column(String(64), nullable=False, default="", comment="Customer id")
    customer_name = Column(String(256), nullable=False, default="", comment="Customer name")
    material_id = Column(String(64), nullable=False, default="", comment="Material id")
    material_code = Column(String(64), nullable=False, default="", comment="Material code")
    material_name = Column(String(256), nullable=False, default="", comment="Material name")
    sku_id = Column(String(64), nullable=False, default="", comment="SKU id")
    sku_code = Column(String(64), nullable=False, default="", comment="SKU code")
    sku_name = Column(String(256), nullable=False, default="", comment="SKU name")
    unit_name = Column(String(64), nullable=False, default="", comment="Unit name")
    qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Raw signed quantity")
    price_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Raw signed price quantity")
    sub_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Raw signed sub quantity")
    ori_sum = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Original amount including tax")
    nat_sum = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Native amount including tax")
    ori_money = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Original amount excluding tax")
    nat_money = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Native amount excluding tax")
    ori_tax = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Original tax amount")
    nat_tax = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Native tax amount")
    tax_rate = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="Tax rate")
    raw_json = Column(Text, nullable=False, comment="Raw source payload in JSON")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "source_row_key",
            name="uq_bi_material_sales_daily",
        ),
    )


class MaterialSalesDailyCleaning(Base):
    __tablename__ = "bi_material_sales_daily_cleaning"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biz_date = Column(Date, nullable=False, comment="日期")
    material_code = Column(String(64), nullable=False, default="", comment="物料编码")
    material_name = Column(String(256), nullable=False, default="", comment="物料名称")
    sales_out_xiaoshan = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="销售出库（萧山云仓）")
    sales_out_yuhang = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="销售出库（余杭云仓）")
    transit_intercept_xiaoshan = Column(
        DECIMAL(20, 6),
        nullable=False,
        default=Decimal("0"),
        comment="在途拦截（萧山云仓）",
    )
    transit_intercept_yuhang = Column(
        DECIMAL(20, 6),
        nullable=False,
        default=Decimal("0"),
        comment="在途拦截（余杭云仓）",
    )
    sales_return_warehouse = Column(
        DECIMAL(20, 6),
        nullable=False,
        default=Decimal("0"),
        comment="销售退货（销退仓）",
    )
    return_unpack_attendance = Column(
        DECIMAL(12, 2),
        nullable=False,
        default=Decimal("0"),
        comment="退货拆包出勤人数",
    )
    return_unpack_efficiency = Column(
        DECIMAL(20, 6),
        nullable=False,
        default=Decimal("0"),
        comment="退货拆包人效",
    )
    total_return_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="当日总退货数量")
    total_sales_qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="当日总销量")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "biz_date",
            "material_code",
            name="uq_bi_material_sales_daily_cleaning",
        ),
    )


class ReturnUnpackAttendanceDaily(Base):
    __tablename__ = "bi_return_unpack_attendance_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    biz_date = Column(Date, nullable=False, comment="日期", unique=True)
    attendance_count = Column(DECIMAL(12, 2), nullable=False, default=Decimal("0"), comment="退货拆包出勤人数")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class InventoryWarehouseMap(Base):
    __tablename__ = "bi_inventory_warehouse_map"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_warehouse_name = Column(String(128), nullable=False, default="", comment="原始仓库名称", unique=True)
    warehouse_name_clean = Column(String(64), nullable=False, default="", comment="清洗后仓库名称")
    sort_order = Column(Integer, nullable=False, default=100, comment="排序值")
    is_enabled = Column(Integer, nullable=False, default=1, comment="是否启用")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class InventoryStatusMap(Base):
    __tablename__ = "bi_inventory_status_map"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_status_id = Column(String(64), nullable=False, default="", comment="原始库存状态ID", unique=True)
    stock_status_name = Column(String(64), nullable=False, default="", comment="清洗后库存状态")
    sort_order = Column(Integer, nullable=False, default=100, comment="排序值")
    is_enabled = Column(Integer, nullable=False, default=1, comment="是否启用")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class InventorySnapshotDailyCleaning(Base):
    __tablename__ = "bi_inventory_snapshot_daily_cleaning"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, comment="日期")
    warehouse_name_clean = Column(String(64), nullable=False, default="", comment="仓库")
    material_code = Column(String(64), nullable=False, default="", comment="物料编码")
    material_name = Column(String(256), nullable=False, default="", comment="物料名称")
    stock_status_name = Column(String(64), nullable=False, default="", comment="物料状态")
    qty = Column(DECIMAL(20, 6), nullable=False, default=Decimal("0"), comment="数量")
    source_row_count = Column(Integer, nullable=False, default=0, comment="原始聚合行数")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "snapshot_date",
            "warehouse_name_clean",
            "material_code",
            "stock_status_name",
            name="uq_bi_inventory_snapshot_daily_cleaning",
        ),
    )


@dataclass
class EndpointConfig:
    path: str
    access_token_mode: str = "query"
    page_size: int = 100
    page_sleep_seconds: float = 0.0
    filters: Dict[str, Any] = field(default_factory=dict)
    result_list_paths: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(
        cls,
        raw: Dict[str, Any],
        *,
        default_path: str,
        default_result_list_paths: Sequence[str],
        default_page_size: int = 100,
    ) -> "EndpointConfig":
        return cls(
            path=raw.get("path", default_path),
            access_token_mode=raw.get("access_token_mode", "query"),
            page_size=int(raw.get("page_size", default_page_size)),
            page_sleep_seconds=float(raw.get("page_sleep_seconds", 0.0)),
            filters=dict(raw.get("filters", {})),
            result_list_paths=list(raw.get("result_list_paths", default_result_list_paths)),
        )


@dataclass
class YonyouConfig:
    base_url: str
    app_key: str
    app_secret: str
    tenant_id: str = ""
    gateway_prefix: str = "/iuap-api-gateway"
    auth_path: str = "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken"
    request_timeout_seconds: int = 30
    verify_ssl: bool = True
    max_retries: int = 3
    token_refresh_skew_seconds: int = 300
    inventory: EndpointConfig = field(default_factory=lambda: EndpointConfig(path="/yonbip/scm/stock/QueryCurrentStocksByCondition"))
    salesout: EndpointConfig = field(default_factory=lambda: EndpointConfig(path="/yonbip/scm/salesout/list"))


@dataclass
class DatabaseConfig:
    url: str


@dataclass
class JobConfig:
    cron: str = ""
    sales_days_behind: int = 1
    sales_window_days: int = 1
    snapshot_days_behind: int = 0


@dataclass
class LoggingConfig:
    level: str = "INFO"
    file: str = "logs/yonyou_inventory_sync.log"


@dataclass
class AppConfig:
    yonyou: YonyouConfig
    database: DatabaseConfig
    job: JobConfig
    logging: LoggingConfig


class YonyouApiError(RuntimeError):
    pass


def build_logger(log_config: LoggingConfig) -> logging.Logger:
    logger = logging.getLogger("yonyou_inventory_sync")
    logger.setLevel(getattr(logging, log_config.level.upper(), logging.INFO))

    if logger.handlers:
        return logger

    formatter = logging.Formatter("[%(asctime)s] %(levelname)s %(name)s - %(message)s")
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    log_path = Path(log_config.file)
    if not log_path.is_absolute():
        log_path = PROJECT_ROOT / log_path
    log_path.parent.mkdir(parents=True, exist_ok=True)

    file_handler = TimedRotatingFileHandler(
        filename=log_path,
        when="midnight",
        interval=1,
        backupCount=14,
        encoding="utf-8",
        utc=False,
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    return logger


def _load_yaml_text(config_path: Path) -> str:
    text = config_path.read_text(encoding="utf-8")
    return os.path.expandvars(text)


def load_config(config_path: Path) -> AppConfig:
    raw = yaml.safe_load(_load_yaml_text(config_path)) or {}

    yonyou_raw = raw.get("yonyou", {})
    if not yonyou_raw.get("base_url") or not yonyou_raw.get("app_key") or not yonyou_raw.get("app_secret"):
        raise ValueError("Config must provide yonyou.base_url, yonyou.app_key and yonyou.app_secret.")

    database_raw = raw.get("database", {})
    if not database_raw.get("url"):
        raise ValueError("Config must provide database.url.")

    inventory_default_paths = ("data.recordList", "data.rows", "data.list", "data.items", "data")
    sales_default_paths = ("data.recordList", "data.rows", "data.list", "data.items", "data")

    yonyou = YonyouConfig(
        base_url=str(yonyou_raw["base_url"]).rstrip("/"),
        app_key=str(yonyou_raw["app_key"]),
        app_secret=str(yonyou_raw["app_secret"]),
        tenant_id=str(yonyou_raw.get("tenant_id", "")),
        gateway_prefix=str(yonyou_raw.get("gateway_prefix", "/iuap-api-gateway")),
        auth_path=str(yonyou_raw.get("auth_path", "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken")),
        request_timeout_seconds=int(yonyou_raw.get("request_timeout_seconds", 30)),
        verify_ssl=bool(yonyou_raw.get("verify_ssl", True)),
        max_retries=int(yonyou_raw.get("max_retries", 3)),
        token_refresh_skew_seconds=int(yonyou_raw.get("token_refresh_skew_seconds", 300)),
        inventory=EndpointConfig.from_dict(
            yonyou_raw.get("inventory", {}),
            default_path="/yonbip/scm/stock/QueryCurrentStocksByCondition",
            default_result_list_paths=inventory_default_paths,
            default_page_size=500,
        ),
        salesout=EndpointConfig.from_dict(
            yonyou_raw.get("salesout", {}),
            default_path="/yonbip/scm/salesout/list",
            default_result_list_paths=sales_default_paths,
            default_page_size=100,
        ),
    )

    database = DatabaseConfig(url=str(database_raw["url"]))
    job = JobConfig(**raw.get("job", {}))
    logging_config = LoggingConfig(**raw.get("logging", {}))

    return AppConfig(yonyou=yonyou, database=database, job=job, logging=logging_config)


def get_by_path(payload: Any, dotted_path: str) -> Any:
    current = payload
    for segment in dotted_path.split("."):
        if isinstance(current, dict) and segment in current:
            current = current[segment]
        else:
            return None
    return current


def coalesce(payload: Dict[str, Any], candidates: Sequence[str], default: str = "") -> str:
    for candidate in candidates:
        value = get_by_path(payload, candidate)
        if value not in (None, ""):
            return str(value)
    return default


def to_decimal(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def parse_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    normalized = str(value).strip().replace("T", " ").replace("Z", "")
    patterns = (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d",
    )
    for pattern in patterns:
        try:
            return datetime.strptime(normalized, pattern)
        except ValueError:
            continue
    return None


def parse_date_arg(raw_value: str) -> date:
    parsed = parse_datetime(raw_value)
    if parsed is None:
        raise argparse.ArgumentTypeError(f"Invalid date value: {raw_value}")
    return parsed.date()


def row_value(row: Any, field: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(field, default)
    return getattr(row, field, default)


def normalize_material_code(row: Any) -> str:
    for field in ("material_code", "material_id", "sku_code", "source_row_key"):
        value = str(row_value(row, field, "") or "").strip()
        if value:
            return value
    return ""


def build_sales_cleaning_rows(
    raw_rows: Iterable[Any],
    attendance_by_date: Dict[date, Decimal] | None = None,
) -> List[Dict[str, Any]]:
    attendance_map = attendance_by_date or {}
    grouped: Dict[Tuple[date, str], Dict[str, Any]] = {}

    for row in raw_rows:
        biz_date = row_value(row, "biz_date")
        if biz_date is None:
            continue
        material_code = normalize_material_code(row)
        if not material_code:
            continue

        key = (biz_date, material_code)
        material_name = str(row_value(row, "material_name", "") or "").strip()
        holder = grouped.setdefault(
            key,
            {
                "biz_date": biz_date,
                "material_code": material_code,
                "material_name": material_name,
                "sales_out_xiaoshan": Decimal("0"),
                "sales_out_yuhang": Decimal("0"),
                "transit_intercept_xiaoshan": Decimal("0"),
                "transit_intercept_yuhang": Decimal("0"),
                "sales_return_warehouse": Decimal("0"),
            },
        )

        if material_name and not holder["material_name"]:
            holder["material_name"] = material_name

        qty = to_decimal(row_value(row, "qty"))
        warehouse_name = str(row_value(row, "warehouse_name", "") or "").strip()
        if qty == 0:
            continue

        if warehouse_name == WAREHOUSE_XIAOSHAN:
            if qty > 0:
                holder["sales_out_xiaoshan"] += qty
            else:
                holder["transit_intercept_xiaoshan"] += abs(qty)
        elif warehouse_name == WAREHOUSE_YUHANG:
            if qty > 0:
                holder["sales_out_yuhang"] += qty
            else:
                holder["transit_intercept_yuhang"] += abs(qty)
        elif warehouse_name == WAREHOUSE_RETURN and qty < 0:
            holder["sales_return_warehouse"] += abs(qty)

    cleaned_rows: List[Dict[str, Any]] = []
    for key in sorted(grouped.keys()):
        holder = grouped[key]
        attendance = to_decimal(attendance_map.get(holder["biz_date"], Decimal("0")))
        total_return_qty = (
            holder["sales_return_warehouse"]
            + holder["transit_intercept_xiaoshan"]
            + holder["transit_intercept_yuhang"]
        )
        total_sales_qty = holder["sales_out_xiaoshan"] + holder["sales_out_yuhang"]
        return_unpack_efficiency = Decimal("0")
        if attendance > 0:
            return_unpack_efficiency = holder["sales_return_warehouse"] / attendance

        cleaned_rows.append(
            {
                "biz_date": holder["biz_date"],
                "material_code": holder["material_code"],
                "material_name": holder["material_name"],
                "sales_out_xiaoshan": holder["sales_out_xiaoshan"],
                "sales_out_yuhang": holder["sales_out_yuhang"],
                "transit_intercept_xiaoshan": holder["transit_intercept_xiaoshan"],
                "transit_intercept_yuhang": holder["transit_intercept_yuhang"],
                "sales_return_warehouse": holder["sales_return_warehouse"],
                "return_unpack_attendance": attendance,
                "return_unpack_efficiency": return_unpack_efficiency,
                "total_return_qty": total_return_qty,
                "total_sales_qty": total_sales_qty,
            }
        )
    return cleaned_rows


def build_inventory_cleaning_rows(
    raw_rows: Iterable[Any],
    *,
    warehouse_map: Dict[str, str] | None = None,
    status_map: Dict[str, str] | None = None,
) -> List[Dict[str, Any]]:
    warehouse_name_map = warehouse_map or {}
    stock_status_map = status_map or {}
    grouped: Dict[Tuple[date, str, str, str], Dict[str, Any]] = {}

    for row in raw_rows:
        snapshot_date = row_value(row, "snapshot_date")
        if snapshot_date is None:
            continue
        raw_warehouse_name = str(row_value(row, "warehouse_name", "") or "").strip()
        warehouse_name_clean = warehouse_name_map.get(raw_warehouse_name)
        if not warehouse_name_clean:
            continue

        stock_status_id = str(row_value(row, "stock_status_id", "") or "").strip()
        stock_status_name = stock_status_map.get(stock_status_id)
        if not stock_status_name:
            continue

        qty = to_decimal(row_value(row, "current_qty"))
        if qty <= 0:
            continue

        material_code = normalize_material_code(row)
        if not material_code:
            continue

        key = (snapshot_date, warehouse_name_clean, material_code, stock_status_name)
        material_name = str(row_value(row, "material_name", "") or "").strip()
        holder = grouped.setdefault(
            key,
            {
                "snapshot_date": snapshot_date,
                "warehouse_name_clean": warehouse_name_clean,
                "material_code": material_code,
                "material_name": material_name,
                "stock_status_name": stock_status_name,
                "qty": Decimal("0"),
                "source_row_count": 0,
            },
        )
        if material_name and not holder["material_name"]:
            holder["material_name"] = material_name
        holder["qty"] += qty
        holder["source_row_count"] += 1

    cleaned_rows: List[Dict[str, Any]] = []
    for key in sorted(grouped.keys()):
        cleaned_rows.append(grouped[key])
    return cleaned_rows


def upsert_rows(session: Session, model: Any, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    if session.bind.dialect.name == "mysql":
        insert_stmt = mysql_insert(model).values(rows)
        update_columns = {
            column.name: insert_stmt.inserted[column.name]
            for column in model.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        update_columns["updated_at"] = func.now()
        session.execute(insert_stmt.on_duplicate_key_update(**update_columns))
        return

    unique_columns: List[str] = []
    constraints = [constraint for constraint in model.__table__.constraints if isinstance(constraint, UniqueConstraint)]
    if constraints:
        unique_columns = [column.name for column in constraints[0].columns]

    for row in rows:
        query = session.query(model)
        for column_name in unique_columns:
            query = query.filter(getattr(model, column_name) == row[column_name])
        instance = query.one_or_none()
        if instance is None:
            session.add(model(**row))
            continue
        for key, value in row.items():
            setattr(instance, key, value)


def ensure_sales_processing_schema(engine_obj: Any) -> None:
    Base.metadata.create_all(
        engine_obj,
        tables=[
            MaterialSalesDailyCleaning.__table__,
            ReturnUnpackAttendanceDaily.__table__,
        ],
    )


def ensure_inventory_processing_schema(engine_obj: Any) -> None:
    Base.metadata.create_all(
        engine_obj,
        tables=[
            InventoryWarehouseMap.__table__,
            InventoryStatusMap.__table__,
            InventorySnapshotDailyCleaning.__table__,
        ],
    )
    with Session(bind=engine_obj, future=True) as session:
        existing_warehouses = {
            str(item[0])
            for item in session.query(InventoryWarehouseMap.source_warehouse_name).all()
            if item[0] not in (None, "")
        }
        existing_statuses = {
            str(item[0])
            for item in session.query(InventoryStatusMap.stock_status_id).all()
            if item[0] not in (None, "")
        }

        warehouse_rows = [
            {
                "source_warehouse_name": source_name,
                "warehouse_name_clean": clean_name,
                "sort_order": sort_order,
                "is_enabled": 1,
            }
            for source_name, clean_name, sort_order in INVENTORY_WAREHOUSE_DEFAULTS
            if source_name not in existing_warehouses
        ]
        status_rows = [
            {
                "stock_status_id": stock_status_id,
                "stock_status_name": stock_status_name,
                "sort_order": sort_order,
                "is_enabled": 1,
            }
            for stock_status_id, stock_status_name, sort_order in INVENTORY_STATUS_DEFAULTS
            if stock_status_id not in existing_statuses
        ]

        if warehouse_rows:
            upsert_rows(session, InventoryWarehouseMap, warehouse_rows)
        if status_rows:
            upsert_rows(session, InventoryStatusMap, status_rows)
        session.commit()


def save_return_unpack_attendance(engine_obj: Any, biz_date: date, attendance_count: Any) -> Decimal:
    ensure_sales_processing_schema(engine_obj)
    normalized_count = to_decimal(attendance_count)
    if normalized_count < 0:
        raise ValueError("attendance_count cannot be negative")
    with Session(bind=engine_obj, future=True) as session:
        upsert_rows(
            session,
            ReturnUnpackAttendanceDaily,
            [{"biz_date": biz_date, "attendance_count": normalized_count}],
        )
        session.commit()
    refresh_sales_cleaning(engine_obj, start_date=biz_date, end_date=biz_date)
    return normalized_count


def refresh_sales_cleaning(
    engine_obj: Any,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> int:
    ensure_sales_processing_schema(engine_obj)
    with Session(bind=engine_obj, future=True) as session:
        raw_query = session.query(MaterialSalesDaily)
        attendance_query = session.query(ReturnUnpackAttendanceDaily)
        cleaning_query = session.query(MaterialSalesDailyCleaning)

        if start_date is not None:
            raw_query = raw_query.filter(MaterialSalesDaily.biz_date >= start_date)
            attendance_query = attendance_query.filter(ReturnUnpackAttendanceDaily.biz_date >= start_date)
            cleaning_query = cleaning_query.filter(MaterialSalesDailyCleaning.biz_date >= start_date)
        if end_date is not None:
            raw_query = raw_query.filter(MaterialSalesDaily.biz_date <= end_date)
            attendance_query = attendance_query.filter(ReturnUnpackAttendanceDaily.biz_date <= end_date)
            cleaning_query = cleaning_query.filter(MaterialSalesDailyCleaning.biz_date <= end_date)

        raw_rows = raw_query.order_by(MaterialSalesDaily.biz_date, MaterialSalesDaily.material_code).all()
        attendance_rows = attendance_query.all()
        attendance_by_date = {
            row.biz_date: to_decimal(row.attendance_count)
            for row in attendance_rows
            if row.biz_date is not None
        }
        cleaned_rows = build_sales_cleaning_rows(raw_rows, attendance_by_date)

        cleaning_query.delete(synchronize_session=False)
        if cleaned_rows:
            upsert_rows(session, MaterialSalesDailyCleaning, cleaned_rows)
        session.commit()
    return len(cleaned_rows)


def refresh_inventory_cleaning(
    engine_obj: Any,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> int:
    ensure_inventory_processing_schema(engine_obj)
    with Session(bind=engine_obj, future=True) as session:
        raw_query = session.query(InventorySnapshotDaily)
        cleaning_query = session.query(InventorySnapshotDailyCleaning)

        if start_date is not None:
            raw_query = raw_query.filter(InventorySnapshotDaily.snapshot_date >= start_date)
            cleaning_query = cleaning_query.filter(InventorySnapshotDailyCleaning.snapshot_date >= start_date)
        if end_date is not None:
            raw_query = raw_query.filter(InventorySnapshotDaily.snapshot_date <= end_date)
            cleaning_query = cleaning_query.filter(InventorySnapshotDailyCleaning.snapshot_date <= end_date)

        warehouse_map = {
            str(row.source_warehouse_name): str(row.warehouse_name_clean)
            for row in session.query(InventoryWarehouseMap)
            .filter(InventoryWarehouseMap.is_enabled == 1)
            .order_by(InventoryWarehouseMap.sort_order, InventoryWarehouseMap.id)
            .all()
        }
        status_map = {
            str(row.stock_status_id): str(row.stock_status_name)
            for row in session.query(InventoryStatusMap)
            .filter(InventoryStatusMap.is_enabled == 1)
            .order_by(InventoryStatusMap.sort_order, InventoryStatusMap.id)
            .all()
        }

        raw_rows = raw_query.order_by(
            InventorySnapshotDaily.snapshot_date,
            InventorySnapshotDaily.warehouse_name,
            InventorySnapshotDaily.material_code,
            InventorySnapshotDaily.stock_status_id,
        ).all()
        cleaned_rows = build_inventory_cleaning_rows(
            raw_rows,
            warehouse_map=warehouse_map,
            status_map=status_map,
        )

        cleaning_query.delete(synchronize_session=False)
        if cleaned_rows:
            upsert_rows(session, InventorySnapshotDailyCleaning, cleaned_rows)
        session.commit()
    return len(cleaned_rows)


def quote_mysql_url(url: str) -> str:
    if "://" not in url or "@" not in url:
        return url
    if "%40" in url or "%3A" in url or "%2F" in url:
        return url

    prefix, tail = url.split("://", 1)
    credentials, _, rest = tail.rpartition("@")
    if ":" not in credentials:
        return url
    username, password = credentials.split(":", 1)
    return f"{prefix}://{username}:{quote_plus(password)}@{rest}"


def build_api_url(base_url: str, gateway_prefix: str, path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    normalized_path = path if path.startswith("/") else f"/{path}"
    if normalized_path.startswith("/iuap-api-"):
        return f"{base_url}{normalized_path}"
    if normalized_path.startswith(gateway_prefix):
        return f"{base_url}{normalized_path}"
    return f"{base_url}{gateway_prefix}{normalized_path}"


def extract_items(payload: Dict[str, Any], list_paths: Sequence[str]) -> List[Dict[str, Any]]:
    for path in list_paths:
        value = get_by_path(payload, path)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if path == "data" and isinstance(value, dict):
            for nested_key in ("recordList", "rows", "list", "items"):
                nested_value = value.get(nested_key)
                if isinstance(nested_value, list):
                    return [item for item in nested_value if isinstance(item, dict)]
    return []


def extract_total_count(payload: Dict[str, Any]) -> Optional[int]:
    for path in ("data.recordCount", "data.totalCount", "data.total", "recordCount", "totalCount", "total"):
        value = get_by_path(payload, path)
        if value in (None, ""):
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def apply_date_to_filters(filters: Dict[str, Any], biz_date: date) -> Dict[str, Any]:
    def replace(value: Any) -> Any:
        if isinstance(value, str):
            return (
                value.replace("{biz_date}", biz_date.strftime("%Y-%m-%d"))
                .replace("{biz_datetime_start}", f"{biz_date:%Y-%m-%d} 00:00:00")
                .replace("{biz_datetime_end}", f"{biz_date:%Y-%m-%d} 23:59:59")
            )
        if isinstance(value, dict):
            return {k: replace(v) for k, v in value.items()}
        if isinstance(value, list):
            return [replace(v) for v in value]
        return value

    return replace(filters)


def transform_inventory_rows(
    rows: Iterable[Dict[str, Any]],
    *,
    snapshot_date: date,
    captured_at: datetime,
) -> List[Dict[str, Any]]:
    transformed: List[Dict[str, Any]] = []
    for row in rows:
        material_id = coalesce(row, ("product", "details_product", "product_code", "product_cCode"))
        sku_id = coalesce(row, ("productsku", "details_productsku", "productsku_code", "productsku_cCode"))

        transformed.append(
            {
                "snapshot_date": snapshot_date,
                "captured_at": captured_at,
                "stock_org_id": coalesce(row, ("org", "stockOrg", "org_code", "stockOrg_code")),
                "stock_org_name": coalesce(row, ("org_name", "stockOrg_name")),
                "warehouse_id": coalesce(row, ("warehouse", "warehouse_id", "warehouse_code")),
                "warehouse_name": coalesce(row, ("warehouse_name",)),
                "material_id": material_id,
                "material_code": coalesce(row, ("product_code", "product_cCode", "material_code"), material_id),
                "material_name": coalesce(row, ("product_name", "product_cName", "material_name")),
                "sku_id": sku_id,
                "sku_code": coalesce(row, ("productsku_code", "productsku_cCode", "sku_code"), sku_id),
                "sku_name": coalesce(row, ("productsku_name", "productsku_cName", "sku_name")),
                "unit_name": coalesce(row, ("unit", "unitName", "stockUnit_name")),
                "batch_no": coalesce(row, ("batchno", "batch_no")),
                "stock_status_id": coalesce(row, ("stockStatusDoc",)),
                "store_id": coalesce(row, ("store",)),
                "current_qty": to_decimal(get_by_path(row, "currentqty")),
                "available_qty": to_decimal(get_by_path(row, "availableqty")),
                "plan_available_qty": to_decimal(get_by_path(row, "planavailableqty")),
                "incoming_notice_qty": to_decimal(get_by_path(row, "innoticeqty")),
                "source_pubts": coalesce(row, ("pubts", "source_pubts")),
            }
        )
    return transformed


def build_sales_source_row_key(row: Dict[str, Any]) -> str:
    for candidate in (
        coalesce(row, ("details_id",)),
        coalesce(row, ("barCode",)),
        coalesce(row, ("id",)),
    ):
        if candidate:
            return candidate

    fallback = "|".join(
        [
            coalesce(row, ("code",)),
            coalesce(row, ("lineno",)),
            coalesce(row, ("details_product", "product", "product_cCode")),
            coalesce(row, ("details_productsku", "productsku", "productsku_cCode")),
            str(get_by_path(row, "qty") or ""),
            coalesce(row, ("pubts",)),
        ]
    )
    if not fallback.strip("|"):
        fallback = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(fallback.encode("utf-8")).hexdigest()


def transform_sales_raw_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    transformed: List[Dict[str, Any]] = []

    for row in rows:
        vouch_dt = parse_datetime(coalesce(row, ("vouchdate", "createTime", "createDate", "modifyTime")))
        if vouch_dt is None:
            continue

        material_id = coalesce(row, ("details_product", "product", "product_cCode"))
        sku_id = coalesce(row, ("details_productsku", "productsku", "productsku_cCode"))
        transformed.append(
            {
                "biz_date": vouch_dt.date(),
                "source_row_key": build_sales_source_row_key(row),
                "source_doc_id": coalesce(row, ("id",)),
                "source_line_id": coalesce(row, ("details_id",)),
                "source_code": coalesce(row, ("code",)),
                "source_lineno": coalesce(row, ("lineno",)),
                "source_bar_code": coalesce(row, ("barCode",)),
                "source_bustype": coalesce(row, ("bustype",)),
                "source_bustype_name": coalesce(row, ("bustype_name",)),
                "source_vouchdate": vouch_dt,
                "source_create_time": parse_datetime(coalesce(row, ("createTime", "createDate"))),
                "source_pubts": coalesce(row, ("pubts",)),
                "stock_org_id": coalesce(row, ("org", "stockOrg")),
                "stock_org_name": coalesce(row, ("org_name", "stockOrg_name")),
                "sales_org_id": coalesce(row, ("salesOrg", "salesOrg_id")),
                "sales_org_name": coalesce(row, ("salesOrg_name",)),
                "warehouse_id": coalesce(row, ("warehouse", "warehouse_id")),
                "warehouse_name": coalesce(row, ("warehouse_name",)),
                "customer_id": coalesce(row, ("cust",)),
                "customer_name": coalesce(row, ("cust_name",)),
                "material_id": material_id,
                "material_code": coalesce(row, ("product_cCode", "product_code"), material_id),
                "material_name": coalesce(row, ("product_cName", "product_name")),
                "sku_id": sku_id,
                "sku_code": coalesce(row, ("productsku_cCode", "productsku_code"), sku_id),
                "sku_name": coalesce(row, ("productsku_cName", "productsku_name")),
                "unit_name": coalesce(row, ("unitName", "stockUnit_name", "unit_name", "unit")),
                "qty": to_decimal(get_by_path(row, "qty")),
                "price_qty": to_decimal(get_by_path(row, "priceQty")),
                "sub_qty": to_decimal(get_by_path(row, "subQty")),
                "ori_sum": to_decimal(get_by_path(row, "oriSum")),
                "nat_sum": to_decimal(get_by_path(row, "natSum")),
                "ori_money": to_decimal(get_by_path(row, "oriMoney")),
                "nat_money": to_decimal(get_by_path(row, "natMoney")),
                "ori_tax": to_decimal(get_by_path(row, "oriTax")),
                "nat_tax": to_decimal(get_by_path(row, "natTax")),
                "tax_rate": to_decimal(get_by_path(row, "taxRate")),
                "raw_json": json.dumps(row, ensure_ascii=False, sort_keys=True, default=str),
            }
        )

    return transformed


class YonyouOpenApiClient:
    def __init__(self, config: YonyouConfig, logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.session = requests.Session()
        self.access_token: Optional[str] = None
        self.token_expires_at: float = 0.0

    def _generate_signature(self, params: Dict[str, str]) -> str:
        sorted_items = sorted((key, value) for key, value in params.items() if key != "signature")
        signing_string = "".join(f"{key}{value}" for key, value in sorted_items)
        digest = hmac.new(
            self.config.app_secret.encode("utf-8"),
            signing_string.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("utf-8")

    def get_access_token(self, force_refresh: bool = False) -> str:
        if (
            not force_refresh
            and self.access_token
            and time.time() < self.token_expires_at - self.config.token_refresh_skew_seconds
        ):
            return self.access_token

        timestamp = str(int(time.time() * 1000))
        params = {
            "appKey": self.config.app_key,
            "timestamp": timestamp,
        }
        if self.config.tenant_id:
            params["tenantId"] = self.config.tenant_id
        params["signature"] = self._generate_signature(params)

        auth_url = build_api_url(self.config.base_url, self.config.gateway_prefix, self.config.auth_path)
        response = self.session.get(
            auth_url,
            params=params,
            timeout=self.config.request_timeout_seconds,
            verify=self.config.verify_ssl,
            headers={"User-Agent": "FinvisPy-InventorySync/1.0"},
        )
        response.raise_for_status()

        payload = response.json()
        code = str(payload.get("code", ""))
        if code not in SUCCESS_CODES:
            raise YonyouApiError(f"Failed to get access token: {payload}")

        data = payload.get("data", {}) or {}
        access_token = data.get("access_token") or data.get("accessToken")
        if not access_token:
            raise YonyouApiError(f"Access token missing in response: {payload}")

        expire_seconds = int(data.get("expire") or data.get("expiresIn") or 7200)
        self.access_token = str(access_token)
        self.token_expires_at = time.time() + expire_seconds
        self.logger.info("Yonyou access_token refreshed successfully.")
        return self.access_token

    def post_json(
        self,
        path: str,
        body: Dict[str, Any],
        *,
        access_token_mode: str = "query",
        retry_on_unauthorized: bool = True,
    ) -> Dict[str, Any]:
        url = build_api_url(self.config.base_url, self.config.gateway_prefix, path)
        token = self.get_access_token()

        request_body = copy.deepcopy(body)
        query_params: Dict[str, Any] = {}

        if access_token_mode in {"query", "both"}:
            query_params["access_token"] = token
        if access_token_mode in {"body", "both"}:
            request_body["access_token"] = token

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "FinvisPy-InventorySync/1.0",
        }

        for attempt in range(1, self.config.max_retries + 1):
            try:
                response = self.session.post(
                    url,
                    json=request_body,
                    params=query_params,
                    headers=headers,
                    timeout=self.config.request_timeout_seconds,
                    verify=self.config.verify_ssl,
                )
                if response.status_code == 401 and retry_on_unauthorized:
                    self.logger.warning("Yonyou token expired during request; refreshing token and retrying once.")
                    self.get_access_token(force_refresh=True)
                    return self.post_json(path, body, access_token_mode=access_token_mode, retry_on_unauthorized=False)
                response.raise_for_status()
                payload = response.json()
                code = str(payload.get("code", ""))
                if code and code not in SUCCESS_CODES:
                    raise YonyouApiError(f"Yonyou API returned failure: {payload}")
                return payload
            except (requests.RequestException, ValueError, YonyouApiError) as exc:
                if attempt >= self.config.max_retries:
                    raise YonyouApiError(f"Request to {path} failed after {attempt} attempts: {exc}") from exc
                sleep_seconds = attempt * 2
                self.logger.warning(
                    "Request to %s failed on attempt %s: %s. Retrying in %ss.",
                    path,
                    attempt,
                    exc,
                    sleep_seconds,
                )
                time.sleep(sleep_seconds)

        raise YonyouApiError(f"Unexpected retry exit for {path}")

    def fetch_inventory_rows(self, biz_date: Optional[date] = None) -> List[Dict[str, Any]]:
        filters = self.config.inventory.filters
        if biz_date:
            filters = apply_date_to_filters(filters, biz_date)
        payload = self.post_json(
            self.config.inventory.path,
            filters,
            access_token_mode=self.config.inventory.access_token_mode,
        )
        return extract_items(payload, self.config.inventory.result_list_paths)

    def fetch_sales_rows(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        page = 1
        page_size = self.config.salesout.page_size
        all_rows: List[Dict[str, Any]] = []

        while True:
            # Remove empty-string filters. For sales API, empty values are treated
            # as strict conditions and may cause zero rows.
            body = {
                key: value
                for key, value in self.config.salesout.filters.items()
                if value not in ("", None)
            }
            body["pageIndex"] = page
            body["pageSize"] = page_size
            body["vouchdate"] = f"{start_date:%Y-%m-%d}|{end_date:%Y-%m-%d} 23:59:59"
            try:
                payload = self.post_json(
                    self.config.salesout.path,
                    body,
                    access_token_mode=self.config.salesout.access_token_mode,
                )
            except YonyouApiError as exc:
                if "429" in str(exc):
                    wait_seconds = min(300, max(15, page // 2))
                    self.logger.warning(
                        "Sales API rate limited at page %s for %s~%s. Sleep %ss then retry same page.",
                        page,
                        start_date,
                        end_date,
                        wait_seconds,
                    )
                    time.sleep(wait_seconds)
                    continue
                raise
            rows = extract_items(payload, self.config.salesout.result_list_paths)
            if not rows:
                break

            all_rows.extend(rows)
            total_count = extract_total_count(payload)
            self.logger.info("Fetched salesout page %s with %s rows.", page, len(rows))

            if total_count is not None and page * page_size >= total_count:
                break
            if len(rows) < page_size:
                break
            if self.config.salesout.page_sleep_seconds > 0:
                time.sleep(self.config.salesout.page_sleep_seconds)
            page += 1

        return all_rows


class DatabaseWriter:
    def __init__(self, url: str):
        self.engine = create_engine(
            quote_mysql_url(url),
            pool_pre_ping=True,
            future=True,
        )
        self.session_factory = sessionmaker(bind=self.engine, future=True)

    def init_schema(self) -> None:
        Base.metadata.create_all(self.engine)
        ensure_sales_processing_schema(self.engine)
        ensure_inventory_processing_schema(self.engine)

    def session(self) -> Session:
        return self.session_factory()

    def upsert_inventory_rows(self, rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        with self.session() as session:
            upsert_rows(session, InventorySnapshotDaily, rows)
            session.commit()
        return len(rows)

    def upsert_sales_rows(self, rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        with self.session() as session:
            upsert_rows(session, MaterialSalesDaily, rows)
            session.commit()
        return len(rows)

    def refresh_sales_cleaning(self, start_date: date | None = None, end_date: date | None = None) -> int:
        return refresh_sales_cleaning(self.engine, start_date=start_date, end_date=end_date)

    def refresh_inventory_cleaning(self, start_date: date | None = None, end_date: date | None = None) -> int:
        return refresh_inventory_cleaning(self.engine, start_date=start_date, end_date=end_date)


class InventorySyncService:
    def __init__(self, config: AppConfig, logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.client = YonyouOpenApiClient(config.yonyou, logger)
        self.db = DatabaseWriter(config.database.url)

    def run_once(
        self,
        *,
        mode: str,
        snapshot_date: date,
        sales_start_date: date,
        sales_end_date: date,
        dry_run: bool,
        init_db: bool = True,
    ) -> Dict[str, int]:
        if not dry_run and init_db:
            self.db.init_schema()

        results = {
            "inventory_raw": 0,
            "inventory_saved": 0,
            "inventory_cleaned": 0,
            "sales_raw": 0,
            "sales_saved": 0,
            "sales_cleaned": 0,
        }

        if mode in {"all", "inventory"}:
            captured_at = datetime.now()
            inventory_rows = self.client.fetch_inventory_rows(snapshot_date)
            transformed_inventory = transform_inventory_rows(
                inventory_rows,
                snapshot_date=snapshot_date,
                captured_at=captured_at,
            )
            results["inventory_raw"] = len(inventory_rows)
            if not dry_run:
                results["inventory_saved"] = self.db.upsert_inventory_rows(transformed_inventory)
                results["inventory_cleaned"] = self.db.refresh_inventory_cleaning(snapshot_date, snapshot_date)
            self.logger.info(
                "Inventory snapshot completed. raw_rows=%s saved_rows=%s cleaned_rows=%s snapshot_date=%s",
                results["inventory_raw"],
                results["inventory_saved"],
                results["inventory_cleaned"],
                snapshot_date,
            )

        if mode in {"all", "sales"}:
            sales_rows = self.client.fetch_sales_rows(sales_start_date, sales_end_date)
            transformed_sales = transform_sales_raw_rows(sales_rows)
            results["sales_raw"] = len(sales_rows)
            if not dry_run:
                results["sales_saved"] = self.db.upsert_sales_rows(transformed_sales)
                results["sales_cleaned"] = self.db.refresh_sales_cleaning(sales_start_date, sales_end_date)
            self.logger.info(
                "Sales sync completed. raw_rows=%s transformed_rows=%s saved_rows=%s cleaned_rows=%s date_range=%s~%s",
                results["sales_raw"],
                len(transformed_sales),
                results["sales_saved"],
                results["sales_cleaned"],
                sales_start_date,
                sales_end_date,
            )

        return results

    def run_backfill(
        self,
        *,
        mode: str,
        start_date: date,
        end_date: date,
        dry_run: bool,
        sleep_seconds: int = 1,
    ) -> Dict[str, int]:
        if not dry_run:
            self.db.init_schema()

        totals = {
            "inventory_raw": 0,
            "inventory_saved": 0,
            "inventory_cleaned": 0,
            "sales_raw": 0,
            "sales_saved": 0,
            "sales_cleaned": 0,
        }

        current = start_date
        while current <= end_date:
            self.logger.info("Backfill date %s", current)
            attempt = 0
            while True:
                try:
                    day_result = self.run_once(
                        mode=mode,
                        snapshot_date=current,
                        sales_start_date=current,
                        sales_end_date=current,
                        dry_run=dry_run,
                        init_db=False,
                    )
                    break
                except YonyouApiError as exc:
                    attempt += 1
                    if "429" not in str(exc):
                        raise
                    wait_seconds = min(300, 5 * attempt)
                    self.logger.warning("Rate limited for %s. Sleep %ss then retry.", current, wait_seconds)
                    time.sleep(wait_seconds)
            for key in totals:
                totals[key] += day_result.get(key, 0)
            current += timedelta(days=1)
            if sleep_seconds > 0 and current <= end_date:
                time.sleep(sleep_seconds)

        return totals


def default_dates_from_job(job_config: JobConfig) -> Tuple[date, date, date]:
    today = date.today()
    sales_end = today - timedelta(days=job_config.sales_days_behind)
    sales_start = sales_end - timedelta(days=max(job_config.sales_window_days - 1, 0))
    snapshot_date = today - timedelta(days=job_config.snapshot_days_behind)
    return snapshot_date, sales_start, sales_end


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Daily Yonyou ERP inventory and sales sync job.")
    parser.add_argument("--config", default="config/yonyou_inventory_sync.example.yaml", help="Path to YAML config file.")
    parser.add_argument("--mode", choices=("all", "inventory", "sales"), default="all", help="Sync inventory only, sales only, or both.")
    parser.add_argument("--snapshot-date", type=parse_date_arg, help="Inventory snapshot date.")
    parser.add_argument("--sales-start-date", type=parse_date_arg, help="Sales business start date.")
    parser.add_argument("--sales-end-date", type=parse_date_arg, help="Sales business end date.")
    parser.add_argument("--backfill-start-date", type=parse_date_arg, help="Backfill start date.")
    parser.add_argument("--backfill-end-date", type=parse_date_arg, help="Backfill end date.")
    parser.add_argument("--backfill-sleep-seconds", type=int, default=1, help="Sleep seconds between backfill days.")
    parser.add_argument("--cron", help="Optional crontab expression like '0 2 * * *'.")
    parser.add_argument("--dry-run", action="store_true", help="Call API and aggregate data without writing to MySQL.")
    return parser


def resolve_run_dates(args: argparse.Namespace, job_config: JobConfig) -> Tuple[date, date, date]:
    default_snapshot_date, default_sales_start, default_sales_end = default_dates_from_job(job_config)
    snapshot_date = args.snapshot_date or default_snapshot_date
    sales_start_date = args.sales_start_date or default_sales_start
    sales_end_date = args.sales_end_date or default_sales_end

    if sales_start_date > sales_end_date:
        raise ValueError("sales-start-date cannot be later than sales-end-date.")
    return snapshot_date, sales_start_date, sales_end_date


def main() -> int:
    args = build_arg_parser().parse_args()
    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = PROJECT_ROOT / config_path
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    config = load_config(config_path)
    logger = build_logger(config.logging)
    service = InventorySyncService(config, logger)

    def run_job() -> None:
        snapshot_date, sales_start_date, sales_end_date = resolve_run_dates(args, config.job)
        logger.info(
            "Starting sync job. mode=%s snapshot_date=%s sales_start_date=%s sales_end_date=%s dry_run=%s",
            args.mode,
            snapshot_date,
            sales_start_date,
            sales_end_date,
            args.dry_run,
        )
        service.run_once(
            mode=args.mode,
            snapshot_date=snapshot_date,
            sales_start_date=sales_start_date,
            sales_end_date=sales_end_date,
            dry_run=args.dry_run,
        )

    manual_dates_requested = any(
        value is not None
        for value in (
            args.snapshot_date,
            args.sales_start_date,
            args.sales_end_date,
            args.backfill_start_date,
            args.backfill_end_date,
        )
    )
    cron_expression = args.cron if args.cron is not None else config.job.cron
    if manual_dates_requested and args.cron is None:
        cron_expression = None
    if args.backfill_start_date or args.backfill_end_date:
        if not args.backfill_start_date or not args.backfill_end_date:
            raise ValueError("Both --backfill-start-date and --backfill-end-date are required.")
        logger.info(
            "Starting backfill. mode=%s start_date=%s end_date=%s dry_run=%s",
            args.mode,
            args.backfill_start_date,
            args.backfill_end_date,
            args.dry_run,
        )
        service.run_backfill(
            mode=args.mode,
            start_date=args.backfill_start_date,
            end_date=args.backfill_end_date,
            dry_run=args.dry_run,
            sleep_seconds=args.backfill_sleep_seconds,
        )
        if not cron_expression:
            return 0

    if cron_expression:
        scheduler = BlockingScheduler()
        scheduler.add_job(run_job, CronTrigger.from_crontab(cron_expression))
        logger.info("Scheduler started with cron expression: %s", cron_expression)
        run_job()
        scheduler.start()
        return 0

    run_job()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s - %(message)s")
        logging.getLogger("yonyou_inventory_sync").exception("Sync job failed: %s", exc)
        raise
