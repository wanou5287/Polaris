from __future__ import annotations

import copy
import hashlib
import hmac
import json
import os
import secrets
import time
from base64 import b64decode, urlsafe_b64decode, urlsafe_b64encode
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Sequence, Tuple
from urllib.parse import quote

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy import create_engine, text

from scripts.yonyou_inventory_sync import (
    refresh_inventory_cleaning,
    ensure_inventory_processing_schema,
    ensure_sales_processing_schema,
    quote_mysql_url,
    save_return_unpack_attendance,
)


router = APIRouter()
engine = None
schema_ready = False
project_root = Path(__file__).resolve().parents[2]
dashboard_users_config_path = project_root / "config" / "bi_dashboard_users.local.yaml"
DASHBOARD_SESSION_COOKIE = "finvis_bi_session"
DASHBOARD_SESSION_MAX_AGE = 60 * 60 * 24 * 14
DASHBOARD_DEFAULT_PATH = "/financial/bi-dashboard"
PREFERRED_SALES_VIEW_NAME = "销售/退货看板"
PREFERRED_SALES_VIEW_DESCRIPTION = "基于销售清洗表预置的销售与退货经营看板"
PREFERRED_INVENTORY_VIEW_NAME = "库存清洗看板"
PREFERRED_INVENTORY_VIEW_DESCRIPTION = "基于库存清洗表预置的库存结构与明细看板"

WIDGET_TYPES: Dict[str, str] = {
    "metric": "指标卡",
    "bar": "柱状图",
    "stacked_bar": "堆积柱状图",
    "stacked_hbar": "堆积条形图",
    "line": "折线图",
    "pie": "饼图",
    "table": "表格",
    "ranking": "排行榜",
    "text": "文本",
}
AGGREGATION_ORDER = ("sum", "avg", "max", "min", "median", "count")
AGGREGATION_LABELS: Dict[str, str] = {
    "sum": "求和",
    "avg": "平均值",
    "max": "最大值",
    "min": "最小值",
    "median": "中位数",
    "count": "计数",
}
AGGREGATIONS = {"sum", "avg", "max", "min", "median", "count"}
FILTER_OPERATOR_ORDER = ("eq", "ne", "gt", "gte", "lt", "lte", "like", "in", "between")
FILTER_OPERATOR_LABELS: Dict[str, str] = {
    "eq": "等于",
    "ne": "不等于",
    "gt": "大于",
    "gte": "大于等于",
    "lt": "小于",
    "lte": "小于等于",
    "like": "包含",
    "in": "属于",
    "between": "区间",
}
FILTER_OPERATORS = {"eq", "ne", "gt", "gte", "lt", "lte", "like", "in", "between"}
SORT_DIRECTIONS = {"asc", "desc"}
LAYOUT_SPANS = {1, 2}
LAYOUT_HEIGHTS = {"compact", "normal", "tall"}
GRID_COLUMNS = 24
GRID_MIN_WIDTH = 2
GRID_MAX_WIDTH = 24
GRID_MIN_HEIGHT = 3
GRID_MAX_HEIGHT = 12

DATASETS: Dict[str, Dict[str, Any]] = {
    "inventory": {
        "label": "现存量明细",
        "table": "bi_inventory_snapshot_daily",
        "date_col": "snapshot_date",
        "fields": {
            "snapshot_date": {"label": "日期", "type": "date", "groupable": True, "filterable": True, "sortable": True},
            "stock_org_name": {"label": "库存组织", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "warehouse_name": {"label": "仓库", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_code": {"label": "物料编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_name": {"label": "物料名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sku_code": {"label": "SKU编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sku_name": {"label": "SKU名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "batch_no": {"label": "批号", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "unit_name": {"label": "单位", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "current_qty": {"label": "当前库存", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "available_qty": {"label": "可用库存", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "plan_available_qty": {"label": "计划可用库存", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "incoming_notice_qty": {"label": "在途通知数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
        },
    },
    "inventory_cleaning": {
        "label": "库存清洗明细",
        "table": "bi_inventory_snapshot_daily_cleaning",
        "date_col": "snapshot_date",
        "fields": {
            "snapshot_date": {"label": "日期", "type": "date", "groupable": True, "filterable": True, "sortable": True},
            "warehouse_name_clean": {"label": "仓库", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_code": {"label": "物料编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_name": {"label": "物料名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "stock_status_name": {"label": "物料状态", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "qty": {"label": "数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "source_row_count": {"label": "原始聚合行数", "type": "number", "numeric": True, "filterable": True, "sortable": True},
        },
    },
    "sales": {
        "label": "销售出库原始明细",
        "table": "bi_material_sales_daily",
        "date_col": "biz_date",
        "fields": {
            "biz_date": {"label": "日期", "type": "date", "groupable": True, "filterable": True, "sortable": True},
            "source_code": {"label": "单据编号", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "source_lineno": {"label": "行号", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "source_bustype_name": {"label": "业务类型", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "source_vouchdate": {"label": "单据时间", "type": "date", "groupable": True, "filterable": True, "sortable": True},
            "stock_org_name": {"label": "库存组织", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sales_org_name": {"label": "销售组织", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "warehouse_name": {"label": "仓库", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "customer_name": {"label": "客户", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_code": {"label": "物料编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_name": {"label": "物料名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sku_code": {"label": "SKU编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sku_name": {"label": "SKU名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "unit_name": {"label": "单位", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "qty": {"label": "原始数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "price_qty": {"label": "计价数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "sub_qty": {"label": "辅数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "ori_sum": {"label": "原币价税合计", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "nat_sum": {"label": "本币价税合计", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "ori_money": {"label": "原币金额", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "nat_money": {"label": "本币金额", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "ori_tax": {"label": "原币税额", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "nat_tax": {"label": "本币税额", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "tax_rate": {"label": "税率", "type": "number", "numeric": True, "filterable": True, "sortable": True},
        },
    },
    "sales_cleaning": {
        "label": "销售清洗明细",
        "table": "bi_material_sales_daily_cleaning",
        "date_col": "biz_date",
        "fields": {
            "biz_date": {"label": "日期", "type": "date", "groupable": True, "filterable": True, "sortable": True},
            "material_code": {"label": "物料编码", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "material_name": {"label": "物料名称", "type": "string", "groupable": True, "filterable": True, "sortable": True},
            "sales_out_xiaoshan": {"label": "销售出库（萧山云仓）", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "sales_out_yuhang": {"label": "销售出库（余杭云仓）", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "transit_intercept_xiaoshan": {"label": "在途拦截（萧山云仓）", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "transit_intercept_yuhang": {"label": "在途拦截（余杭云仓）", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "sales_return_warehouse": {"label": "销售退货（销退仓）", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "return_unpack_attendance": {"label": "退货拆包出勤人数", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "return_unpack_efficiency": {"label": "退货拆包人效", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "total_return_qty": {"label": "当日总退货数量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
            "total_sales_qty": {"label": "当日总销量", "type": "number", "numeric": True, "filterable": True, "sortable": True},
        },
    },
}


def load_dashboard_auth_config() -> Dict[str, Any]:
    if not dashboard_users_config_path.exists():
        return {}
    try:
        raw = yaml.safe_load(dashboard_users_config_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def load_dashboard_users() -> Dict[str, str]:
    fallback = {
        os.getenv("BI_DASH_USERNAME", "bi_admin"): os.getenv("BI_DASH_PASSWORD", "ChangeMe123!"),
    }
    raw = load_dashboard_auth_config()
    users: Dict[str, str] = {}
    for item in raw.get("users", []):
        if not isinstance(item, dict):
            continue
        username = str(item.get("username") or "").strip()
        password = str(item.get("password") or "")
        if username and password:
            users[username] = password
    return users or fallback


def dashboard_session_secret() -> str:
    raw = load_dashboard_auth_config()
    configured = str(((raw.get("settings") or {}).get("session_secret")) or os.getenv("BI_DASH_SESSION_SECRET") or "").strip()
    if configured:
        return configured
    seed = f"{project_root}|{os.getenv('BI_DASH_USERNAME', 'bi_admin')}|finvis-bi-session"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def authenticate_dashboard_user(username: str, password: str) -> str | None:
    expected = load_dashboard_users().get(username)
    if expected and secrets.compare_digest(password, expected):
        return username
    return None


def create_dashboard_session(username: str, max_age: int = DASHBOARD_SESSION_MAX_AGE) -> str:
    expires_at = int(time.time()) + max_age
    payload = f"{username}|{expires_at}"
    encoded = urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(
        dashboard_session_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded}.{signature}"


def parse_dashboard_session(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    encoded, signature = token.rsplit(".", 1)
    try:
        padding = "=" * (-len(encoded) % 4)
        payload = urlsafe_b64decode(f"{encoded}{padding}".encode("ascii")).decode("utf-8")
        username, expires_at_text = payload.split("|", 1)
        expires_at = int(expires_at_text)
    except Exception:
        return None
    expected_signature = hmac.new(
        dashboard_session_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not secrets.compare_digest(signature, expected_signature):
        return None
    if expires_at < int(time.time()):
        return None
    if username not in load_dashboard_users():
        return None
    return username


def parse_basic_auth(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.startswith("Basic "):
        return None
    try:
        decoded = b64decode(auth_header.split(" ", 1)[1]).decode("utf-8")
        username, password = decoded.split(":", 1)
    except Exception:
        return None
    return authenticate_dashboard_user(username, password)


def current_dashboard_user(request: Request) -> str | None:
    session_user = parse_dashboard_session(request.cookies.get(DASHBOARD_SESSION_COOKIE))
    if session_user:
        return session_user
    return parse_basic_auth(request)


def require_auth(request: Request) -> str:
    username = current_dashboard_user(request)
    if username:
        return username
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登录或会话已失效",
        headers={"WWW-Authenticate": "Basic"},
    )


def sanitize_next_path(raw_value: str | None) -> str:
    candidate = str(raw_value or "").strip()
    if not candidate.startswith("/") or candidate.startswith("//"):
        return DASHBOARD_DEFAULT_PATH
    return candidate


def render_template(template_name: str, replacements: Dict[str, str] | None = None) -> str:
    template_path = Path(__file__).resolve().parents[1] / "templates" / template_name
    content = template_path.read_text(encoding="utf-8")
    for key, value in (replacements or {}).items():
        content = content.replace(key, value)
    return content


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_loads(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if value in (None, ""):
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def to_plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def to_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(str(value))
    except Exception:
        return None


def parse_date_or_none(raw_value: str | None) -> date | None:
    if not raw_value:
        return None
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"日期格式无效：{raw_value}") from exc


def parse_decimal_or_raise(raw_value: Any, field_name: str) -> Decimal:
    if raw_value in (None, ""):
        raise HTTPException(status_code=400, detail=f"{field_name}不能为空")
    try:
        value = Decimal(str(raw_value).strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field_name}格式无效") from exc
    if value < 0:
        raise HTTPException(status_code=400, detail=f"{field_name}不能为负数")
    return value


def parse_int_or_default(raw_value: Any, default: int = 0) -> int:
    try:
        return int(str(raw_value).strip())
    except Exception:
        return default


def normalize_inventory_mapping_payload(
    rows: Sequence[Dict[str, Any]] | None,
    *,
    mapping_type: str,
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(rows or []):
        if not isinstance(item, dict):
            continue
        normalized_item = {
            "id": parse_int_or_default(item.get("id"), 0),
            "sort_order": max(0, parse_int_or_default(item.get("sort_order"), (index + 1) * 10)),
            "is_enabled": 1 if bool(item.get("is_enabled", True)) else 0,
        }
        if mapping_type == "warehouse":
            source_name = str(item.get("source_warehouse_name") or "").strip()
            clean_name = str(item.get("warehouse_name_clean") or "").strip()
            if not source_name and not clean_name:
                continue
            if not source_name or not clean_name:
                raise HTTPException(status_code=400, detail="仓库映射的原始仓库和清洗后仓库都不能为空")
            if source_name in seen:
                raise HTTPException(status_code=400, detail=f"仓库映射重复：{source_name}")
            seen.add(source_name)
            normalized_item.update(
                {
                    "source_warehouse_name": source_name,
                    "warehouse_name_clean": clean_name,
                }
            )
        elif mapping_type == "status":
            stock_status_id = str(item.get("stock_status_id") or "").strip()
            stock_status_name = str(item.get("stock_status_name") or "").strip()
            if not stock_status_id and not stock_status_name:
                continue
            if not stock_status_id or not stock_status_name:
                raise HTTPException(status_code=400, detail="库存状态映射的状态ID和状态名称都不能为空")
            if stock_status_id in seen:
                raise HTTPException(status_code=400, detail=f"库存状态映射重复：{stock_status_id}")
            seen.add(stock_status_id)
            normalized_item.update(
                {
                    "stock_status_id": stock_status_id,
                    "stock_status_name": stock_status_name,
                }
            )
        else:
            raise ValueError(mapping_type)
        normalized.append(normalized_item)
    return normalized


def metric_label(dataset: str, field: str, agg: str) -> str:
    if agg == "count" and field == "*":
        return AGGREGATION_LABELS["count"]
    field_label = DATASETS[dataset]["fields"].get(field, {}).get("label", field)
    return f"{field_label}{AGGREGATION_LABELS.get(agg, agg)}"


def ordered_keys(values: Sequence[str] | set[str], preferred_order: Sequence[str]) -> List[str]:
    value_set = set(values)
    return [item for item in preferred_order if item in value_set]


def default_dimensions(widget_type: str) -> List[str]:
    return [] if widget_type in {"metric", "text"} else ["material_name"]


def supports_series_field(widget_type: str) -> bool:
    return widget_type in {"bar", "stacked_bar", "stacked_hbar", "line"}


def default_series_field(dataset: str, widget_type: str) -> str:
    if not supports_series_field(widget_type):
        return ""
    if dataset == "inventory_cleaning" and widget_type in {"stacked_bar", "stacked_hbar"}:
        return "stock_status_name" if "stock_status_name" in DATASETS[dataset]["fields"] else ""
    return ""


def default_metrics(dataset: str, widget_type: str) -> List[Dict[str, Any]]:
    if dataset == "sales":
        return [{"field": "qty", "agg": "sum", "label": "原始数量"}]
    if dataset == "inventory_cleaning":
        return [{"field": "qty", "agg": "sum", "label": "数量"}]
    if dataset == "sales_cleaning":
        if widget_type in {"stacked_bar", "stacked_hbar"}:
            return [
                {"field": "sales_out_xiaoshan", "agg": "sum", "label": "销售出库（萧山云仓）"},
                {"field": "sales_out_yuhang", "agg": "sum", "label": "销售出库（余杭云仓）"},
            ]
        return [{"field": "total_sales_qty", "agg": "sum", "label": "当日总销量"}]
    if widget_type in {"stacked_bar", "stacked_hbar"}:
        return [
            {"field": "current_qty", "agg": "sum", "label": "当前库存"},
            {"field": "available_qty", "agg": "sum", "label": "可用库存"},
        ]
    return [{"field": "current_qty", "agg": "sum", "label": "当前库存"}]


def default_layout() -> Dict[str, Any]:
    return {"x": 0, "y": 0, "w": 12, "h": 5, "span": 1, "height": "normal"}


def height_to_rows(height: str) -> int:
    return {"compact": 4, "normal": 5, "tall": 7}.get(height, 5)


def rows_to_height(rows: int) -> str:
    if rows >= 7:
        return "tall"
    if rows <= 4:
        return "compact"
    return "normal"


def default_widget_config(widget_type: str, dataset: str) -> Dict[str, Any]:
    return {
        "dataset": dataset,
        "dimensions": default_dimensions(widget_type),
        "series_field": default_series_field(dataset, widget_type),
        "metrics": default_metrics(dataset, widget_type),
        "date_filter": {"mode": "follow_page", "date": "", "start_date": "", "end_date": ""},
        "filters": [],
        "sort": [{"field": "metric_0", "direction": "desc"}],
        "limit": 20,
        "text_content": "请输入说明文本",
    }


def preset_sales_view_widgets() -> List[Dict[str, Any]]:
    dataset = "sales_cleaning"
    return [
        {
            "title": "当日总销量",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "total_sales_qty", "agg": "sum", "label": "当日总销量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 0, "y": 0, "w": 6, "h": 4},
            "sort_order": 0,
        },
        {
            "title": "当日总退货数量",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "total_return_qty", "agg": "sum", "label": "当日总退货数量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 6, "y": 0, "w": 6, "h": 4},
            "sort_order": 10,
        },
        {
            "title": "退货拆包出勤人数",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "return_unpack_attendance", "agg": "max", "label": "退货拆包出勤人数"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 12, "y": 0, "w": 6, "h": 4},
            "sort_order": 20,
        },
        {
            "title": "退货拆包人效",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "return_unpack_efficiency", "agg": "sum", "label": "退货拆包人效"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 18, "y": 0, "w": 6, "h": 4},
            "sort_order": 30,
        },
        {
            "title": "当日销售出库分仓 TOP10",
            "widget_type": "stacked_bar",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "metrics": [
                    {"field": "sales_out_xiaoshan", "agg": "sum", "label": "销售出库（萧山云仓）"},
                    {"field": "sales_out_yuhang", "agg": "sum", "label": "销售出库（余杭云仓）"},
                ],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 10,
            },
            "layout": {"x": 0, "y": 4, "w": 12, "h": 6},
            "sort_order": 100,
        },
        {
            "title": "当日在途拦截分仓 TOP10",
            "widget_type": "stacked_bar",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "metrics": [
                    {"field": "transit_intercept_xiaoshan", "agg": "sum", "label": "在途拦截（萧山云仓）"},
                    {"field": "transit_intercept_yuhang", "agg": "sum", "label": "在途拦截（余杭云仓）"},
                ],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 10,
            },
            "layout": {"x": 12, "y": 4, "w": 12, "h": 6},
            "sort_order": 110,
        },
        {
            "title": "销退仓退货 TOP10",
            "widget_type": "bar",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "metrics": [{"field": "sales_return_warehouse", "agg": "sum", "label": "销售退货（销退仓）"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 10,
            },
            "layout": {"x": 0, "y": 10, "w": 12, "h": 6},
            "sort_order": 200,
        },
        {
            "title": "当日总销量排行榜",
            "widget_type": "ranking",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "metrics": [{"field": "total_sales_qty", "agg": "sum", "label": "当日总销量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 10,
            },
            "layout": {"x": 12, "y": 10, "w": 12, "h": 6},
            "sort_order": 210,
        },
        {
            "title": "销售与退货明细",
            "widget_type": "table",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_code", "material_name"],
                "metrics": [
                    {"field": "sales_out_xiaoshan", "agg": "sum", "label": "销售出库（萧山云仓）"},
                    {"field": "sales_out_yuhang", "agg": "sum", "label": "销售出库（余杭云仓）"},
                    {"field": "sales_return_warehouse", "agg": "sum", "label": "销售退货（销退仓）"},
                    {"field": "total_return_qty", "agg": "sum", "label": "当日总退货数量"},
                    {"field": "total_sales_qty", "agg": "sum", "label": "当日总销量"},
                ],
                "filters": [],
                "sort": [{"field": "metric_4", "direction": "desc"}],
                "limit": 20,
            },
            "layout": {"x": 0, "y": 16, "w": 24, "h": 8},
            "sort_order": 300,
        },
    ]


def ensure_preset_sales_view(conn) -> None:
    row = conn.execute(
        text("SELECT id FROM bi_dashboard_view WHERE name = :name LIMIT 1"),
        {"name": PREFERRED_SALES_VIEW_NAME},
    ).mappings().first()
    if row:
        view_id = int(row["id"])
    else:
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_view(name, description, global_filters_json)
                VALUES (:name, :description, :global_filters_json)
                """
            ),
            {
                "name": PREFERRED_SALES_VIEW_NAME,
                "description": PREFERRED_SALES_VIEW_DESCRIPTION,
                "global_filters_json": "[]",
            },
        )
        view_id = int(result.lastrowid)

    widget_count = int(
        conn.execute(
            text("SELECT COUNT(*) FROM bi_dashboard_widget WHERE view_id = :view_id"),
            {"view_id": view_id},
        ).scalar()
        or 0
    )
    if widget_count > 0:
        return

    insert_preset_widgets(conn, view_id, preset_sales_view_widgets())


def insert_preset_widgets(conn, view_id: int, items: Sequence[Dict[str, Any]]) -> None:
    for item in items:
        config = normalize_widget_config(item["widget_type"], item["config"])
        layout = normalize_layout(item["layout"])
        conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_widget(
                    view_id, title, widget_type, dataset, config_json, layout_json, sort_order, analysis_text
                ) VALUES (
                    :view_id, :title, :widget_type, :dataset, :config_json, :layout_json, :sort_order, :analysis_text
                )
                """
            ),
            {
                "view_id": view_id,
                "title": item["title"],
                "widget_type": item["widget_type"],
                "dataset": item["dataset"],
                "config_json": json_dumps(config),
                "layout_json": json_dumps(layout),
                "sort_order": int(item["sort_order"]),
                "analysis_text": "",
            },
        )


def insert_missing_preset_widgets(conn, view_id: int, items: Sequence[Dict[str, Any]]) -> None:
    existing_titles = {
        str(row["title"])
        for row in conn.execute(
            text("SELECT title FROM bi_dashboard_widget WHERE view_id = :view_id"),
            {"view_id": view_id},
        ).mappings().all()
    }
    missing_items = [item for item in items if str(item["title"]) not in existing_titles]
    if missing_items:
        insert_preset_widgets(conn, view_id, missing_items)


def preset_inventory_view_widgets() -> List[Dict[str, Any]]:
    dataset = "inventory_cleaning"
    return [
        {
            "title": "当日总库存",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "qty", "agg": "sum", "label": "当日总库存"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 0, "y": 0, "w": 6, "h": 4},
            "sort_order": 0,
        },
        {
            "title": "良品仓库存",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "qty", "agg": "sum", "label": "良品仓库存"}],
                "filters": [{"field": "warehouse_name_clean", "op": "eq", "value": "良品仓"}],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 6, "y": 0, "w": 6, "h": 4},
            "sort_order": 10,
        },
        {
            "title": "不良品仓库存",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "qty", "agg": "sum", "label": "不良品仓库存"}],
                "filters": [{"field": "warehouse_name_clean", "op": "eq", "value": "不良品仓"}],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 12, "y": 0, "w": 6, "h": 4},
            "sort_order": 20,
        },
        {
            "title": "销退仓库存",
            "widget_type": "metric",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": [],
                "metrics": [{"field": "qty", "agg": "sum", "label": "销退仓库存"}],
                "filters": [{"field": "warehouse_name_clean", "op": "eq", "value": "销退仓"}],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 1,
            },
            "layout": {"x": 18, "y": 0, "w": 6, "h": 4},
            "sort_order": 30,
        },
        {
            "title": "库存趋势",
            "widget_type": "line",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["snapshot_date"],
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [],
                "sort": [{"field": "snapshot_date", "direction": "asc"}],
                "limit": 31,
            },
            "layout": {"x": 0, "y": 4, "w": 12, "h": 6},
            "sort_order": 100,
        },
        {
            "title": "库存状态分布",
            "widget_type": "pie",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["stock_status_name"],
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 12,
            },
            "layout": {"x": 12, "y": 4, "w": 12, "h": 6},
            "sort_order": 110,
        },
        {
            "title": "仓库库存分布",
            "widget_type": "bar",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["warehouse_name_clean"],
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 10,
            },
            "layout": {"x": 0, "y": 10, "w": 12, "h": 6},
            "sort_order": 200,
        },
        {
            "title": "高库存物料 TOP15",
            "widget_type": "ranking",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 15,
            },
            "layout": {"x": 12, "y": 10, "w": 12, "h": 6},
            "sort_order": 210,
        },
        {
            "title": "翻新物料库存分布",
            "widget_type": "stacked_hbar",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["material_name"],
                "series_field": "stock_status_name",
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [{"field": "stock_status_name", "op": "in", "value": ["翻新良品", "翻新不良品", "不良品", "采购良品"]}],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 12,
            },
            "layout": {"x": 0, "y": 16, "w": 24, "h": 7},
            "sort_order": 250,
        },
        {
            "title": "库存清洗明细",
            "widget_type": "table",
            "dataset": dataset,
            "config": {
                "dataset": dataset,
                "dimensions": ["warehouse_name_clean", "material_code", "material_name", "stock_status_name"],
                "metrics": [{"field": "qty", "agg": "sum", "label": "库存数量"}],
                "filters": [],
                "sort": [{"field": "metric_0", "direction": "desc"}],
                "limit": 30,
            },
            "layout": {"x": 0, "y": 23, "w": 24, "h": 8},
            "sort_order": 300,
        },
    ]


def ensure_preset_inventory_view(conn) -> None:
    row = conn.execute(
        text("SELECT id FROM bi_dashboard_view WHERE name = :name LIMIT 1"),
        {"name": PREFERRED_INVENTORY_VIEW_NAME},
    ).mappings().first()
    if row:
        view_id = int(row["id"])
    else:
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_view(name, description, global_filters_json)
                VALUES (:name, :description, :global_filters_json)
                """
            ),
            {
                "name": PREFERRED_INVENTORY_VIEW_NAME,
                "description": PREFERRED_INVENTORY_VIEW_DESCRIPTION,
                "global_filters_json": "[]",
            },
        )
        view_id = int(result.lastrowid)

    insert_missing_preset_widgets(conn, view_id, preset_inventory_view_widgets())


def normalize_layout(raw_layout: Dict[str, Any] | None) -> Dict[str, Any]:
    layout = dict(raw_layout or {})
    try:
        x = int(layout.get("x", 0) or 0)
    except Exception:
        x = 0
    try:
        y = int(layout.get("y", 0) or 0)
    except Exception:
        y = 0
    try:
        span = int(layout.get("span", 1) or 1)
    except Exception:
        span = 1
    height = str(layout.get("height", "normal") or "normal")
    if span not in LAYOUT_SPANS:
        span = 1
    if height not in LAYOUT_HEIGHTS:
        height = "normal"
    try:
        width = int(layout.get("w", GRID_COLUMNS if span == 2 else GRID_COLUMNS // 2) or (GRID_COLUMNS if span == 2 else GRID_COLUMNS // 2))
    except Exception:
        width = GRID_COLUMNS if span == 2 else GRID_COLUMNS // 2
    try:
        rows = int(layout.get("h", height_to_rows(height)) or height_to_rows(height))
    except Exception:
        rows = height_to_rows(height)
    width = max(GRID_MIN_WIDTH, min(GRID_MAX_WIDTH, width))
    rows = max(GRID_MIN_HEIGHT, min(GRID_MAX_HEIGHT, rows))
    x = max(0, min(GRID_COLUMNS - width, x))
    y = max(0, y)
    span = 2 if width > (GRID_COLUMNS // 2) else 1
    height = rows_to_height(rows)
    return {"x": x, "y": y, "w": width, "h": rows, "span": span, "height": height}


def layout_sort_value(layout: Dict[str, Any]) -> int:
    normalized = normalize_layout(layout)
    return (normalized["y"] * 1000) + (normalized["x"] * 10)


def layouts_collide(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    return (
        left["x"] < right["x"] + right["w"]
        and left["x"] + left["w"] > right["x"]
        and left["y"] < right["y"] + right["h"]
        and left["y"] + left["h"] > right["y"]
    )


def normalize_template_widgets(raw_widgets: Sequence[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_widgets or []):
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "title": str(item.get("title") or f"卡片 {index + 1}"),
                "layout": normalize_layout(item.get("layout")),
            }
        )
    return sorted(normalized, key=lambda item: layout_sort_value(item["layout"]))


def build_layout_template_payload(widgets: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    normalized_widgets = normalize_template_widgets(
        [{"title": widget.get("title"), "layout": widget.get("layout")} for widget in widgets]
    )
    return {"grid_columns": GRID_COLUMNS, "widgets": normalized_widgets}


def layout_template_from_row(row: Dict[str, Any], include_layout: bool = False) -> Dict[str, Any]:
    payload = json_loads(row.get("layout_json"), {})
    template_widgets = normalize_template_widgets(payload.get("widgets") if isinstance(payload, dict) else [])
    max_rows = max((item["layout"]["y"] + item["layout"]["h"] for item in template_widgets), default=0)
    result = {
        "id": int(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "widget_count": len(template_widgets),
        "max_rows": max_rows,
        "created_at": to_plain(row.get("created_at")),
        "updated_at": to_plain(row.get("updated_at")),
    }
    if include_layout:
        result["layout_payload"] = {"grid_columns": GRID_COLUMNS, "widgets": template_widgets}
    return result


def normalize_widget_filters(dataset: str, raw_filters: Sequence[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    fields = DATASETS[dataset]["fields"]
    normalized: List[Dict[str, Any]] = []
    for item in raw_filters or []:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or "")
        operator = str(item.get("op") or "eq").lower()
        value = item.get("value")
        if field not in fields or not fields[field].get("filterable", False):
            continue
        if operator not in FILTER_OPERATORS:
            operator = "eq"
        if operator in {"in", "between"} and isinstance(value, str):
            value = [part.strip() for part in value.split(",") if part.strip()]
        normalized.append({"field": field, "op": operator, "value": value})
    return normalized


def normalize_widget_date_filter(dataset: str, raw_filter: Dict[str, Any] | None) -> Dict[str, Any]:
    raw = raw_filter if isinstance(raw_filter, dict) else {}
    mode = str(raw.get("mode") or "follow_page").lower()
    if mode not in {"follow_page", "single", "range", "all"}:
        mode = "follow_page"

    date_value = parse_date_or_none(str(raw.get("date") or ""))
    start_date = parse_date_or_none(str(raw.get("start_date") or ""))
    end_date = parse_date_or_none(str(raw.get("end_date") or ""))

    if start_date and end_date and start_date > end_date:
        start_date, end_date = end_date, start_date

    if mode == "single" and date_value is None:
        mode = "follow_page"
    if mode == "range" and start_date is None and end_date is None:
        mode = "follow_page"

    return {
        "mode": mode,
        "date": date_value.isoformat() if date_value else "",
        "start_date": start_date.isoformat() if start_date else "",
        "end_date": end_date.isoformat() if end_date else "",
        "date_col": DATASETS[dataset]["date_col"],
    }


def normalize_global_filters(raw_filters: Sequence[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for item in raw_filters or []:
        if not isinstance(item, dict):
            continue
        dataset = str(item.get("dataset") or "")
        if dataset not in DATASETS:
            continue
        widget_filters = normalize_widget_filters(dataset, [item])
        if not widget_filters:
            continue
        normalized.append({"dataset": dataset, **widget_filters[0]})
    return normalized


def normalize_widget_config(widget_type: str, payload: Dict[str, Any] | None) -> Dict[str, Any]:
    raw = dict(payload or {})
    dataset = str(raw.get("dataset") or "inventory")
    if dataset not in DATASETS:
        dataset = "inventory"
    fields = DATASETS[dataset]["fields"]
    config = {
        "dataset": dataset,
        "dimensions": [],
        "series_field": "",
        "metrics": [],
        "date_filter": normalize_widget_date_filter(dataset, raw.get("date_filter")),
        "filters": normalize_widget_filters(dataset, raw.get("filters")),
        "sort": [],
        "limit": 20,
        "text_content": str(raw.get("text_content") or "请输入说明文本"),
    }

    for dim in raw.get("dimensions") or []:
        if dim in fields and fields[dim].get("groupable", False):
            config["dimensions"].append(dim)
    if widget_type not in {"metric", "text"} and not config["dimensions"]:
        config["dimensions"] = default_dimensions(widget_type)

    series_field = str(raw.get("series_field") or "").strip()
    if (
        supports_series_field(widget_type)
        and series_field in fields
        and fields[series_field].get("groupable", False)
        and series_field not in config["dimensions"]
    ):
        config["series_field"] = series_field
    elif supports_series_field(widget_type):
        config["series_field"] = default_series_field(dataset, widget_type)

    for item in raw.get("metrics") or []:
        if not isinstance(item, dict):
            continue
        field = item.get("field", "*")
        agg = str(item.get("agg") or "sum").lower()
        if agg not in AGGREGATIONS:
            continue
        if agg == "count":
            if field not in ("*", "", None) and field not in fields:
                continue
            field = "*" if field in ("", None) else field
        elif field not in fields or not fields[field].get("numeric", False):
            continue
        config["metrics"].append(
            {
                "field": field,
                "agg": agg,
                "label": str(item.get("label") or metric_label(dataset, field, agg)),
            }
        )
    if widget_type != "text" and not config["metrics"]:
        config["metrics"] = default_metrics(dataset, widget_type)

    for item in raw.get("sort") or []:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or "")
        direction = str(item.get("direction") or "asc").lower()
        if field and direction in SORT_DIRECTIONS:
            config["sort"].append({"field": field, "direction": direction})

    try:
        config["limit"] = max(1, min(500, int(raw.get("limit") or 20)))
    except Exception:
        config["limit"] = 20
    return config


def get_engine():
    global engine
    if engine is not None:
        return engine
    config_path = project_root / "config" / "yonyou_inventory_sync.yaml"
    raw = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    db_url = raw.get("database", {}).get("url", "")
    if not db_url:
        raise RuntimeError("缺少 config/yonyou_inventory_sync.yaml 中的 database.url 配置")
    engine = create_engine(quote_mysql_url(db_url), pool_pre_ping=True, future=True)
    return engine


def ensure_schema() -> None:
    global schema_ready
    if schema_ready:
        return
    current_engine = get_engine()
    ensure_sales_processing_schema(current_engine)
    ensure_inventory_processing_schema(current_engine)
    with current_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_dashboard_view (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    description VARCHAR(512) NOT NULL DEFAULT '',
                    global_filters_json LONGTEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_dashboard_widget (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    view_id BIGINT NOT NULL,
                    title VARCHAR(128) NOT NULL,
                    widget_type VARCHAR(32) NOT NULL,
                    dataset VARCHAR(32) NOT NULL DEFAULT 'inventory',
                    config_json LONGTEXT NOT NULL,
                    layout_json LONGTEXT NULL,
                    sort_order INT NOT NULL DEFAULT 100,
                    analysis_text LONGTEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_bi_dash_widget_view_sort (view_id, sort_order, id),
                    CONSTRAINT fk_bi_dash_widget_view FOREIGN KEY (view_id)
                        REFERENCES bi_dashboard_view(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_dashboard_layout_template (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    description VARCHAR(512) NOT NULL DEFAULT '',
                    layout_json LONGTEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM bi_dashboard_view")).fetchall()}
        if "global_filters_json" not in columns:
            conn.execute(text("ALTER TABLE bi_dashboard_view ADD COLUMN global_filters_json LONGTEXT NULL"))
        count = int(conn.execute(text("SELECT COUNT(*) FROM bi_dashboard_view")).scalar() or 0)
        if count == 0:
            conn.execute(
                text(
                    """
                    INSERT INTO bi_dashboard_view(name, description, global_filters_json)
                    VALUES (:name, :description, :global_filters_json)
                    """
                ),
                {
                    "name": "默认看板",
                    "description": "库存与销售的日常经营概览",
                    "global_filters_json": "[]",
                },
            )
        ensure_preset_sales_view(conn)
        ensure_preset_inventory_view(conn)
    schema_ready = True


def load_view(conn, view_id: int) -> Dict[str, Any]:
    row = conn.execute(
        text(
            """
            SELECT id, name, description, global_filters_json, created_at, updated_at
            FROM bi_dashboard_view
            WHERE id = :id
            """
        ),
        {"id": view_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"看板不存在：{view_id}")
    global_filters = normalize_global_filters(json_loads(row.get("global_filters_json"), []))
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "global_filters": global_filters,
        "created_at": to_plain(row["created_at"]),
        "updated_at": to_plain(row["updated_at"]),
    }


def widget_from_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "view_id": int(row["view_id"]),
        "title": row["title"],
        "widget_type": row["widget_type"],
        "dataset": row["dataset"],
        "config": normalize_widget_config(row["widget_type"], json_loads(row.get("config_json"), {})),
        "layout": normalize_layout(json_loads(row.get("layout_json"), default_layout())),
        "sort_order": int(row["sort_order"]),
        "analysis_text": row.get("analysis_text") or "",
        "created_at": to_plain(row.get("created_at")),
        "updated_at": to_plain(row.get("updated_at")),
    }


def load_widget(conn, widget_id: int) -> Dict[str, Any]:
    row = conn.execute(
        text(
            """
            SELECT
                id, view_id, title, widget_type, dataset, config_json, layout_json,
                sort_order, analysis_text, created_at, updated_at
            FROM bi_dashboard_widget
            WHERE id = :id
            """
        ),
        {"id": widget_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"图表不存在：{widget_id}")
    return widget_from_row(dict(row))


def load_layout_template(conn, template_id: int) -> Dict[str, Any]:
    row = conn.execute(
        text(
            """
            SELECT id, name, description, layout_json, created_at, updated_at
            FROM bi_dashboard_layout_template
            WHERE id = :id
            """
        ),
        {"id": template_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"布局模板不存在：{template_id}")
    return layout_template_from_row(dict(row), include_layout=True)


def view_detail(conn, view_id: int) -> Dict[str, Any]:
    view = load_view(conn, view_id)
    widgets = conn.execute(
        text(
            """
            SELECT
                id, view_id, title, widget_type, dataset, config_json, layout_json,
                sort_order, analysis_text, created_at, updated_at
            FROM bi_dashboard_widget
            WHERE view_id = :view_id
            ORDER BY sort_order, id
            """
        ),
        {"view_id": view_id},
    ).mappings().all()
    return {**view, "widgets": [widget_from_row(dict(row)) for row in widgets]}


def latest_date(conn, dataset: str) -> date | None:
    ds = DATASETS[dataset]
    return conn.execute(text(f"SELECT MAX(`{ds['date_col']}`) FROM `{ds['table']}`")).scalar()


def query_filter_options(
    conn,
    *,
    dataset: str,
    field: str,
    selected_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    keyword: str | None = None,
    limit: int = 200,
) -> Tuple[List[Dict[str, Any]], str]:
    ds = DATASETS[dataset]
    field_meta = ds["fields"][field]
    keyword_text = str(keyword or "").strip()
    base_params: Dict[str, Any] = {"_limit": max(1, min(limit, 500))}
    base_clauses: List[str] = [f"`{field}` IS NOT NULL"]

    if field_meta.get("type") == "string":
        base_clauses.append(f"TRIM(CAST(`{field}` AS CHAR)) <> ''")
    if keyword_text:
        base_clauses.append(f"CAST(`{field}` AS CHAR) LIKE :keyword")
        base_params["keyword"] = f"%{keyword_text}%"
    if start_date is not None:
        base_clauses.append(f"`{ds['date_col']}` >= :start_date")
        base_params["start_date"] = start_date
    if end_date is not None:
        base_clauses.append(f"`{ds['date_col']}` <= :end_date")
        base_params["end_date"] = end_date

    def run_query(use_selected_date: bool) -> List[Dict[str, Any]]:
        clauses = list(base_clauses)
        params = dict(base_params)
        if use_selected_date and selected_date is not None and field != ds["date_col"]:
            clauses.append(f"`{ds['date_col']}` = :selected_date")
            params["selected_date"] = selected_date
        sql = (
            f"SELECT DISTINCT `{field}` AS option_value "
            f"FROM `{ds['table']}` "
            f"WHERE {' AND '.join(clauses)} "
            f"ORDER BY `{field}` "
            f"LIMIT :_limit"
        )
        rows = conn.execute(text(sql), params).fetchall()
        options: List[Dict[str, Any]] = []
        for row in rows:
            raw_value = row[0]
            plain_value = to_plain(raw_value)
            if plain_value in (None, ""):
                continue
            options.append({"value": plain_value, "label": str(plain_value)})
        return options

    options = run_query(use_selected_date=True)
    if options or selected_date is None or field == ds["date_col"] or start_date is not None or end_date is not None:
        return options, "selected_date"

    return run_query(use_selected_date=False), "all_dates"


def return_unpack_attendance_summaries(
    conn,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 60,
) -> List[Dict[str, Any]]:
    clauses = []
    params: Dict[str, Any] = {"limit": max(1, min(limit, 365))}
    if start_date is not None:
        clauses.append("d.biz_date >= :start_date")
        params["start_date"] = start_date
    if end_date is not None:
        clauses.append("d.biz_date <= :end_date")
        params["end_date"] = end_date
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        text(
            f"""
            SELECT
                d.biz_date,
                COALESCE(a.attendance_count, 0) AS attendance_count,
                COALESCE(SUM(c.sales_return_warehouse), 0) AS sales_return_warehouse,
                COALESCE(SUM(c.total_return_qty), 0) AS total_return_qty,
                COALESCE(SUM(c.total_sales_qty), 0) AS total_sales_qty
            FROM (
                SELECT DISTINCT biz_date FROM bi_material_sales_daily_cleaning
                UNION
                SELECT biz_date FROM bi_return_unpack_attendance_daily
            ) d
            LEFT JOIN bi_return_unpack_attendance_daily a ON a.biz_date = d.biz_date
            LEFT JOIN bi_material_sales_daily_cleaning c ON c.biz_date = d.biz_date
            {where_clause}
            GROUP BY d.biz_date, a.attendance_count
            ORDER BY d.biz_date DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()

    summaries: List[Dict[str, Any]] = []
    for row in rows:
        attendance_count = Decimal(str(row["attendance_count"] or 0))
        sales_return_warehouse = Decimal(str(row["sales_return_warehouse"] or 0))
        total_return_qty = Decimal(str(row["total_return_qty"] or 0))
        total_sales_qty = Decimal(str(row["total_sales_qty"] or 0))
        efficiency = Decimal("0")
        if attendance_count > 0:
            efficiency = sales_return_warehouse / attendance_count
        summaries.append(
            {
                "biz_date": to_plain(row["biz_date"]),
                "attendance_count": float(attendance_count),
                "sales_return_warehouse": float(sales_return_warehouse),
                "total_return_qty": float(total_return_qty),
                "total_sales_qty": float(total_sales_qty),
                "return_unpack_efficiency": float(efficiency),
            }
        )
    return summaries


def merge_filters(dataset: str, widget_filters: List[Dict[str, Any]], global_filters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged = list(widget_filters)
    merged.extend(
        {
            "field": item["field"],
            "op": item["op"],
            "value": item.get("value"),
        }
        for item in global_filters
        if item.get("dataset") == dataset
    )
    return merged


def filter_has_value(operator: str, value: Any) -> bool:
    if operator in {"in", "between"}:
        return isinstance(value, list) and any(str(part).strip() for part in value)
    return value not in (None, "")


def should_apply_target_date(dataset: str, dimensions: List[str], filters: List[Dict[str, Any]]) -> bool:
    date_col = DATASETS[dataset]["date_col"]
    if date_col in dimensions:
        return False
    return not any(
        item.get("field") == date_col and filter_has_value(str(item.get("op") or "eq").lower(), item.get("value"))
        for item in filters
    )


def resolve_widget_date_context(
    conn,
    *,
    dataset: str,
    config: Dict[str, Any],
    selected_date: date | None,
) -> Tuple[List[Dict[str, Any]], date | None, Any, str]:
    date_filter = normalize_widget_date_filter(dataset, config.get("date_filter"))
    config["date_filter"] = date_filter
    mode = date_filter["mode"]
    date_col = DATASETS[dataset]["date_col"]

    if mode == "single" and date_filter["date"]:
        return ([{"field": date_col, "op": "eq", "value": date_filter["date"]}], None, date_filter["date"], mode)

    if mode == "range":
        start_value = date_filter["start_date"]
        end_value = date_filter["end_date"]
        if start_value and end_value:
            label = f"{start_value} 至 {end_value}"
            return ([{"field": date_col, "op": "between", "value": [start_value, end_value]}], None, label, mode)
        if start_value:
            label = f"{start_value} 起"
            return ([{"field": date_col, "op": "gte", "value": start_value}], None, label, mode)
        if end_value:
            label = f"截至 {end_value}"
            return ([{"field": date_col, "op": "lte", "value": end_value}], None, label, mode)

    if mode == "all":
        return ([], None, "全部日期", mode)

    target_date = selected_date or latest_date(conn, dataset)
    return ([], target_date, to_plain(target_date), "follow_page")


def build_where_sql(dataset: str, filters: List[Dict[str, Any]], target_date: date | None) -> Tuple[str, Dict[str, Any]]:
    ds = DATASETS[dataset]
    clauses: List[str] = []
    params: Dict[str, Any] = {}
    if target_date is not None:
        clauses.append(f"`{ds['date_col']}` = :target_date")
        params["target_date"] = target_date
    for idx, item in enumerate(filters):
        field = item["field"]
        operator = item["op"]
        value = item.get("value")
        key = f"f_{idx}"
        if operator == "eq":
            clauses.append(f"`{field}` = :{key}")
            params[key] = value
        elif operator == "ne":
            clauses.append(f"`{field}` <> :{key}")
            params[key] = value
        elif operator == "gt":
            clauses.append(f"`{field}` > :{key}")
            params[key] = value
        elif operator == "gte":
            clauses.append(f"`{field}` >= :{key}")
            params[key] = value
        elif operator == "lt":
            clauses.append(f"`{field}` < :{key}")
            params[key] = value
        elif operator == "lte":
            clauses.append(f"`{field}` <= :{key}")
            params[key] = value
        elif operator == "like":
            clauses.append(f"`{field}` LIKE :{key}")
            params[key] = f"%{value}%"
        elif operator == "in":
            values = value if isinstance(value, list) else []
            if not values:
                continue
            placeholders: List[str] = []
            for sub_idx, sub_value in enumerate(values):
                sub_key = f"{key}_{sub_idx}"
                params[sub_key] = sub_value
                placeholders.append(f":{sub_key}")
            clauses.append(f"`{field}` IN ({', '.join(placeholders)})")
        elif operator == "between":
            values = value if isinstance(value, list) else []
            if len(values) != 2:
                continue
            low_key = f"{key}_low"
            high_key = f"{key}_high"
            params[low_key] = values[0]
            params[high_key] = values[1]
            clauses.append(f"`{field}` BETWEEN :{low_key} AND :{high_key}")
    return (" AND ".join(clauses) if clauses else "1=1"), params


def metric_sql(metric: Dict[str, Any], alias: str) -> str:
    if metric["agg"] == "count":
        return f"COUNT(*) AS `{alias}`" if metric["field"] == "*" else f"COUNT(`{metric['field']}`) AS `{alias}`"
    if metric["agg"] == "sum":
        return f"COALESCE(SUM(`{metric['field']}`), 0) AS `{alias}`"
    if metric["agg"] == "avg":
        return f"COALESCE(AVG(`{metric['field']}`), 0) AS `{alias}`"
    if metric["agg"] == "max":
        return f"COALESCE(MAX(`{metric['field']}`), 0) AS `{alias}`"
    if metric["agg"] == "min":
        return f"COALESCE(MIN(`{metric['field']}`), 0) AS `{alias}`"
    raise ValueError(metric["agg"])


def python_aggregate(raw_rows: List[Dict[str, Any]], dimensions: List[str], metrics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
    for raw_row in raw_rows:
        key = tuple(raw_row.get(dim) for dim in dimensions)
        holder = grouped.setdefault(
            key,
            {
                "dimensions": {dim: raw_row.get(dim) for dim in dimensions},
                "values": {f"metric_{idx}": [] for idx in range(len(metrics))},
            },
        )
        for idx, metric in enumerate(metrics):
            alias = f"metric_{idx}"
            if metric["agg"] == "count":
                if metric["field"] == "*" or raw_row.get(metric["field"]) not in (None, ""):
                    holder["values"][alias].append(1.0)
                continue
            numeric_value = to_number(raw_row.get(metric["field"]))
            if numeric_value is not None:
                holder["values"][alias].append(numeric_value)

    result: List[Dict[str, Any]] = []
    for holder in grouped.values():
        row = dict(holder["dimensions"])
        for idx, metric in enumerate(metrics):
            alias = f"metric_{idx}"
            values = holder["values"][alias]
            if metric["agg"] == "count":
                row[alias] = int(sum(values))
            elif not values:
                row[alias] = 0
            elif metric["agg"] == "sum":
                row[alias] = float(sum(values))
            elif metric["agg"] == "avg":
                row[alias] = float(sum(values) / len(values))
            elif metric["agg"] == "max":
                row[alias] = float(max(values))
            elif metric["agg"] == "min":
                row[alias] = float(min(values))
            elif metric["agg"] == "median":
                row[alias] = float(median(values))
        result.append(row)
    return result


def apply_sort(rows: List[Dict[str, Any]], sort_config: List[Dict[str, Any]], allowed_fields: List[str]) -> None:
    valid_sort = [item for item in sort_config if item.get("field") in allowed_fields]
    for item in reversed(valid_sort):
        field = item["field"]
        reverse = item["direction"] == "desc"
        rows.sort(key=lambda row: (row.get(field) is None, row.get(field)), reverse=reverse)


def pivot_rows_by_series(
    rows: List[Dict[str, Any]],
    *,
    dimensions: List[str],
    metrics: List[Dict[str, Any]],
    series_field: str,
    sort_config: List[Dict[str, Any]],
    limit: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    metric_aliases = [f"metric_{idx}" for idx in range(len(metrics))]
    grouped: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
    series_labels: Dict[str, str] = {}

    for raw_row in rows:
        key = tuple(raw_row.get(dim) for dim in dimensions)
        holder = grouped.setdefault(
            key,
            {
                **{dim: raw_row.get(dim) for dim in dimensions},
                **{alias: 0 for alias in metric_aliases},
                "series_values": {},
            },
        )
        series_value = to_plain(raw_row.get(series_field))
        series_key = "" if series_value in (None, "") else str(series_value)
        series_labels.setdefault(series_key, series_key or "未分类")
        slot = holder["series_values"].setdefault(
            series_key,
            {"label": series_labels[series_key], **{alias: 0 for alias in metric_aliases}},
        )
        for alias in metric_aliases:
            numeric = to_number(raw_row.get(alias))
            if numeric is None:
                continue
            slot[alias] = float(slot.get(alias, 0) or 0) + float(numeric)
            holder[alias] = float(holder.get(alias, 0) or 0) + float(numeric)

    pivoted_rows = list(grouped.values())
    apply_sort(pivoted_rows, sort_config, dimensions + metric_aliases)
    limited_rows = pivoted_rows[:limit]

    visible_series_keys: List[str] = []
    for row in limited_rows:
        for series_key in row.get("series_values", {}).keys():
            if series_key not in visible_series_keys:
                visible_series_keys.append(series_key)
    visible_series_keys.sort(key=lambda item: series_labels.get(item, item or "未分类"))

    series_groups = [
        {"key": series_key, "label": series_labels.get(series_key, series_key or "未分类")}
        for series_key in visible_series_keys
    ]
    return limited_rows, series_groups


def query_widget_data(conn, widget: Dict[str, Any], selected_date: date | None, global_filters: List[Dict[str, Any]]) -> Dict[str, Any]:
    config = copy.deepcopy(widget["config"])
    dataset = config["dataset"]
    config["filters"] = merge_filters(dataset, config["filters"], global_filters)
    date_filters, implicit_target_date, target_date, date_filter_scope = resolve_widget_date_context(
        conn,
        dataset=dataset,
        config=config,
        selected_date=selected_date,
    )
    config["filters"].extend(date_filters)

    if widget["widget_type"] == "text":
        return {
            "target_date": target_date,
            "dimensions": [],
            "metrics": [],
            "rows": [],
            "config": config,
            "date_filter_scope": date_filter_scope,
        }

    dimensions = config["dimensions"]
    metrics = config["metrics"]
    series_field = config.get("series_field") or ""
    use_series_breakdown = bool(series_field and supports_series_field(widget["widget_type"]) and dimensions and widget["widget_type"] != "text")
    group_dimensions = dimensions + ([series_field] if use_series_breakdown else [])
    applied_target_date = implicit_target_date if should_apply_target_date(dataset, dimensions, config["filters"]) else None
    where_clause, params = build_where_sql(dataset, config["filters"], applied_target_date)
    table_name = DATASETS[dataset]["table"]
    has_median = any(metric["agg"] == "median" for metric in metrics)

    if has_median:
        select_columns = [f"`{dim}` AS `{dim}`" for dim in group_dimensions]
        raw_fields = sorted({metric["field"] for metric in metrics if metric["field"] != "*"})
        select_columns.extend(f"`{field}` AS `{field}`" for field in raw_fields)
        sql = f"SELECT {', '.join(select_columns) if select_columns else '*'} FROM `{table_name}` WHERE {where_clause}"
        raw_rows = [dict(row) for row in conn.execute(text(sql), params).mappings().all()]
        rows = python_aggregate(raw_rows, group_dimensions, metrics)
    else:
        metric_aliases = [f"metric_{idx}" for idx in range(len(metrics))]
        select_parts = [f"`{dim}` AS `{dim}`" for dim in group_dimensions]
        select_parts.extend(metric_sql(metric, metric_aliases[idx]) for idx, metric in enumerate(metrics))
        sql = f"SELECT {', '.join(select_parts)} FROM `{table_name}` WHERE {where_clause}"
        if group_dimensions:
            sql += " GROUP BY " + ", ".join(f"`{dim}`" for dim in group_dimensions)
        allowed_fields = dimensions + metric_aliases
        if not use_series_breakdown:
            order_parts = [
                f"`{item['field']}` {item['direction'].upper()}"
                for item in config["sort"]
                if item.get("field") in allowed_fields
            ]
            if not order_parts and metric_aliases:
                order_parts = [f"`{metric_aliases[0]}` DESC"]
            if order_parts:
                sql += " ORDER BY " + ", ".join(order_parts)
            sql += " LIMIT :_limit"
            params["_limit"] = config["limit"]
        rows = [dict(row) for row in conn.execute(text(sql), params).mappings().all()]

    metric_aliases = [f"metric_{idx}" for idx in range(len(metrics))]
    series_groups: List[Dict[str, str]] = []
    if use_series_breakdown:
        rows, series_groups = pivot_rows_by_series(
            rows,
            dimensions=dimensions,
            metrics=metrics,
            series_field=series_field,
            sort_config=config["sort"],
            limit=config["limit"],
        )
    else:
        apply_sort(rows, config["sort"], dimensions + metric_aliases)
        rows = rows[: config["limit"]]
    normalized_rows = [{key: to_plain(value) for key, value in row.items()} for row in rows]
    normalized_metrics = [
        {
            "alias": f"metric_{idx}",
            "field": metric["field"],
            "agg": metric["agg"],
            "label": metric.get("label") or metric_label(dataset, metric["field"], metric["agg"]),
        }
        for idx, metric in enumerate(metrics)
    ]
    return {
        "target_date": target_date,
        "applied_target_date": to_plain(applied_target_date),
        "dimensions": dimensions,
        "series_field": series_field if use_series_breakdown else "",
        "series_groups": series_groups,
        "metrics": normalized_metrics,
        "rows": normalized_rows,
        "config": config,
        "date_filter_scope": date_filter_scope,
    }


def build_ai_text(widget: Dict[str, Any], payload: Dict[str, Any]) -> str:
    if widget["widget_type"] == "text":
        return "文本组件不需要自动分析。"
    rows = payload.get("rows") or []
    metrics = payload.get("metrics") or []
    if not rows:
        return f"{payload.get('target_date') or '未知日期'} 当前组件没有可分析数据。建议检查筛选条件或切换日期。"
    if not metrics:
        return f"{payload.get('target_date') or '未知日期'} 共返回 {len(rows)} 条记录。"
    metric = metrics[0]
    alias = metric["alias"]
    dimension = payload["dimensions"][0] if payload["dimensions"] else None
    total = 0.0
    peak_name = "整体"
    peak_value = None
    for row in rows:
        value = to_number(row.get(alias))
        if value is None:
            continue
        total += value
        if peak_value is None or value > peak_value:
            peak_value = value
            peak_name = str(row.get(dimension) or "整体") if dimension else "整体"
    if peak_value is None:
        return f"{payload.get('target_date') or '未知日期'} {metric['label']}暂无可量化值。"
    return (
        f"{payload.get('target_date') or '未知日期'}，{metric['label']}合计 {total:.2f}。"
        f"最高项为 {peak_name}，数值 {peak_value:.2f}。"
        "建议结合组织、仓库或物料继续下钻确认结构变化。"
    )


@router.get("/bi-dashboard/login", response_class=HTMLResponse)
async def bi_dashboard_login(request: Request, next: str | None = Query(None)) -> Response:
    target = sanitize_next_path(next)
    if current_dashboard_user(request):
        return RedirectResponse(url=target, status_code=303)
    return HTMLResponse(
        render_template(
            "bi_dashboard_login.html",
            {
                "__NEXT_PATH_JSON__": json.dumps(target, ensure_ascii=False),
            },
        )
    )


@router.post("/bi-dashboard/login")
async def bi_dashboard_login_submit(payload: Dict[str, Any] = Body(default={})) -> JSONResponse:
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    remember = bool(payload.get("remember"))
    next_path = sanitize_next_path(payload.get("next"))
    if not authenticate_dashboard_user(username, password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    response = JSONResponse({"ok": True, "redirect_to": next_path, "username": username})
    response.set_cookie(
        key=DASHBOARD_SESSION_COOKIE,
        value=create_dashboard_session(username),
        max_age=DASHBOARD_SESSION_MAX_AGE if remember else None,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@router.post("/bi-dashboard/logout")
async def bi_dashboard_logout() -> JSONResponse:
    response = JSONResponse({"ok": True, "redirect_to": "/financial/bi-dashboard/login"})
    response.delete_cookie(DASHBOARD_SESSION_COOKIE, path="/")
    return response


@router.get("/bi-dashboard/logout")
async def bi_dashboard_logout_redirect() -> RedirectResponse:
    response = RedirectResponse(url="/financial/bi-dashboard/login", status_code=303)
    response.delete_cookie(DASHBOARD_SESSION_COOKIE, path="/")
    return response


@router.get("/bi-dashboard", response_class=HTMLResponse)
async def bi_dashboard(request: Request) -> Response:
    ensure_schema()
    username = current_dashboard_user(request)
    if not username:
        current_path = request.url.path
        if request.url.query:
            current_path = f"{current_path}?{request.url.query}"
        login_url = f"/financial/bi-dashboard/login?next={quote(current_path, safe='')}"
        return RedirectResponse(url=login_url, status_code=303)
    return HTMLResponse(
        render_template(
            "bi_dashboard_builder.html",
            {
                "__BI_CURRENT_USER_JSON__": json.dumps(username, ensure_ascii=False),
                "__BI_LOGIN_PATH_JSON__": json.dumps("/financial/bi-dashboard/login", ensure_ascii=False),
                "__BI_LOGOUT_PATH_JSON__": json.dumps("/financial/bi-dashboard/logout", ensure_ascii=False),
            },
        )
    )


@router.get("/bi-dashboard/attendance", response_class=HTMLResponse)
async def bi_dashboard_attendance_entry(request: Request) -> Response:
    ensure_schema()
    username = current_dashboard_user(request)
    if not username:
        current_path = request.url.path
        if request.url.query:
            current_path = f"{current_path}?{request.url.query}"
        login_url = f"/financial/bi-dashboard/login?next={quote(current_path, safe='')}"
        return RedirectResponse(url=login_url, status_code=303)
    return HTMLResponse(
        render_template(
            "bi_attendance_entry.html",
            {
                "__BI_CURRENT_USER_JSON__": json.dumps(username, ensure_ascii=False),
                "__BI_DASHBOARD_PATH_JSON__": json.dumps("/financial/bi-dashboard", ensure_ascii=False),
                "__BI_LOGOUT_PATH_JSON__": json.dumps("/financial/bi-dashboard/logout", ensure_ascii=False),
            },
        )
    )


@router.get("/bi-dashboard/inventory-mappings", response_class=HTMLResponse)
async def bi_dashboard_inventory_mappings(request: Request) -> Response:
    ensure_schema()
    username = current_dashboard_user(request)
    if not username:
        current_path = request.url.path
        if request.url.query:
            current_path = f"{current_path}?{request.url.query}"
        login_url = f"/financial/bi-dashboard/login?next={quote(current_path, safe='')}"
        return RedirectResponse(url=login_url, status_code=303)
    return HTMLResponse(
        render_template(
            "bi_inventory_mapping_entry.html",
            {
                "__BI_CURRENT_USER_JSON__": json.dumps(username, ensure_ascii=False),
                "__BI_DASHBOARD_PATH_JSON__": json.dumps("/financial/bi-dashboard", ensure_ascii=False),
                "__BI_LOGOUT_PATH_JSON__": json.dumps("/financial/bi-dashboard/logout", ensure_ascii=False),
            },
        )
    )


@router.get("/bi-dashboard/api/inventory-mappings")
async def list_inventory_mappings(_auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.connect() as conn:
        warehouse_rows = conn.execute(
            text(
                """
                SELECT id, source_warehouse_name, warehouse_name_clean, sort_order, is_enabled, created_at, updated_at
                FROM bi_inventory_warehouse_map
                ORDER BY sort_order, id
                """
            )
        ).mappings().all()
        status_rows = conn.execute(
            text(
                """
                SELECT id, stock_status_id, stock_status_name, sort_order, is_enabled, created_at, updated_at
                FROM bi_inventory_status_map
                ORDER BY sort_order, id
                """
            )
        ).mappings().all()
        latest_cleaning = to_plain(latest_date(conn, "inventory_cleaning"))
        latest_raw = to_plain(latest_date(conn, "inventory"))
    return JSONResponse(
        {
            "warehouses": [
                {
                    "id": int(row["id"]),
                    "source_warehouse_name": row["source_warehouse_name"],
                    "warehouse_name_clean": row["warehouse_name_clean"],
                    "sort_order": int(row["sort_order"] or 0),
                    "is_enabled": bool(row["is_enabled"]),
                    "created_at": to_plain(row["created_at"]),
                    "updated_at": to_plain(row["updated_at"]),
                }
                for row in warehouse_rows
            ],
            "statuses": [
                {
                    "id": int(row["id"]),
                    "stock_status_id": row["stock_status_id"],
                    "stock_status_name": row["stock_status_name"],
                    "sort_order": int(row["sort_order"] or 0),
                    "is_enabled": bool(row["is_enabled"]),
                    "created_at": to_plain(row["created_at"]),
                    "updated_at": to_plain(row["updated_at"]),
                }
                for row in status_rows
            ],
            "latest_cleaning_date": latest_cleaning,
            "latest_raw_date": latest_raw,
        }
    )


@router.put("/bi-dashboard/api/inventory-mappings")
async def save_inventory_mappings(
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    warehouse_rows = normalize_inventory_mapping_payload(payload.get("warehouses"), mapping_type="warehouse")
    status_rows = normalize_inventory_mapping_payload(payload.get("statuses"), mapping_type="status")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        existing_warehouse_ids = {
            int(row[0])
            for row in conn.execute(text("SELECT id FROM bi_inventory_warehouse_map")).fetchall()
        }
        existing_status_ids = {
            int(row[0])
            for row in conn.execute(text("SELECT id FROM bi_inventory_status_map")).fetchall()
        }
        submitted_warehouse_ids = {item["id"] for item in warehouse_rows if item["id"] > 0}
        submitted_status_ids = {item["id"] for item in status_rows if item["id"] > 0}

        for item in warehouse_rows:
            if item["id"] > 0:
                result = conn.execute(
                    text(
                        """
                        UPDATE bi_inventory_warehouse_map
                        SET
                            source_warehouse_name = :source_warehouse_name,
                            warehouse_name_clean = :warehouse_name_clean,
                            sort_order = :sort_order,
                            is_enabled = :is_enabled
                        WHERE id = :id
                        """
                    ),
                    item,
                )
                if result.rowcount:
                    continue
            conn.execute(
                text(
                    """
                    INSERT INTO bi_inventory_warehouse_map(
                        source_warehouse_name, warehouse_name_clean, sort_order, is_enabled
                    ) VALUES (
                        :source_warehouse_name, :warehouse_name_clean, :sort_order, :is_enabled
                    )
                    """
                ),
                {key: item[key] for key in ("source_warehouse_name", "warehouse_name_clean", "sort_order", "is_enabled")},
            )

        for item in status_rows:
            if item["id"] > 0:
                result = conn.execute(
                    text(
                        """
                        UPDATE bi_inventory_status_map
                        SET
                            stock_status_id = :stock_status_id,
                            stock_status_name = :stock_status_name,
                            sort_order = :sort_order,
                            is_enabled = :is_enabled
                        WHERE id = :id
                        """
                    ),
                    item,
                )
                if result.rowcount:
                    continue
            conn.execute(
                text(
                    """
                    INSERT INTO bi_inventory_status_map(
                        stock_status_id, stock_status_name, sort_order, is_enabled
                    ) VALUES (
                        :stock_status_id, :stock_status_name, :sort_order, :is_enabled
                    )
                    """
                ),
                {key: item[key] for key in ("stock_status_id", "stock_status_name", "sort_order", "is_enabled")},
            )

        disabled_warehouse_ids = sorted(existing_warehouse_ids - submitted_warehouse_ids)
        disabled_status_ids = sorted(existing_status_ids - submitted_status_ids)
        if disabled_warehouse_ids:
            placeholders = ", ".join(f":wid_{idx}" for idx, _ in enumerate(disabled_warehouse_ids))
            params = {f"wid_{idx}": row_id for idx, row_id in enumerate(disabled_warehouse_ids)}
            conn.execute(
                text(f"UPDATE bi_inventory_warehouse_map SET is_enabled = 0 WHERE id IN ({placeholders})"),
                params,
            )
        if disabled_status_ids:
            placeholders = ", ".join(f":sid_{idx}" for idx, _ in enumerate(disabled_status_ids))
            params = {f"sid_{idx}": row_id for idx, row_id in enumerate(disabled_status_ids)}
            conn.execute(
                text(f"UPDATE bi_inventory_status_map SET is_enabled = 0 WHERE id IN ({placeholders})"),
                params,
            )

    refreshed_rows = refresh_inventory_cleaning(current_engine)
    with current_engine.connect() as conn:
        latest_cleaning = to_plain(latest_date(conn, "inventory_cleaning"))
    return JSONResponse(
        {
            "saved": True,
            "warehouse_count": len(warehouse_rows),
            "status_count": len(status_rows),
            "refreshed_rows": int(refreshed_rows),
            "latest_cleaning_date": latest_cleaning,
        }
    )


@router.get("/bi-dashboard/api/return-unpack-attendance")
async def list_return_unpack_attendance(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    limit: int = Query(60, ge=1, le=365),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    start = parse_date_or_none(start_date)
    end = parse_date_or_none(end_date)
    current_engine = get_engine()
    with current_engine.connect() as conn:
        rows = return_unpack_attendance_summaries(conn, start_date=start, end_date=end, limit=limit)
        latest_cleaning = to_plain(latest_date(conn, "sales_cleaning"))
        latest_raw = to_plain(latest_date(conn, "sales"))
    return JSONResponse(
        {
            "rows": rows,
            "latest_cleaning_date": latest_cleaning,
            "latest_raw_date": latest_raw,
        }
    )


@router.post("/bi-dashboard/api/return-unpack-attendance")
async def upsert_return_unpack_attendance(
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    biz_date = parse_date_or_none(str(payload.get("biz_date") or ""))
    if biz_date is None:
        raise HTTPException(status_code=400, detail="日期不能为空")
    attendance_count = parse_decimal_or_raise(payload.get("attendance_count"), "退货拆包出勤人数")
    current_engine = get_engine()
    try:
        saved_count = save_return_unpack_attendance(current_engine, biz_date, attendance_count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with current_engine.connect() as conn:
        rows = return_unpack_attendance_summaries(conn, start_date=biz_date, end_date=biz_date, limit=1)
    summary = rows[0] if rows else {
        "biz_date": biz_date.isoformat(),
        "attendance_count": float(saved_count),
        "sales_return_warehouse": 0.0,
        "total_return_qty": 0.0,
        "total_sales_qty": 0.0,
        "return_unpack_efficiency": 0.0,
    }
    return JSONResponse(
        {
            "saved": True,
            "biz_date": biz_date.isoformat(),
            "attendance_count": float(saved_count),
            "summary": summary,
        }
    )


@router.get("/bi-dashboard/api/meta")
async def bi_meta(_auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.connect() as conn:
        latest_by_dataset = {key: to_plain(latest_date(conn, key)) for key in DATASETS}
        latest_values = [parse_date_or_none(value) for value in latest_by_dataset.values() if value]
    return JSONResponse(
        {
            "widget_types": [{"key": key, "label": label} for key, label in WIDGET_TYPES.items()],
            "widget_type_map": WIDGET_TYPES,
            "datasets": [{"key": key, "label": DATASETS[key]["label"]} for key in DATASETS],
            "dataset_map": {key: DATASETS[key]["label"] for key in DATASETS},
            "dataset_fields": {key: DATASETS[key]["fields"] for key in DATASETS},
            "aggregations": ordered_keys(AGGREGATIONS, AGGREGATION_ORDER),
            "aggregation_options": [{"key": key, "label": AGGREGATION_LABELS[key]} for key in ordered_keys(AGGREGATIONS, AGGREGATION_ORDER)],
            "aggregation_label_map": AGGREGATION_LABELS,
            "filter_operators": ordered_keys(FILTER_OPERATORS, FILTER_OPERATOR_ORDER),
            "filter_operator_options": [{"key": key, "label": FILTER_OPERATOR_LABELS[key]} for key in ordered_keys(FILTER_OPERATORS, FILTER_OPERATOR_ORDER)],
            "filter_operator_label_map": FILTER_OPERATOR_LABELS,
            "layout_heights": sorted(LAYOUT_HEIGHTS),
            "latest_by_dataset": latest_by_dataset,
            "latest_overall": max(latest_values).isoformat() if latest_values else None,
        }
    )


@router.get("/bi-dashboard/api/filter-options")
async def bi_filter_options(
    dataset: str = Query(...),
    field: str = Query(...),
    biz_date: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    if dataset not in DATASETS:
        raise HTTPException(status_code=400, detail=f"不支持的数据集：{dataset}")
    fields = DATASETS[dataset]["fields"]
    if field not in fields or not fields[field].get("filterable", False):
        raise HTTPException(status_code=400, detail=f"字段不可筛选：{field}")
    selected_date = parse_date_or_none(biz_date)
    range_start = parse_date_or_none(start_date)
    range_end = parse_date_or_none(end_date)
    current_engine = get_engine()
    with current_engine.connect() as conn:
        options, scope = query_filter_options(
            conn,
            dataset=dataset,
            field=field,
            selected_date=selected_date,
            start_date=range_start,
            end_date=range_end,
            keyword=keyword,
            limit=limit,
        )
    return JSONResponse(
        {
            "dataset": dataset,
            "field": field,
            "biz_date": to_plain(selected_date),
            "start_date": to_plain(range_start),
            "end_date": to_plain(range_end),
            "keyword": str(keyword or "").strip() or None,
            "scope": scope,
            "options": options,
        }
    )


@router.get("/bi-dashboard/api/views")
async def list_views(_auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT
                    v.id, v.name, v.description, v.global_filters_json, v.created_at, v.updated_at,
                    COUNT(w.id) AS widget_count
                FROM bi_dashboard_view v
                LEFT JOIN bi_dashboard_widget w ON w.view_id = v.id
                GROUP BY v.id, v.name, v.description, v.global_filters_json, v.created_at, v.updated_at
                ORDER BY v.id
                """
            )
        ).mappings().all()
    return JSONResponse(
        {
            "views": [
                {
                    "id": int(row["id"]),
                    "name": row["name"],
                    "description": row["description"],
                    "global_filters": normalize_global_filters(json_loads(row.get("global_filters_json"), [])),
                    "widget_count": int(row["widget_count"] or 0),
                    "created_at": to_plain(row["created_at"]),
                    "updated_at": to_plain(row["updated_at"]),
                }
                for row in rows
            ]
        }
    )


@router.post("/bi-dashboard/api/views")
async def create_view(payload: Dict[str, Any] = Body(default={}), _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    name = str(payload.get("name") or "").strip()
    description = str(payload.get("description") or "").strip()
    global_filters = normalize_global_filters(payload.get("global_filters"))
    if not name:
        raise HTTPException(status_code=400, detail="看板名称不能为空")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_view(name, description, global_filters_json)
                VALUES (:name, :description, :global_filters_json)
                """
            ),
            {
                "name": name,
                "description": description,
                "global_filters_json": json_dumps(global_filters),
            },
        )
    return JSONResponse({"id": int(result.lastrowid)})


@router.get("/bi-dashboard/api/views/{view_id}")
async def get_view(view_id: int, _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.connect() as conn:
        return JSONResponse(view_detail(conn, view_id))


@router.put("/bi-dashboard/api/views/{view_id}")
async def update_view(view_id: int, payload: Dict[str, Any] = Body(default={}), _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    name = str(payload.get("name") or "").strip()
    description = str(payload.get("description") or "").strip()
    global_filters = normalize_global_filters(payload.get("global_filters"))
    if not name:
        raise HTTPException(status_code=400, detail="看板名称不能为空")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_view(conn, view_id)
        conn.execute(
            text(
                """
                UPDATE bi_dashboard_view
                SET name = :name, description = :description, global_filters_json = :global_filters_json
                WHERE id = :id
                """
            ),
            {
                "id": view_id,
                "name": name,
                "description": description,
                "global_filters_json": json_dumps(global_filters),
            },
        )
    return JSONResponse({"id": view_id, "name": name, "description": description, "global_filters": global_filters})


@router.get("/bi-dashboard/api/views/{view_id}/export")
async def export_view(
    view_id: int,
    biz_date: str | None = Query(None),
    _auth: str = Depends(require_auth),
) -> Response:
    ensure_schema()
    selected_date = parse_date_or_none(biz_date)
    current_engine = get_engine()
    with current_engine.connect() as conn:
        detail = view_detail(conn, view_id)
        widgets = [
            {
                "id": widget["id"],
                "title": widget["title"],
                "widget_type": widget["widget_type"],
                "dataset": widget["dataset"],
                "layout": widget["layout"],
                "data": query_widget_data(conn, widget, selected_date, detail["global_filters"]),
            }
            for widget in detail["widgets"]
        ]
    content = json.dumps(
        {
            "view": {
                "id": detail["id"],
                "name": detail["name"],
                "description": detail["description"],
                "global_filters": detail["global_filters"],
            },
            "selected_date": to_plain(selected_date),
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "widgets": widgets,
        },
        ensure_ascii=False,
        indent=2,
    )
    filename = f"dashboard-view-{view_id}-{selected_date or date.today()}.json"
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/bi-dashboard/api/layout-templates")
async def list_layout_templates(_auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, name, description, layout_json, created_at, updated_at
                FROM bi_dashboard_layout_template
                ORDER BY updated_at DESC, id DESC
                """
            )
        ).mappings().all()
    return JSONResponse({"templates": [layout_template_from_row(dict(row)) for row in rows]})


@router.post("/bi-dashboard/api/layout-templates")
async def create_layout_template(
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    name = str(payload.get("name") or "").strip()
    description = str(payload.get("description") or "").strip()
    view_id = int(payload.get("view_id") or 0)
    if not name:
        raise HTTPException(status_code=400, detail="模板名称不能为空")
    if view_id <= 0:
        raise HTTPException(status_code=400, detail="缺少有效的看板 ID")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        detail = view_detail(conn, view_id)
        layout_payload = build_layout_template_payload(detail["widgets"])
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_layout_template(name, description, layout_json)
                VALUES (:name, :description, :layout_json)
                """
            ),
            {
                "name": name,
                "description": description,
                "layout_json": json_dumps(layout_payload),
            },
        )
    return JSONResponse({"id": int(result.lastrowid)})


@router.post("/bi-dashboard/api/layout-templates/{template_id}/apply")
async def apply_layout_template(
    template_id: int,
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    view_id = int(payload.get("view_id") or 0)
    if view_id <= 0:
        raise HTTPException(status_code=400, detail="缺少有效的看板 ID")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        template = load_layout_template(conn, template_id)
        load_view(conn, view_id)
        template_widgets = template["layout_payload"]["widgets"]
        if not template_widgets:
            raise HTTPException(status_code=400, detail="该布局模板没有可套用的卡片布局")
        widget_rows = conn.execute(
            text(
                """
                SELECT id, layout_json, sort_order
                FROM bi_dashboard_widget
                WHERE view_id = :view_id
                ORDER BY sort_order, id
                """
            ),
            {"view_id": view_id},
        ).mappings().all()
        placed_layouts: List[Dict[str, Any]] = []
        template_bottom = max((item["layout"]["y"] + item["layout"]["h"] for item in template_widgets), default=0)
        overflow_y = template_bottom
        for index, row in enumerate(widget_rows):
            if index < len(template_widgets):
                layout = normalize_layout(template_widgets[index]["layout"])
            else:
                current_layout = normalize_layout(json_loads(row.get("layout_json"), default_layout()))
                layout = normalize_layout({**current_layout, "x": 0, "y": overflow_y})
            while True:
                overlap = next((item for item in placed_layouts if layouts_collide(layout, item)), None)
                if not overlap:
                    break
                layout = normalize_layout({**layout, "y": overlap["y"] + overlap["h"]})
            placed_layouts.append(layout)
            overflow_y = max(overflow_y, layout["y"] + layout["h"])
            conn.execute(
                text(
                    """
                    UPDATE bi_dashboard_widget
                    SET sort_order = :sort_order, layout_json = :layout_json
                    WHERE id = :id
                    """
                ),
                {
                    "id": int(row["id"]),
                    "sort_order": (layout["y"] * 100) + layout["x"] + index,
                    "layout_json": json_dumps(layout),
                },
            )
    return JSONResponse({"applied": True, "template_id": template_id, "view_id": view_id})


@router.delete("/bi-dashboard/api/layout-templates/{template_id}")
async def delete_layout_template(template_id: int, _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_layout_template(conn, template_id)
        conn.execute(text("DELETE FROM bi_dashboard_layout_template WHERE id = :id"), {"id": template_id})
    return JSONResponse({"deleted": True})


@router.post("/bi-dashboard/api/views/{view_id}/widgets")
async def create_widget(
    view_id: int,
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    title = str(payload.get("title") or "新建组件").strip()
    widget_type = str(payload.get("widget_type") or "bar")
    dataset = str(payload.get("dataset") or "sales_cleaning")
    if widget_type not in WIDGET_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的图表类型：{widget_type}")
    if dataset not in DATASETS:
        raise HTTPException(status_code=400, detail=f"不支持的数据集：{dataset}")
    config = normalize_widget_config(widget_type, default_widget_config(widget_type, dataset))
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_view(conn, view_id)
        max_sort = int(
            conn.execute(
                text("SELECT COALESCE(MAX(sort_order), 0) FROM bi_dashboard_widget WHERE view_id = :view_id"),
                {"view_id": view_id},
            ).scalar()
            or 0
        )
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_widget(
                    view_id, title, widget_type, dataset, config_json, layout_json, sort_order, analysis_text
                ) VALUES (
                    :view_id, :title, :widget_type, :dataset, :config_json, :layout_json, :sort_order, :analysis_text
                )
                """
            ),
            {
                "view_id": view_id,
                "title": title,
                "widget_type": widget_type,
                "dataset": dataset,
                "config_json": json_dumps(config),
                "layout_json": json_dumps(default_layout()),
                "sort_order": max_sort + 10,
                "analysis_text": "",
            },
        )
    return JSONResponse({"id": int(result.lastrowid)})


@router.post("/bi-dashboard/api/widgets/{widget_id}/duplicate")
async def duplicate_widget(widget_id: int, _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.begin() as conn:
        widget = load_widget(conn, widget_id)
        duplicated_layout = normalize_layout(
            {
                **widget["layout"],
                "x": min(GRID_COLUMNS - widget["layout"].get("w", GRID_COLUMNS // 2), widget["layout"].get("x", 0) + 1),
                "y": widget["layout"].get("y", 0) + 1,
            }
        )
        max_sort = int(
            conn.execute(
                text("SELECT COALESCE(MAX(sort_order), 0) FROM bi_dashboard_widget WHERE view_id = :view_id"),
                {"view_id": widget["view_id"]},
            ).scalar()
            or 0
        )
        result = conn.execute(
            text(
                """
                INSERT INTO bi_dashboard_widget(
                    view_id, title, widget_type, dataset, config_json, layout_json, sort_order, analysis_text
                ) VALUES (
                    :view_id, :title, :widget_type, :dataset, :config_json, :layout_json, :sort_order, :analysis_text
                )
                """
            ),
            {
                "view_id": widget["view_id"],
                "title": f"{widget['title']} 副本",
                "widget_type": widget["widget_type"],
                "dataset": widget["dataset"],
                "config_json": json_dumps(widget["config"]),
                "layout_json": json_dumps(duplicated_layout),
                "sort_order": max_sort + 10,
                "analysis_text": widget["analysis_text"],
            },
        )
    return JSONResponse({"id": int(result.lastrowid)})


@router.put("/bi-dashboard/api/views/{view_id}/layout")
async def save_view_layout(
    view_id: int,
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    widgets = payload.get("widgets") or []
    if not isinstance(widgets, list):
        raise HTTPException(status_code=400, detail="布局数据格式错误，widgets 必须是数组")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_view(conn, view_id)
        valid_ids = {
            int(row[0])
            for row in conn.execute(
                text("SELECT id FROM bi_dashboard_widget WHERE view_id = :view_id"),
                {"view_id": view_id},
            ).fetchall()
        }
        for item in widgets:
            if not isinstance(item, dict):
                continue
            widget_id = int(item.get("id", 0) or 0)
            if widget_id not in valid_ids:
                continue
            conn.execute(
                text(
                    """
                    UPDATE bi_dashboard_widget
                    SET sort_order = :sort_order, layout_json = :layout_json
                    WHERE id = :id
                    """
                ),
                {
                    "id": widget_id,
                    "sort_order": int(item.get("sort_order", 0) or 0),
                    "layout_json": json_dumps(normalize_layout(item.get("layout"))),
                },
            )
    return JSONResponse({"saved": True})


@router.put("/bi-dashboard/api/widgets/{widget_id}")
async def update_widget(
    widget_id: int,
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.begin() as conn:
        widget = load_widget(conn, widget_id)
        widget_type = str(payload.get("widget_type") or widget["widget_type"])
        dataset = str(payload.get("dataset") or widget["dataset"])
        if widget_type not in WIDGET_TYPES:
            raise HTTPException(status_code=400, detail=f"不支持的图表类型：{widget_type}")
        if dataset not in DATASETS:
            raise HTTPException(status_code=400, detail=f"不支持的数据集：{dataset}")
        config_raw = payload.get("config", widget["config"])
        if isinstance(config_raw, dict):
            config_raw = dict(config_raw)
            config_raw["dataset"] = dataset
        conn.execute(
            text(
                """
                UPDATE bi_dashboard_widget
                SET
                    title = :title,
                    widget_type = :widget_type,
                    dataset = :dataset,
                    config_json = :config_json,
                    layout_json = :layout_json,
                    sort_order = :sort_order,
                    analysis_text = :analysis_text
                WHERE id = :id
                """
            ),
            {
                "id": widget_id,
                "title": str(payload.get("title") or widget["title"]).strip(),
                "widget_type": widget_type,
                "dataset": dataset,
                "config_json": json_dumps(normalize_widget_config(widget_type, config_raw if isinstance(config_raw, dict) else {})),
                "layout_json": json_dumps(normalize_layout(payload.get("layout", widget["layout"]))),
                "sort_order": int(payload.get("sort_order", widget["sort_order"])),
                "analysis_text": str(payload.get("analysis_text", widget["analysis_text"])),
            },
        )
    return JSONResponse({"id": widget_id})


@router.delete("/bi-dashboard/api/widgets/{widget_id}")
async def delete_widget(widget_id: int, _auth: str = Depends(require_auth)) -> JSONResponse:
    ensure_schema()
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_widget(conn, widget_id)
        conn.execute(text("DELETE FROM bi_dashboard_widget WHERE id = :id"), {"id": widget_id})
    return JSONResponse({"deleted": True})


@router.get("/bi-dashboard/api/widgets/{widget_id}/data")
async def widget_data(
    widget_id: int,
    biz_date: str | None = Query(None),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    selected_date = parse_date_or_none(biz_date)
    current_engine = get_engine()
    with current_engine.connect() as conn:
        widget = load_widget(conn, widget_id)
        view = load_view(conn, widget["view_id"])
        payload = query_widget_data(conn, widget, selected_date, view["global_filters"])
    payload.update({"widget_id": widget["id"], "widget_type": widget["widget_type"], "title": widget["title"]})
    return JSONResponse(payload)


@router.post("/bi-dashboard/api/widgets/{widget_id}/ai-analysis")
async def widget_ai_analysis(
    widget_id: int,
    biz_date: str | None = Query(None),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    selected_date = parse_date_or_none(biz_date)
    current_engine = get_engine()
    with current_engine.begin() as conn:
        widget = load_widget(conn, widget_id)
        view = load_view(conn, widget["view_id"])
        payload = query_widget_data(conn, widget, selected_date, view["global_filters"])
        analysis_text = build_ai_text(widget, payload)
        conn.execute(
            text("UPDATE bi_dashboard_widget SET analysis_text = :analysis_text WHERE id = :id"),
            {"id": widget_id, "analysis_text": analysis_text},
        )
    return JSONResponse({"widget_id": widget_id, "analysis_text": analysis_text})


@router.put("/bi-dashboard/api/widgets/{widget_id}/analysis")
async def update_widget_analysis(
    widget_id: int,
    payload: Dict[str, Any] = Body(default={}),
    _auth: str = Depends(require_auth),
) -> JSONResponse:
    ensure_schema()
    analysis_text = str(payload.get("analysis_text") or "")
    current_engine = get_engine()
    with current_engine.begin() as conn:
        load_widget(conn, widget_id)
        conn.execute(
            text("UPDATE bi_dashboard_widget SET analysis_text = :analysis_text WHERE id = :id"),
            {"id": widget_id, "analysis_text": analysis_text},
        )
    return JSONResponse({"widget_id": widget_id, "analysis_text": analysis_text})
