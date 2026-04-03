from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Mapping, Sequence, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from app.services.yonyou_procurement_service import (
    PROCUREMENT_DOCUMENT_MODULE_ORDER,
    create_procurement_client,
    is_procurement_yonyou_configured,
    query_procurement_document_snapshot_page_with_client,
)


PROCUREMENT_DOCUMENT_CACHE_TTL_SECONDS = 300
PROCUREMENT_DOCUMENT_INCREMENTAL_PAGE_SIZE = 100
PROCUREMENT_DOCUMENT_INCREMENTAL_MAX_PAGES = 5
PROCUREMENT_DOCUMENT_BACKFILL_PAGE_SIZE = 100
PROCUREMENT_DOCUMENT_BACKFILL_MAX_PAGES = 500

PROCUREMENT_DOCUMENT_TABLES: Dict[str, Dict[str, str]] = {
    "purchase_order": {
        "raw": "bi_yonyou_purchase_order_raw",
        "clean": "bi_yonyou_purchase_order_clean",
        "label": "采购订单",
    },
    "purchase_inbound": {
        "raw": "bi_yonyou_purchase_inbound_raw",
        "clean": "bi_yonyou_purchase_inbound_clean",
        "label": "采购入库",
    },
    "morphology_conversion": {
        "raw": "bi_yonyou_morphology_conversion_raw",
        "clean": "bi_yonyou_morphology_conversion_clean",
        "label": "形态转换",
    },
    "transfer_order": {
        "raw": "bi_yonyou_transfer_order_raw",
        "clean": "bi_yonyou_transfer_order_clean",
        "label": "调拨订单",
    },
    "storeout": {
        "raw": "bi_yonyou_storeout_raw",
        "clean": "bi_yonyou_storeout_clean",
        "label": "调出单",
    },
    "storein": {
        "raw": "bi_yonyou_storein_raw",
        "clean": "bi_yonyou_storein_clean",
        "label": "调入单",
    },
}

PROCUREMENT_MASTER_ENTITY_TABLES: Dict[str, Dict[str, str]] = {
    "supplier": {
        "raw": "bi_yonyou_supplier_raw",
        "current": "bi_supplier_master",
        "history": "bi_supplier_master_history",
        "state_key": "supplier_master",
        "label": "Supplier Master",
    },
    "employee": {
        "raw": "bi_yonyou_employee_raw",
        "current": "bi_employee_master",
        "history": "bi_employee_master_history",
        "state_key": "employee_master",
        "label": "Employee Master",
    },
}

EMPLOYEE_ROLE_FIELD_MAP: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "creator": {
        "id_fields": ("creatorId", "creator_id"),
        "code_fields": ("creatorCode", "creator_code", "creatorEmpNo", "creator_emp_no"),
        "name_fields": ("creator", "creator_name"),
    },
    "operator": {
        "id_fields": ("operatorId", "operator_id", "operator"),
        "code_fields": ("operatorCode", "operator_code", "operatorEmpNo", "operator_emp_no"),
        "name_fields": ("operator_name", "operatorName", "operator"),
    },
    "submitter": {
        "id_fields": ("submitterId", "submitter_id", "submitter"),
        "code_fields": ("submitterCode", "submitter_code", "submitterEmpNo", "submitter_emp_no"),
        "name_fields": ("submitter_username", "submitter_name", "submitter"),
    },
    "auditor": {
        "id_fields": ("auditorId", "auditor_id"),
        "code_fields": ("auditorCode", "auditor_code", "auditorEmpNo", "auditor_emp_no"),
        "name_fields": ("auditor", "auditor_name"),
    },
}


def _coalesce(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text_value = str(value).strip()
        if text_value:
            return text_value
    return ""


def _to_decimal(value: Any) -> Decimal:
    if value in (None, "", "-"):
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def _json_ready(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(key): _json_ready(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


def _truncate_text(value: Any, limit: int) -> str:
    return _coalesce(value)[:limit]


def _hash_key(*parts: Any) -> str:
    raw = "|".join(_coalesce(part) for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _build_source_line_key(row: Mapping[str, Any]) -> str:
    return _coalesce(
        row.get("detail_id"),
        row.get("detailId"),
        row.get("sourceautoid"),
        row.get("autoid"),
        row.get("rowno"),
        row.get("lineno"),
        row.get("morphologyconversiondetail_id"),
        row.get("morphologyconversiondetail_autoid"),
        row.get("product_cCode"),
        row.get("firstupcode"),
        "header",
    )


def _normalize_clean_row(module_key: str, row: Mapping[str, Any], synced_at: datetime) -> Dict[str, Any]:
    values = row.get("values") if isinstance(row.get("values"), dict) else {}
    document_id = _coalesce(row.get("document_id"))
    if not document_id:
        document_id = _coalesce(row.get("id")).split("-")[-1]
    qty_value = values.get("qty")
    return {
        "row_id": _coalesce(row.get("id")),
        "document_id": document_id,
        "document_no": _coalesce(values.get("document_no")),
        "source_no": _coalesce(values.get("source_no")),
        "vendor_name": _coalesce(values.get("vendor_name")),
        "warehouse_name": _coalesce(values.get("warehouse_name")),
        "out_warehouse": _coalesce(values.get("out_warehouse")),
        "in_warehouse": _coalesce(values.get("in_warehouse")),
        "material_code": _coalesce(values.get("material_code")),
        "qty": _to_decimal(qty_value),
        "qty_text": _coalesce(qty_value),
        "creator_name": _coalesce(values.get("creator")),
        "document_status": _coalesce(row.get("status"), "draft"),
        "updated_at_display": _coalesce(values.get("updated_at")),
        "source_pubts": _coalesce(row.get("source_pubts")),
        "clean_json": _json_dumps({"module_key": module_key, **dict(row)}),
        "synced_at": synced_at,
    }


def _normalize_raw_row(module_key: str, row: Mapping[str, Any], captured_at: datetime) -> Dict[str, Any]:
    document_id = _coalesce(row.get("id"))
    source_line_key = _build_source_line_key(row)
    return {
        "source_row_key": _hash_key(module_key, document_id, source_line_key, row.get("lineType"), row.get("code")),
        "document_id": document_id,
        "document_no": _coalesce(row.get("code")),
        "source_line_key": source_line_key,
        "line_type": _coalesce(row.get("lineType")),
        "source_status": _coalesce(row.get("status")),
        "source_verifystate": _coalesce(row.get("verifystate")),
        "source_pubts": _coalesce(row.get("pubts")),
        "source_updated_at": _coalesce(
            row.get("auditTime"),
            row.get("submitTime"),
            row.get("modifyTime"),
            row.get("createTime"),
            row.get("pubts"),
        ),
        "raw_json": _json_dumps(dict(row)),
        "captured_at": captured_at,
    }


def _execute_module_table_ddl(conn: Connection, module_key: str, raw_table: str, clean_table: str) -> None:
    raw_suffix = f"{module_key}_raw".replace("-", "_")
    clean_suffix = f"{module_key}_clean".replace("-", "_")
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {raw_table} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                source_row_key VARCHAR(64) NOT NULL,
                document_id VARCHAR(64) NOT NULL DEFAULT '',
                document_no VARCHAR(64) NOT NULL DEFAULT '',
                source_line_key VARCHAR(128) NOT NULL DEFAULT '',
                line_type VARCHAR(64) NOT NULL DEFAULT '',
                source_status VARCHAR(32) NOT NULL DEFAULT '',
                source_verifystate VARCHAR(32) NOT NULL DEFAULT '',
                source_pubts VARCHAR(64) NOT NULL DEFAULT '',
                source_updated_at VARCHAR(64) NOT NULL DEFAULT '',
                raw_json LONGTEXT NOT NULL,
                captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_{raw_suffix}_row (source_row_key),
                INDEX idx_{raw_suffix}_doc (document_id, updated_at),
                INDEX idx_{raw_suffix}_no (document_no, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {clean_table} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                row_id VARCHAR(128) NOT NULL DEFAULT '',
                document_id VARCHAR(64) NOT NULL DEFAULT '',
                document_no VARCHAR(64) NOT NULL DEFAULT '',
                source_no VARCHAR(64) NOT NULL DEFAULT '',
                vendor_name VARCHAR(128) NOT NULL DEFAULT '',
                warehouse_name VARCHAR(128) NOT NULL DEFAULT '',
                out_warehouse VARCHAR(128) NOT NULL DEFAULT '',
                in_warehouse VARCHAR(128) NOT NULL DEFAULT '',
                material_code VARCHAR(64) NOT NULL DEFAULT '',
                qty DECIMAL(20, 6) NOT NULL DEFAULT 0,
                qty_text VARCHAR(64) NOT NULL DEFAULT '',
                creator_name VARCHAR(64) NOT NULL DEFAULT '',
                document_status VARCHAR(32) NOT NULL DEFAULT 'draft',
                updated_at_display VARCHAR(64) NOT NULL DEFAULT '',
                source_pubts VARCHAR(64) NOT NULL DEFAULT '',
                clean_json LONGTEXT NOT NULL,
                synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_{clean_suffix}_doc (document_id),
                INDEX idx_{clean_suffix}_status (document_status, updated_at),
                INDEX idx_{clean_suffix}_no (document_no, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )


def _execute_master_entity_table_ddl(conn: Connection) -> None:
    supplier_raw = PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["raw"]
    supplier_current = PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["current"]
    supplier_history = PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["history"]
    employee_raw = PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["raw"]
    employee_current = PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["current"]
    employee_history = PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["history"]

    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {supplier_raw} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                observation_key VARCHAR(64) NOT NULL,
                module_key VARCHAR(64) NOT NULL DEFAULT '',
                source_document_id VARCHAR(64) NOT NULL DEFAULT '',
                source_document_no VARCHAR(64) NOT NULL DEFAULT '',
                supplier_key VARCHAR(128) NOT NULL DEFAULT '',
                supplier_id VARCHAR(64) NOT NULL DEFAULT '',
                supplier_code VARCHAR(64) NOT NULL DEFAULT '',
                supplier_name VARCHAR(128) NOT NULL DEFAULT '',
                source_updated_at VARCHAR(64) NOT NULL DEFAULT '',
                raw_json LONGTEXT NOT NULL,
                captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_yonyou_supplier_raw_observation (observation_key),
                INDEX idx_bi_yonyou_supplier_raw_key (supplier_key, updated_at),
                INDEX idx_bi_yonyou_supplier_raw_doc (source_document_id, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {supplier_current} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                supplier_key VARCHAR(128) NOT NULL,
                supplier_id VARCHAR(64) NOT NULL DEFAULT '',
                supplier_code VARCHAR(64) NOT NULL DEFAULT '',
                supplier_name VARCHAR(128) NOT NULL DEFAULT '',
                source_modules_json LONGTEXT NOT NULL,
                observation_count INT NOT NULL DEFAULT 0,
                last_seen_module VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_document_id VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_document_no VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_at VARCHAR(64) NOT NULL DEFAULT '',
                profile_json LONGTEXT NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_supplier_master_key (supplier_key),
                INDEX idx_bi_supplier_master_name (supplier_name, updated_at),
                INDEX idx_bi_supplier_master_code (supplier_code, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {supplier_history} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                supplier_key VARCHAR(128) NOT NULL,
                supplier_name VARCHAR(128) NOT NULL DEFAULT '',
                supplier_code VARCHAR(64) NOT NULL DEFAULT '',
                change_type VARCHAR(32) NOT NULL DEFAULT '',
                snapshot_hash VARCHAR(64) NOT NULL DEFAULT '',
                snapshot_json LONGTEXT NOT NULL,
                recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_supplier_master_history_snapshot (supplier_key, snapshot_hash),
                INDEX idx_bi_supplier_master_history_time (recorded_at, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {employee_raw} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                observation_key VARCHAR(64) NOT NULL,
                module_key VARCHAR(64) NOT NULL DEFAULT '',
                source_document_id VARCHAR(64) NOT NULL DEFAULT '',
                source_document_no VARCHAR(64) NOT NULL DEFAULT '',
                employee_key VARCHAR(128) NOT NULL DEFAULT '',
                employee_id VARCHAR(64) NOT NULL DEFAULT '',
                employee_code VARCHAR(64) NOT NULL DEFAULT '',
                employee_name VARCHAR(128) NOT NULL DEFAULT '',
                employee_role VARCHAR(32) NOT NULL DEFAULT '',
                source_updated_at VARCHAR(64) NOT NULL DEFAULT '',
                raw_json LONGTEXT NOT NULL,
                captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_yonyou_employee_raw_observation (observation_key),
                INDEX idx_bi_yonyou_employee_raw_key (employee_key, updated_at),
                INDEX idx_bi_yonyou_employee_raw_doc (source_document_id, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {employee_current} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                employee_key VARCHAR(128) NOT NULL,
                employee_id VARCHAR(64) NOT NULL DEFAULT '',
                employee_code VARCHAR(64) NOT NULL DEFAULT '',
                employee_name VARCHAR(128) NOT NULL DEFAULT '',
                role_tags_json LONGTEXT NOT NULL,
                source_modules_json LONGTEXT NOT NULL,
                observation_count INT NOT NULL DEFAULT 0,
                last_seen_module VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_document_id VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_document_no VARCHAR(64) NOT NULL DEFAULT '',
                last_seen_at VARCHAR(64) NOT NULL DEFAULT '',
                profile_json LONGTEXT NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_employee_master_key (employee_key),
                INDEX idx_bi_employee_master_name (employee_name, updated_at),
                INDEX idx_bi_employee_master_code (employee_code, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )
    conn.execute(
        text(
            f"""
            CREATE TABLE IF NOT EXISTS {employee_history} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                employee_key VARCHAR(128) NOT NULL,
                employee_name VARCHAR(128) NOT NULL DEFAULT '',
                employee_code VARCHAR(64) NOT NULL DEFAULT '',
                change_type VARCHAR(32) NOT NULL DEFAULT '',
                snapshot_hash VARCHAR(64) NOT NULL DEFAULT '',
                snapshot_json LONGTEXT NOT NULL,
                recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_bi_employee_master_history_snapshot (employee_key, snapshot_hash),
                INDEX idx_bi_employee_master_history_time (recorded_at, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    )


def _looks_like_identifier(value: Any) -> bool:
    text_value = _coalesce(value)
    if not text_value:
        return False
    if text_value.isdigit():
        return True
    if len(text_value) >= 16 and all(char.isdigit() for char in text_value if char.isdigit()):
        return True
    return all(ord(char) < 128 and (char.isalnum() or char in "-_") for char in text_value)


def _snapshot_hash(payload: Mapping[str, Any]) -> str:
    normalized_payload = _json_ready(dict(payload))
    raw = json.dumps(normalized_payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _entity_marker(source_updated_at: Any, document_id: Any) -> Tuple[str, int, str]:
    normalized_time = _normalize_cursor_time(source_updated_at)
    normalized_document_id = _coalesce(document_id)
    return (normalized_time, _document_id_rank(normalized_document_id), normalized_document_id)


def _extract_supplier_observation(
    module_key: str,
    row: Mapping[str, Any],
    captured_at: datetime,
) -> Dict[str, Any] | None:
    document_id = _coalesce(row.get("id"))
    if not document_id:
        return None
    supplier_id = _coalesce(
        row.get("vendor"),
        row.get("vendor_id"),
        row.get("invoiceVendor"),
        row.get("invoicevendor"),
        row.get("supplierId"),
        row.get("supplier_id"),
    )
    supplier_code = _coalesce(
        row.get("vendor_code"),
        row.get("invoiceVendor_code"),
        row.get("invoice_vendor_code"),
        row.get("invoicevendor_code"),
        row.get("supplierCode"),
        row.get("supplier_code"),
    )
    supplier_name = _coalesce(
        row.get("vendor_name"),
        row.get("invoiceVendor_name"),
        row.get("invoice_vendor_name"),
        row.get("vendorName"),
        row.get("supplierName"),
        row.get("supplier_name"),
        supplier_code,
        supplier_id,
    )
    supplier_key = _truncate_text(_coalesce(supplier_code, supplier_id, supplier_name), 128)
    if not supplier_key:
        return None
    source_document_no = _coalesce(row.get("code"), row.get("srcbillno"), row.get("srcBillNO"))
    source_updated_at = _coalesce(
        row.get("auditTime"),
        row.get("submitTime"),
        row.get("modifyTime"),
        row.get("createTime"),
        row.get("pubts"),
    )
    raw_snapshot = {
        "module_key": module_key,
        "document_id": document_id,
        "document_no": source_document_no,
        "supplier_id": supplier_id,
        "supplier_code": supplier_code,
        "supplier_name": supplier_name,
    }
    return {
        "observation_key": _hash_key("supplier", module_key, document_id, supplier_key),
        "module_key": module_key,
        "source_document_id": document_id,
        "source_document_no": source_document_no,
        "supplier_key": supplier_key,
        "supplier_id": _truncate_text(supplier_id, 64),
        "supplier_code": _truncate_text(supplier_code, 64),
        "supplier_name": _truncate_text(supplier_name, 128),
        "source_updated_at": _truncate_text(source_updated_at, 64),
        "raw_json": _json_dumps(raw_snapshot),
        "captured_at": captured_at,
    }


def _extract_employee_observations(
    module_key: str,
    row: Mapping[str, Any],
    captured_at: datetime,
) -> List[Dict[str, Any]]:
    document_id = _coalesce(row.get("id"))
    if not document_id:
        return []
    source_document_no = _coalesce(row.get("code"), row.get("srcbillno"), row.get("srcBillNO"))
    source_updated_at = _coalesce(
        row.get("auditTime"),
        row.get("submitTime"),
        row.get("modifyTime"),
        row.get("createTime"),
        row.get("pubts"),
    )
    observations: List[Dict[str, Any]] = []
    seen_keys: set[str] = set()
    for role_type, field_map in EMPLOYEE_ROLE_FIELD_MAP.items():
        employee_id = _coalesce(*(row.get(field) for field in field_map["id_fields"]))
        employee_code = _coalesce(*(row.get(field) for field in field_map["code_fields"]))
        employee_name = _coalesce(*(row.get(field) for field in field_map["name_fields"]))
        if not employee_name and employee_id and not _looks_like_identifier(employee_id):
            employee_name = employee_id
            employee_id = ""
        employee_key = _truncate_text(_coalesce(employee_code, employee_id, employee_name), 128)
        if not employee_key:
            continue
        observation_key = _hash_key("employee", module_key, document_id, role_type, employee_key)
        if observation_key in seen_keys:
            continue
        seen_keys.add(observation_key)
        raw_snapshot = {
            "module_key": module_key,
            "document_id": document_id,
            "document_no": source_document_no,
            "role_type": role_type,
            "employee_id": employee_id,
            "employee_code": employee_code,
            "employee_name": employee_name,
        }
        observations.append(
            {
                "observation_key": observation_key,
                "module_key": module_key,
                "source_document_id": document_id,
                "source_document_no": source_document_no,
                "employee_key": employee_key,
                "employee_id": _truncate_text(employee_id, 64),
                "employee_code": _truncate_text(employee_code, 64),
                "employee_name": _truncate_text(employee_name, 128),
                "employee_role": role_type,
                "source_updated_at": _truncate_text(source_updated_at, 64),
                "raw_json": _json_dumps(raw_snapshot),
                "captured_at": captured_at,
            }
        )
    return observations

def _ensure_varchar_column_length(conn: Connection, table_name: str, column_name: str, min_length: int) -> None:
    database_name = conn.execute(text("SELECT DATABASE()")).scalar()
    if not database_name:
        return
    column = conn.execute(
        text(
            """
            SELECT CHARACTER_MAXIMUM_LENGTH AS max_length
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = :schema
              AND TABLE_NAME = :table_name
              AND COLUMN_NAME = :column_name
            """
        ),
        {
            "schema": str(database_name),
            "table_name": table_name,
            "column_name": column_name,
        },
    ).mappings().first()
    if not column:
        return
    if int(column.get("max_length") or 0) >= int(min_length):
        return
    conn.execute(
        text(
            f"""
            ALTER TABLE {table_name}
            MODIFY COLUMN {column_name} VARCHAR({int(min_length)}) NOT NULL DEFAULT ''
            """
        )
    )


def ensure_procurement_cache_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_yonyou_scm_sync_state (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    module_key VARCHAR(64) NOT NULL,
                    module_name VARCHAR(64) NOT NULL DEFAULT '',
                    last_synced_at DATETIME NULL,
                    last_status VARCHAR(32) NOT NULL DEFAULT 'idle',
                    last_message VARCHAR(255) NOT NULL DEFAULT '',
                    raw_row_count INT NOT NULL DEFAULT 0,
                    clean_row_count INT NOT NULL DEFAULT 0,
                    latest_source_updated_at VARCHAR(64) NOT NULL DEFAULT '',
                    trigger_mode VARCHAR(32) NOT NULL DEFAULT '',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_yonyou_scm_sync_state_module (module_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        _ensure_varchar_column_length(conn, "bi_yonyou_scm_sync_state", "trigger_mode", 128)
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_yonyou_scm_sync_cursor (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    module_key VARCHAR(64) NOT NULL,
                    module_name VARCHAR(64) NOT NULL DEFAULT '',
                    latest_cursor_time VARCHAR(64) NOT NULL DEFAULT '',
                    latest_document_id VARCHAR(64) NOT NULL DEFAULT '',
                    latest_document_no VARCHAR(64) NOT NULL DEFAULT '',
                    last_incremental_synced_at DATETIME NULL,
                    last_incremental_pages INT NOT NULL DEFAULT 0,
                    last_incremental_rows INT NOT NULL DEFAULT 0,
                    last_backfill_synced_at DATETIME NULL,
                    last_backfill_pages INT NOT NULL DEFAULT 0,
                    last_backfill_rows INT NOT NULL DEFAULT 0,
                    has_full_backfill TINYINT(1) NOT NULL DEFAULT 0,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_yonyou_scm_sync_cursor_module (module_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        for module_key, tables in PROCUREMENT_DOCUMENT_TABLES.items():
            _execute_module_table_ddl(conn, module_key, tables["raw"], tables["clean"])
        _execute_master_entity_table_ddl(conn)


def _upsert_raw_rows(conn: Connection, table_name: str, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT INTO {table_name} (
                source_row_key,
                document_id,
                document_no,
                source_line_key,
                line_type,
                source_status,
                source_verifystate,
                source_pubts,
                source_updated_at,
                raw_json,
                captured_at
            ) VALUES (
                :source_row_key,
                :document_id,
                :document_no,
                :source_line_key,
                :line_type,
                :source_status,
                :source_verifystate,
                :source_pubts,
                :source_updated_at,
                :raw_json,
                :captured_at
            )
            ON DUPLICATE KEY UPDATE
                document_id = VALUES(document_id),
                document_no = VALUES(document_no),
                source_line_key = VALUES(source_line_key),
                line_type = VALUES(line_type),
                source_status = VALUES(source_status),
                source_verifystate = VALUES(source_verifystate),
                source_pubts = VALUES(source_pubts),
                source_updated_at = VALUES(source_updated_at),
                raw_json = VALUES(raw_json),
                captured_at = VALUES(captured_at),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        list(rows),
    )


def _upsert_clean_rows(conn: Connection, table_name: str, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT INTO {table_name} (
                row_id,
                document_id,
                document_no,
                source_no,
                vendor_name,
                warehouse_name,
                out_warehouse,
                in_warehouse,
                material_code,
                qty,
                qty_text,
                creator_name,
                document_status,
                updated_at_display,
                source_pubts,
                clean_json,
                synced_at
            ) VALUES (
                :row_id,
                :document_id,
                :document_no,
                :source_no,
                :vendor_name,
                :warehouse_name,
                :out_warehouse,
                :in_warehouse,
                :material_code,
                :qty,
                :qty_text,
                :creator_name,
                :document_status,
                :updated_at_display,
                :source_pubts,
                :clean_json,
                :synced_at
            )
            ON DUPLICATE KEY UPDATE
                row_id = VALUES(row_id),
                document_no = VALUES(document_no),
                source_no = VALUES(source_no),
                vendor_name = VALUES(vendor_name),
                warehouse_name = VALUES(warehouse_name),
                out_warehouse = VALUES(out_warehouse),
                in_warehouse = VALUES(in_warehouse),
                material_code = VALUES(material_code),
                qty = VALUES(qty),
                qty_text = VALUES(qty_text),
                creator_name = VALUES(creator_name),
                document_status = VALUES(document_status),
                updated_at_display = VALUES(updated_at_display),
                source_pubts = VALUES(source_pubts),
                clean_json = VALUES(clean_json),
                synced_at = VALUES(synced_at),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        list(rows),
    )


def _replace_master_raw_rows(conn: Connection, table_name: str, rows: Sequence[Dict[str, Any]], columns: Sequence[str]) -> None:
    conn.execute(text(f"DELETE FROM {table_name}"))
    if not rows:
        return
    column_sql = ",\n                ".join(columns)
    value_sql = ",\n                ".join(f":{column}" for column in columns)
    conn.execute(
        text(
            f"""
            INSERT INTO {table_name} (
                {column_sql}
            ) VALUES (
                {value_sql}
            )
            """
        ),
        list(rows),
    )


def _load_procurement_document_raw_payloads(conn: Connection) -> List[Tuple[str, Dict[str, Any], datetime]]:
    payloads: List[Tuple[str, Dict[str, Any], datetime]] = []
    for module_key in PROCUREMENT_DOCUMENT_MODULE_ORDER:
        table_name = PROCUREMENT_DOCUMENT_TABLES[module_key]["raw"]
        rows = conn.execute(
            text(
                f"""
                SELECT raw_json, captured_at
                FROM {table_name}
                ORDER BY id
                """
            )
        ).mappings().all()
        for row in rows:
            try:
                payload = json.loads(str(row.get("raw_json") or ""))
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            captured_at = row.get("captured_at")
            if not isinstance(captured_at, datetime):
                captured_at = datetime.now()
            payloads.append((module_key, payload, captured_at))
    return payloads


def _build_master_entity_raw_rows(
    conn: Connection,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    supplier_rows: Dict[str, Dict[str, Any]] = {}
    employee_rows: Dict[str, Dict[str, Any]] = {}
    for module_key, payload, captured_at in _load_procurement_document_raw_payloads(conn):
        supplier_observation = _extract_supplier_observation(module_key, payload, captured_at)
        if supplier_observation:
            supplier_rows[str(supplier_observation["observation_key"])] = supplier_observation
        for employee_observation in _extract_employee_observations(module_key, payload, captured_at):
            employee_rows[str(employee_observation["observation_key"])] = employee_observation
    return list(supplier_rows.values()), list(employee_rows.values())


def _aggregate_supplier_profiles(rows: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    aggregated: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        supplier_key = _coalesce(row.get("supplier_key"))
        if not supplier_key:
            continue
        marker = _entity_marker(row.get("source_updated_at"), row.get("source_document_id"))
        current = aggregated.get(supplier_key)
        if current is None:
            current = {
                "supplier_key": supplier_key,
                "supplier_id": _coalesce(row.get("supplier_id")),
                "supplier_code": _coalesce(row.get("supplier_code")),
                "supplier_name": _coalesce(row.get("supplier_name")),
                "source_modules": set(),
                "observation_count": 0,
                "last_seen_module": _coalesce(row.get("module_key")),
                "last_seen_document_id": _coalesce(row.get("source_document_id")),
                "last_seen_document_no": _coalesce(row.get("source_document_no")),
                "last_seen_at": _coalesce(row.get("source_updated_at")),
                "_marker": marker,
                "_sample_docs": [],
            }
            aggregated[supplier_key] = current
        current["observation_count"] = int(current["observation_count"]) + 1
        current["source_modules"].add(_coalesce(row.get("module_key")))
        if not _coalesce(current.get("supplier_id")):
            current["supplier_id"] = _coalesce(row.get("supplier_id"))
        if not _coalesce(current.get("supplier_code")):
            current["supplier_code"] = _coalesce(row.get("supplier_code"))
        if not _coalesce(current.get("supplier_name")):
            current["supplier_name"] = _coalesce(row.get("supplier_name"))
        if marker > current["_marker"]:
            current["last_seen_module"] = _coalesce(row.get("module_key"))
            current["last_seen_document_id"] = _coalesce(row.get("source_document_id"))
            current["last_seen_document_no"] = _coalesce(row.get("source_document_no"))
            current["last_seen_at"] = _coalesce(row.get("source_updated_at"))
            current["_marker"] = marker
        sample_docs = current["_sample_docs"]
        sample_doc = _coalesce(row.get("source_document_no"), row.get("source_document_id"))
        if sample_doc and sample_doc not in sample_docs and len(sample_docs) < 5:
            sample_docs.append(sample_doc)
    result: Dict[str, Dict[str, Any]] = {}
    for supplier_key, row in aggregated.items():
        source_modules = sorted(item for item in row["source_modules"] if item)
        profile_payload = {
            "supplier_key": supplier_key,
            "supplier_id": row["supplier_id"],
            "supplier_code": row["supplier_code"],
            "supplier_name": row["supplier_name"],
            "source_modules": source_modules,
            "observation_count": row["observation_count"],
            "sample_documents": row["_sample_docs"],
        }
        result[supplier_key] = {
            "supplier_key": supplier_key,
            "supplier_id": _truncate_text(row["supplier_id"], 64),
            "supplier_code": _truncate_text(row["supplier_code"], 64),
            "supplier_name": _truncate_text(row["supplier_name"], 128),
            "source_modules_json": _json_dumps(source_modules),
            "observation_count": int(row["observation_count"]),
            "last_seen_module": _truncate_text(row["last_seen_module"], 64),
            "last_seen_document_id": _truncate_text(row["last_seen_document_id"], 64),
            "last_seen_document_no": _truncate_text(row["last_seen_document_no"], 64),
            "last_seen_at": _truncate_text(row["last_seen_at"], 64),
            "profile_json": _json_dumps(profile_payload),
            "is_active": 1,
        }
    return result


def _aggregate_employee_profiles(rows: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    aggregated: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        employee_key = _coalesce(row.get("employee_key"))
        if not employee_key:
            continue
        marker = _entity_marker(row.get("source_updated_at"), row.get("source_document_id"))
        current = aggregated.get(employee_key)
        if current is None:
            current = {
                "employee_key": employee_key,
                "employee_id": _coalesce(row.get("employee_id")),
                "employee_code": _coalesce(row.get("employee_code")),
                "employee_name": _coalesce(row.get("employee_name")),
                "role_tags": set(),
                "source_modules": set(),
                "observation_count": 0,
                "last_seen_module": _coalesce(row.get("module_key")),
                "last_seen_document_id": _coalesce(row.get("source_document_id")),
                "last_seen_document_no": _coalesce(row.get("source_document_no")),
                "last_seen_at": _coalesce(row.get("source_updated_at")),
                "_marker": marker,
                "_sample_docs": [],
            }
            aggregated[employee_key] = current
        current["observation_count"] = int(current["observation_count"]) + 1
        current["role_tags"].add(_coalesce(row.get("employee_role")))
        current["source_modules"].add(_coalesce(row.get("module_key")))
        if not _coalesce(current.get("employee_id")):
            current["employee_id"] = _coalesce(row.get("employee_id"))
        if not _coalesce(current.get("employee_code")):
            current["employee_code"] = _coalesce(row.get("employee_code"))
        if not _coalesce(current.get("employee_name")):
            current["employee_name"] = _coalesce(row.get("employee_name"))
        if marker > current["_marker"]:
            current["last_seen_module"] = _coalesce(row.get("module_key"))
            current["last_seen_document_id"] = _coalesce(row.get("source_document_id"))
            current["last_seen_document_no"] = _coalesce(row.get("source_document_no"))
            current["last_seen_at"] = _coalesce(row.get("source_updated_at"))
            current["_marker"] = marker
        sample_docs = current["_sample_docs"]
        sample_doc = _coalesce(row.get("source_document_no"), row.get("source_document_id"))
        if sample_doc and sample_doc not in sample_docs and len(sample_docs) < 5:
            sample_docs.append(sample_doc)
    result: Dict[str, Dict[str, Any]] = {}
    for employee_key, row in aggregated.items():
        role_tags = sorted(item for item in row["role_tags"] if item)
        source_modules = sorted(item for item in row["source_modules"] if item)
        profile_payload = {
            "employee_key": employee_key,
            "employee_id": row["employee_id"],
            "employee_code": row["employee_code"],
            "employee_name": row["employee_name"],
            "role_tags": role_tags,
            "source_modules": source_modules,
            "observation_count": row["observation_count"],
            "sample_documents": row["_sample_docs"],
        }
        result[employee_key] = {
            "employee_key": employee_key,
            "employee_id": _truncate_text(row["employee_id"], 64),
            "employee_code": _truncate_text(row["employee_code"], 64),
            "employee_name": _truncate_text(row["employee_name"], 128),
            "role_tags_json": _json_dumps(role_tags),
            "source_modules_json": _json_dumps(source_modules),
            "observation_count": int(row["observation_count"]),
            "last_seen_module": _truncate_text(row["last_seen_module"], 64),
            "last_seen_document_id": _truncate_text(row["last_seen_document_id"], 64),
            "last_seen_document_no": _truncate_text(row["last_seen_document_no"], 64),
            "last_seen_at": _truncate_text(row["last_seen_at"], 64),
            "profile_json": _json_dumps(profile_payload),
            "is_active": 1,
        }
    return result


def _load_current_rows_by_key(conn: Connection, table_name: str, key_column: str) -> Dict[str, Dict[str, Any]]:
    rows = conn.execute(text(f"SELECT * FROM {table_name}")).mappings().all()
    return {_coalesce(row.get(key_column)): dict(row) for row in rows if _coalesce(row.get(key_column))}


def _insert_supplier_history(conn: Connection, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT IGNORE INTO {PROCUREMENT_MASTER_ENTITY_TABLES['supplier']['history']} (
                supplier_key,
                supplier_name,
                supplier_code,
                change_type,
                snapshot_hash,
                snapshot_json,
                recorded_at
            ) VALUES (
                :supplier_key,
                :supplier_name,
                :supplier_code,
                :change_type,
                :snapshot_hash,
                :snapshot_json,
                :recorded_at
            )
            """
        ),
        list(rows),
    )


def _insert_employee_history(conn: Connection, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT IGNORE INTO {PROCUREMENT_MASTER_ENTITY_TABLES['employee']['history']} (
                employee_key,
                employee_name,
                employee_code,
                change_type,
                snapshot_hash,
                snapshot_json,
                recorded_at
            ) VALUES (
                :employee_key,
                :employee_name,
                :employee_code,
                :change_type,
                :snapshot_hash,
                :snapshot_json,
                :recorded_at
            )
            """
        ),
        list(rows),
    )


def _upsert_supplier_master_rows(conn: Connection, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT INTO {PROCUREMENT_MASTER_ENTITY_TABLES['supplier']['current']} (
                supplier_key,
                supplier_id,
                supplier_code,
                supplier_name,
                source_modules_json,
                observation_count,
                last_seen_module,
                last_seen_document_id,
                last_seen_document_no,
                last_seen_at,
                profile_json,
                is_active,
                first_seen_at,
                last_synced_at
            ) VALUES (
                :supplier_key,
                :supplier_id,
                :supplier_code,
                :supplier_name,
                :source_modules_json,
                :observation_count,
                :last_seen_module,
                :last_seen_document_id,
                :last_seen_document_no,
                :last_seen_at,
                :profile_json,
                :is_active,
                :first_seen_at,
                :last_synced_at
            )
            ON DUPLICATE KEY UPDATE
                supplier_id = VALUES(supplier_id),
                supplier_code = VALUES(supplier_code),
                supplier_name = VALUES(supplier_name),
                source_modules_json = VALUES(source_modules_json),
                observation_count = VALUES(observation_count),
                last_seen_module = VALUES(last_seen_module),
                last_seen_document_id = VALUES(last_seen_document_id),
                last_seen_document_no = VALUES(last_seen_document_no),
                last_seen_at = VALUES(last_seen_at),
                profile_json = VALUES(profile_json),
                is_active = VALUES(is_active),
                first_seen_at = VALUES(first_seen_at),
                last_synced_at = VALUES(last_synced_at),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        list(rows),
    )


def _upsert_employee_master_rows(conn: Connection, rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        return
    conn.execute(
        text(
            f"""
            INSERT INTO {PROCUREMENT_MASTER_ENTITY_TABLES['employee']['current']} (
                employee_key,
                employee_id,
                employee_code,
                employee_name,
                role_tags_json,
                source_modules_json,
                observation_count,
                last_seen_module,
                last_seen_document_id,
                last_seen_document_no,
                last_seen_at,
                profile_json,
                is_active,
                first_seen_at,
                last_synced_at
            ) VALUES (
                :employee_key,
                :employee_id,
                :employee_code,
                :employee_name,
                :role_tags_json,
                :source_modules_json,
                :observation_count,
                :last_seen_module,
                :last_seen_document_id,
                :last_seen_document_no,
                :last_seen_at,
                :profile_json,
                :is_active,
                :first_seen_at,
                :last_synced_at
            )
            ON DUPLICATE KEY UPDATE
                employee_id = VALUES(employee_id),
                employee_code = VALUES(employee_code),
                employee_name = VALUES(employee_name),
                role_tags_json = VALUES(role_tags_json),
                source_modules_json = VALUES(source_modules_json),
                observation_count = VALUES(observation_count),
                last_seen_module = VALUES(last_seen_module),
                last_seen_document_id = VALUES(last_seen_document_id),
                last_seen_document_no = VALUES(last_seen_document_no),
                last_seen_at = VALUES(last_seen_at),
                profile_json = VALUES(profile_json),
                is_active = VALUES(is_active),
                first_seen_at = VALUES(first_seen_at),
                last_synced_at = VALUES(last_synced_at),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        list(rows),
    )


def refresh_procurement_master_entity_cache_from_conn(
    conn: Connection,
    *,
    synced_at: datetime | None = None,
    trigger: str = "derived",
) -> Dict[str, Any]:
    effective_synced_at = synced_at or datetime.now()
    ensure_payload_time = effective_synced_at
    supplier_rows, employee_rows = _build_master_entity_raw_rows(conn)
    _replace_master_raw_rows(
        conn,
        PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["raw"],
        supplier_rows,
        (
            "observation_key",
            "module_key",
            "source_document_id",
            "source_document_no",
            "supplier_key",
            "supplier_id",
            "supplier_code",
            "supplier_name",
            "source_updated_at",
            "raw_json",
            "captured_at",
        ),
    )
    _replace_master_raw_rows(
        conn,
        PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["raw"],
        employee_rows,
        (
            "observation_key",
            "module_key",
            "source_document_id",
            "source_document_no",
            "employee_key",
            "employee_id",
            "employee_code",
            "employee_name",
            "employee_role",
            "source_updated_at",
            "raw_json",
            "captured_at",
        ),
    )

    aggregated_suppliers = _aggregate_supplier_profiles(supplier_rows)
    aggregated_employees = _aggregate_employee_profiles(employee_rows)
    existing_suppliers = _load_current_rows_by_key(
        conn,
        PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["current"],
        "supplier_key",
    )
    existing_employees = _load_current_rows_by_key(
        conn,
        PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["current"],
        "employee_key",
    )

    supplier_history_rows: List[Dict[str, Any]] = []
    employee_history_rows: List[Dict[str, Any]] = []
    supplier_upserts: List[Dict[str, Any]] = []
    employee_upserts: List[Dict[str, Any]] = []

    for supplier_key, row in aggregated_suppliers.items():
        existing = existing_suppliers.get(supplier_key)
        first_seen_at = existing.get("first_seen_at") if existing else ensure_payload_time
        payload = {
            **row,
            "first_seen_at": first_seen_at if isinstance(first_seen_at, datetime) else ensure_payload_time,
            "last_synced_at": ensure_payload_time,
        }
        supplier_upserts.append(payload)
        snapshot = {
            "supplier_key": payload["supplier_key"],
            "supplier_id": payload["supplier_id"],
            "supplier_code": payload["supplier_code"],
            "supplier_name": payload["supplier_name"],
            "source_modules_json": payload["source_modules_json"],
            "is_active": payload["is_active"],
        }
        snapshot_hash = _snapshot_hash(snapshot)
        existing_hash = ""
        if existing:
            existing_hash = _snapshot_hash(
                {
                    "supplier_key": _coalesce(existing.get("supplier_key")),
                    "supplier_id": _coalesce(existing.get("supplier_id")),
                    "supplier_code": _coalesce(existing.get("supplier_code")),
                    "supplier_name": _coalesce(existing.get("supplier_name")),
                    "source_modules_json": _coalesce(existing.get("source_modules_json")),
                    "is_active": int(existing.get("is_active") or 0),
                }
            )
        if not existing or existing_hash != snapshot_hash:
            supplier_history_rows.append(
                {
                    "supplier_key": payload["supplier_key"],
                    "supplier_name": payload["supplier_name"],
                    "supplier_code": payload["supplier_code"],
                    "change_type": "create" if not existing else "update",
                    "snapshot_hash": snapshot_hash,
                    "snapshot_json": _json_dumps(snapshot),
                    "recorded_at": ensure_payload_time,
                }
            )

    missing_supplier_keys = [
        key
        for key, row in existing_suppliers.items()
        if key not in aggregated_suppliers and int(row.get("is_active") or 0) == 1
    ]
    if missing_supplier_keys:
        conn.execute(
            text(
                f"""
                UPDATE {PROCUREMENT_MASTER_ENTITY_TABLES['supplier']['current']}
                SET is_active = 0,
                    last_synced_at = :synced_at,
                    updated_at = CURRENT_TIMESTAMP
                WHERE supplier_key IN ({", ".join(f":supplier_key_{index}" for index, _ in enumerate(missing_supplier_keys))})
                """
            ),
            {"synced_at": ensure_payload_time, **{f"supplier_key_{index}": value for index, value in enumerate(missing_supplier_keys)}},
        )
        for key in missing_supplier_keys:
            existing = existing_suppliers[key]
            snapshot = {
                "supplier_key": _coalesce(existing.get("supplier_key")),
                "supplier_id": _coalesce(existing.get("supplier_id")),
                "supplier_code": _coalesce(existing.get("supplier_code")),
                "supplier_name": _coalesce(existing.get("supplier_name")),
                "source_modules_json": _coalesce(existing.get("source_modules_json")),
                "is_active": 0,
            }
            supplier_history_rows.append(
                {
                    "supplier_key": _coalesce(existing.get("supplier_key")),
                    "supplier_name": _coalesce(existing.get("supplier_name")),
                    "supplier_code": _coalesce(existing.get("supplier_code")),
                    "change_type": "deactivate",
                    "snapshot_hash": _snapshot_hash(snapshot),
                    "snapshot_json": _json_dumps(snapshot),
                    "recorded_at": ensure_payload_time,
                }
            )

    for employee_key, row in aggregated_employees.items():
        existing = existing_employees.get(employee_key)
        first_seen_at = existing.get("first_seen_at") if existing else ensure_payload_time
        payload = {
            **row,
            "first_seen_at": first_seen_at if isinstance(first_seen_at, datetime) else ensure_payload_time,
            "last_synced_at": ensure_payload_time,
        }
        employee_upserts.append(payload)
        snapshot = {
            "employee_key": payload["employee_key"],
            "employee_id": payload["employee_id"],
            "employee_code": payload["employee_code"],
            "employee_name": payload["employee_name"],
            "role_tags_json": payload["role_tags_json"],
            "source_modules_json": payload["source_modules_json"],
            "is_active": payload["is_active"],
        }
        snapshot_hash = _snapshot_hash(snapshot)
        existing_hash = ""
        if existing:
            existing_hash = _snapshot_hash(
                {
                    "employee_key": _coalesce(existing.get("employee_key")),
                    "employee_id": _coalesce(existing.get("employee_id")),
                    "employee_code": _coalesce(existing.get("employee_code")),
                    "employee_name": _coalesce(existing.get("employee_name")),
                    "role_tags_json": _coalesce(existing.get("role_tags_json")),
                    "source_modules_json": _coalesce(existing.get("source_modules_json")),
                    "is_active": int(existing.get("is_active") or 0),
                }
            )
        if not existing or existing_hash != snapshot_hash:
            employee_history_rows.append(
                {
                    "employee_key": payload["employee_key"],
                    "employee_name": payload["employee_name"],
                    "employee_code": payload["employee_code"],
                    "change_type": "create" if not existing else "update",
                    "snapshot_hash": snapshot_hash,
                    "snapshot_json": _json_dumps(snapshot),
                    "recorded_at": ensure_payload_time,
                }
            )

    missing_employee_keys = [
        key
        for key, row in existing_employees.items()
        if key not in aggregated_employees and int(row.get("is_active") or 0) == 1
    ]
    if missing_employee_keys:
        conn.execute(
            text(
                f"""
                UPDATE {PROCUREMENT_MASTER_ENTITY_TABLES['employee']['current']}
                SET is_active = 0,
                    last_synced_at = :synced_at,
                    updated_at = CURRENT_TIMESTAMP
                WHERE employee_key IN ({", ".join(f":employee_key_{index}" for index, _ in enumerate(missing_employee_keys))})
                """
            ),
            {"synced_at": ensure_payload_time, **{f"employee_key_{index}": value for index, value in enumerate(missing_employee_keys)}},
        )
        for key in missing_employee_keys:
            existing = existing_employees[key]
            snapshot = {
                "employee_key": _coalesce(existing.get("employee_key")),
                "employee_id": _coalesce(existing.get("employee_id")),
                "employee_code": _coalesce(existing.get("employee_code")),
                "employee_name": _coalesce(existing.get("employee_name")),
                "role_tags_json": _coalesce(existing.get("role_tags_json")),
                "source_modules_json": _coalesce(existing.get("source_modules_json")),
                "is_active": 0,
            }
            employee_history_rows.append(
                {
                    "employee_key": _coalesce(existing.get("employee_key")),
                    "employee_name": _coalesce(existing.get("employee_name")),
                    "employee_code": _coalesce(existing.get("employee_code")),
                    "change_type": "deactivate",
                    "snapshot_hash": _snapshot_hash(snapshot),
                    "snapshot_json": _json_dumps(snapshot),
                    "recorded_at": ensure_payload_time,
                }
            )

    _insert_supplier_history(conn, supplier_history_rows)
    _insert_employee_history(conn, employee_history_rows)
    _upsert_supplier_master_rows(conn, supplier_upserts)
    _upsert_employee_master_rows(conn, employee_upserts)

    supplier_latest = max((row.get("last_seen_at") or "" for row in aggregated_suppliers.values()), default="")
    employee_latest = max((row.get("last_seen_at") or "" for row in aggregated_employees.values()), default="")
    _upsert_sync_state(
        conn,
        {
            "module_key": PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["state_key"],
            "module_name": PROCUREMENT_MASTER_ENTITY_TABLES["supplier"]["label"],
            "last_synced_at": ensure_payload_time,
            "last_status": "success",
            "last_message": f"rebuilt supplier profiles from {len(supplier_rows)} observations",
            "raw_row_count": len(supplier_rows),
            "clean_row_count": len(aggregated_suppliers),
            "latest_source_updated_at": supplier_latest,
            "trigger_mode": trigger,
        },
    )
    _upsert_sync_state(
        conn,
        {
            "module_key": PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["state_key"],
            "module_name": PROCUREMENT_MASTER_ENTITY_TABLES["employee"]["label"],
            "last_synced_at": ensure_payload_time,
            "last_status": "success",
            "last_message": f"rebuilt employee profiles from {len(employee_rows)} observations",
            "raw_row_count": len(employee_rows),
            "clean_row_count": len(aggregated_employees),
            "latest_source_updated_at": employee_latest,
            "trigger_mode": trigger,
        },
    )
    return {
        "supplier": {
            "raw_row_count": len(supplier_rows),
            "current_count": len(aggregated_suppliers),
            "latest_source_updated_at": supplier_latest,
        },
        "employee": {
            "raw_row_count": len(employee_rows),
            "current_count": len(aggregated_employees),
            "latest_source_updated_at": employee_latest,
        },
    }


def refresh_procurement_master_entity_cache(engine: Engine, *, trigger: str = "manual") -> Dict[str, Any]:
    ensure_procurement_cache_schema(engine)
    with engine.begin() as conn:
        return refresh_procurement_master_entity_cache_from_conn(conn, synced_at=datetime.now(), trigger=trigger)


def _upsert_sync_state(conn: Connection, payload: Dict[str, Any]) -> None:
    prepared_payload = dict(payload)
    prepared_payload["module_key"] = _truncate_text(prepared_payload.get("module_key"), 64)
    prepared_payload["module_name"] = _truncate_text(prepared_payload.get("module_name"), 64)
    prepared_payload["last_status"] = _truncate_text(prepared_payload.get("last_status"), 32)
    prepared_payload["last_message"] = _truncate_text(prepared_payload.get("last_message"), 255)
    prepared_payload["latest_source_updated_at"] = _truncate_text(prepared_payload.get("latest_source_updated_at"), 64)
    prepared_payload["trigger_mode"] = _truncate_text(prepared_payload.get("trigger_mode"), 128)
    conn.execute(
        text(
            """
            INSERT INTO bi_yonyou_scm_sync_state (
                module_key,
                module_name,
                last_synced_at,
                last_status,
                last_message,
                raw_row_count,
                clean_row_count,
                latest_source_updated_at,
                trigger_mode
            ) VALUES (
                :module_key,
                :module_name,
                :last_synced_at,
                :last_status,
                :last_message,
                :raw_row_count,
                :clean_row_count,
                :latest_source_updated_at,
                :trigger_mode
            )
            ON DUPLICATE KEY UPDATE
                module_name = VALUES(module_name),
                last_synced_at = VALUES(last_synced_at),
                last_status = VALUES(last_status),
                last_message = VALUES(last_message),
                raw_row_count = VALUES(raw_row_count),
                clean_row_count = VALUES(clean_row_count),
                latest_source_updated_at = VALUES(latest_source_updated_at),
                trigger_mode = VALUES(trigger_mode),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        prepared_payload,
    )


def _parse_cursor_datetime(value: Any) -> datetime | None:
    raw_value = _coalesce(value)
    if not raw_value:
        return None
    normalized = raw_value.replace("T", " ").replace("Z", "")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def _normalize_cursor_time(value: Any) -> str:
    parsed = _parse_cursor_datetime(value)
    if parsed is not None:
        return parsed.isoformat(sep=" ", timespec="seconds")
    return _coalesce(value)


def _document_id_rank(value: Any) -> int:
    text_value = _coalesce(value)
    try:
        return int(text_value)
    except Exception:
        return -1


def _clean_row_cursor_marker(row: Mapping[str, Any]) -> Tuple[str, int, str]:
    cursor_time = _normalize_cursor_time(row.get("updated_at_display") or row.get("source_pubts"))
    document_id = _coalesce(row.get("document_id"))
    return (cursor_time, _document_id_rank(document_id), document_id)


def _best_clean_row(rows: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    if not rows:
        return None
    return max(rows, key=_clean_row_cursor_marker)


def _load_cursor_state(conn: Connection) -> Dict[str, Dict[str, Any]]:
    rows = conn.execute(
        text(
            """
            SELECT module_key, module_name, latest_cursor_time, latest_document_id, latest_document_no,
                   last_incremental_synced_at, last_incremental_pages, last_incremental_rows,
                   last_backfill_synced_at, last_backfill_pages, last_backfill_rows, has_full_backfill
            FROM bi_yonyou_scm_sync_cursor
            ORDER BY module_key
            """
        )
    ).mappings().all()
    result: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        result[str(row["module_key"])] = _json_ready(dict(row))
    return result


def _upsert_cursor_state(conn: Connection, payload: Dict[str, Any]) -> None:
    conn.execute(
        text(
            """
            INSERT INTO bi_yonyou_scm_sync_cursor (
                module_key,
                module_name,
                latest_cursor_time,
                latest_document_id,
                latest_document_no,
                last_incremental_synced_at,
                last_incremental_pages,
                last_incremental_rows,
                last_backfill_synced_at,
                last_backfill_pages,
                last_backfill_rows,
                has_full_backfill
            ) VALUES (
                :module_key,
                :module_name,
                :latest_cursor_time,
                :latest_document_id,
                :latest_document_no,
                :last_incremental_synced_at,
                :last_incremental_pages,
                :last_incremental_rows,
                :last_backfill_synced_at,
                :last_backfill_pages,
                :last_backfill_rows,
                :has_full_backfill
            )
            ON DUPLICATE KEY UPDATE
                module_name = VALUES(module_name),
                latest_cursor_time = VALUES(latest_cursor_time),
                latest_document_id = VALUES(latest_document_id),
                latest_document_no = VALUES(latest_document_no),
                last_incremental_synced_at = VALUES(last_incremental_synced_at),
                last_incremental_pages = VALUES(last_incremental_pages),
                last_incremental_rows = VALUES(last_incremental_rows),
                last_backfill_synced_at = VALUES(last_backfill_synced_at),
                last_backfill_pages = VALUES(last_backfill_pages),
                last_backfill_rows = VALUES(last_backfill_rows),
                has_full_backfill = VALUES(has_full_backfill),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        payload,
    )


def _table_count(conn: Connection, table_name: str) -> int:
    return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar() or 0)


def _is_clean_row_newer_than_cursor(row: Mapping[str, Any], cursor_state: Mapping[str, Any] | None) -> bool:
    if not cursor_state:
        return True
    cursor_time = _normalize_cursor_time(cursor_state.get("latest_cursor_time"))
    cursor_document_id = _coalesce(cursor_state.get("latest_document_id"))
    row_time, row_document_rank, row_document_id = _clean_row_cursor_marker(row)
    if not cursor_time:
        if not cursor_document_id:
            return True
        cursor_rank = _document_id_rank(cursor_document_id)
        if row_document_rank >= 0 and cursor_rank >= 0:
            return row_document_rank > cursor_rank
        return row_document_id > cursor_document_id
    if row_time > cursor_time:
        return True
    if row_time < cursor_time:
        return False
    cursor_rank = _document_id_rank(cursor_document_id)
    if row_document_rank >= 0 and cursor_rank >= 0:
        return row_document_rank > cursor_rank
    return row_document_id > cursor_document_id


def _load_master_entity_summary(
    conn: Connection,
    sync_state_by_module: Mapping[str, Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    summary: List[Dict[str, Any]] = []
    for entity_key, tables in PROCUREMENT_MASTER_ENTITY_TABLES.items():
        state = sync_state_by_module.get(tables["state_key"], {})
        raw_row_count = int(state.get("raw_row_count") or _table_count(conn, tables["raw"]))
        current_row_count = int(state.get("clean_row_count") or _table_count(conn, tables["current"]))
        summary.append(
            {
                "entity_key": entity_key,
                "entity_name": tables["label"],
                "raw_row_count": raw_row_count,
                "current_row_count": current_row_count,
                "state": dict(state),
            }
        )
    return summary


def sync_procurement_document_cache(
    engine: Engine,
    *,
    limit: int = 200,
    trigger: str = "manual",
    mode: str = "incremental",
    page_size: int | None = None,
    max_pages: int | None = None,
) -> Dict[str, Any]:
    ensure_procurement_cache_schema(engine)
    if not is_procurement_yonyou_configured():
        return {
            "status": "skipped",
            "message": "Yonyou procurement config missing",
            "modules": {},
            "synced_at": None,
        }

    normalized_mode = str(mode or "incremental").strip().lower()
    if normalized_mode not in {"incremental", "backfill"}:
        raise ValueError(f"Unsupported sync mode: {mode}")

    if normalized_mode == "backfill":
        effective_page_size = max(20, min(200, int(page_size or PROCUREMENT_DOCUMENT_BACKFILL_PAGE_SIZE)))
        effective_max_pages = max(1, int(max_pages or PROCUREMENT_DOCUMENT_BACKFILL_MAX_PAGES))
    else:
        requested_limit = max(1, int(limit or 200))
        effective_page_size = max(20, min(200, int(page_size or min(PROCUREMENT_DOCUMENT_INCREMENTAL_PAGE_SIZE, requested_limit))))
        effective_max_pages = max(1, int(max_pages or max(1, (requested_limit + effective_page_size - 1) // effective_page_size)))

    synced_at = datetime.now()
    results: Dict[str, Any] = {}
    master_entities: Dict[str, Any] = {}
    with engine.begin() as conn:
        cursor_state_by_module = _load_cursor_state(conn)
        client = create_procurement_client()

        for module_key in PROCUREMENT_DOCUMENT_MODULE_ORDER:
            tables = PROCUREMENT_DOCUMENT_TABLES[module_key]
            module_cursor = cursor_state_by_module.get(module_key, {})
            module_mode = normalized_mode
            if module_mode == "incremental" and not bool(module_cursor.get("has_full_backfill")):
                module_mode = "backfill"

            total_raw_rows = 0
            total_clean_rows = 0
            fetched_pages = 0
            completed = False
            reached_cursor = False
            best_row: Mapping[str, Any] | None = None

            for page_index in range(1, effective_max_pages + 1):
                page_snapshot = query_procurement_document_snapshot_page_with_client(
                    client,
                    module_key,
                    page_index=page_index,
                    page_size=effective_page_size,
                )
                source_raw_rows = list(page_snapshot.get("raw_rows") or [])
                source_clean_rows = list(page_snapshot.get("clean_rows") or [])
                if not source_raw_rows:
                    completed = True
                    break

                raw_rows = [_normalize_raw_row(module_key, row, synced_at) for row in source_raw_rows]
                clean_rows = [_normalize_clean_row(module_key, row, synced_at) for row in source_clean_rows]
                _upsert_raw_rows(conn, tables["raw"], raw_rows)
                _upsert_clean_rows(conn, tables["clean"], clean_rows)

                total_raw_rows += len(raw_rows)
                total_clean_rows += len(clean_rows)
                fetched_pages += 1

                page_best = _best_clean_row(clean_rows)
                if page_best is not None and (best_row is None or _clean_row_cursor_marker(page_best) > _clean_row_cursor_marker(best_row)):
                    best_row = page_best

                if module_mode == "incremental" and module_cursor:
                    has_newer_rows = any(_is_clean_row_newer_than_cursor(row, module_cursor) for row in clean_rows)
                    if not has_newer_rows:
                        reached_cursor = True
                        completed = True
                        break

                if len(source_raw_rows) < effective_page_size:
                    completed = True
                    break

            if best_row is None and module_cursor:
                best_row = {
                    "document_id": module_cursor.get("latest_document_id"),
                    "document_no": module_cursor.get("latest_document_no"),
                    "updated_at_display": module_cursor.get("latest_cursor_time"),
                    "source_pubts": module_cursor.get("latest_cursor_time"),
                }

            cursor_payload = {
                "module_key": module_key,
                "module_name": tables["label"],
                "latest_cursor_time": _normalize_cursor_time(
                    (best_row or {}).get("updated_at_display")
                    or (best_row or {}).get("source_pubts")
                    or module_cursor.get("latest_cursor_time")
                ),
                "latest_document_id": _coalesce((best_row or {}).get("document_id"), module_cursor.get("latest_document_id")),
                "latest_document_no": _coalesce((best_row or {}).get("document_no"), module_cursor.get("latest_document_no")),
                "last_incremental_synced_at": synced_at if module_mode == "incremental" else module_cursor.get("last_incremental_synced_at"),
                "last_incremental_pages": fetched_pages if module_mode == "incremental" else int(module_cursor.get("last_incremental_pages") or 0),
                "last_incremental_rows": total_clean_rows if module_mode == "incremental" else int(module_cursor.get("last_incremental_rows") or 0),
                "last_backfill_synced_at": synced_at if module_mode == "backfill" and completed else module_cursor.get("last_backfill_synced_at"),
                "last_backfill_pages": fetched_pages if module_mode == "backfill" else int(module_cursor.get("last_backfill_pages") or 0),
                "last_backfill_rows": total_clean_rows if module_mode == "backfill" else int(module_cursor.get("last_backfill_rows") or 0),
                "has_full_backfill": 1 if (module_mode == "backfill" and completed) or bool(module_cursor.get("has_full_backfill")) else 0,
            }
            _upsert_cursor_state(conn, cursor_payload)

            current_raw_count = _table_count(conn, tables["raw"])
            current_clean_count = _table_count(conn, tables["clean"])
            latest_source_updated_at = _coalesce(
                (best_row or {}).get("updated_at_display"),
                (best_row or {}).get("source_pubts"),
            )
            _upsert_sync_state(
                conn,
                {
                    "module_key": module_key,
                    "module_name": tables["label"],
                    "last_synced_at": synced_at,
                    "last_status": "success" if completed else "partial",
                    "last_message": (
                        f"{module_mode} synced pages={fetched_pages} clean_rows={total_clean_rows}"
                        + (" reached cursor" if reached_cursor else "")
                        + (" max pages reached" if not completed else "")
                    ),
                    "raw_row_count": current_raw_count,
                    "clean_row_count": current_clean_count,
                    "latest_source_updated_at": latest_source_updated_at,
                    "trigger_mode": trigger,
                },
            )
            results[module_key] = {
                "mode": module_mode,
                "raw_row_count": total_raw_rows,
                "clean_row_count": total_clean_rows,
                "stored_raw_count": current_raw_count,
                "stored_clean_count": current_clean_count,
                "pages": fetched_pages,
                "completed": completed,
                "reached_cursor": reached_cursor,
            }
        master_entities = refresh_procurement_master_entity_cache_from_conn(
            conn,
            synced_at=synced_at,
            trigger=f"document_sync:{trigger}",
        )

    overall_status = "success"
    if any(not bool((item or {}).get("completed")) for item in results.values()):
        overall_status = "partial"
    return {
        "status": overall_status,
        "message": f"{normalized_mode} synced {sum(int(item.get('clean_row_count') or 0) for item in results.values())} cleaned rows",
        "mode": normalized_mode,
        "page_size": effective_page_size,
        "max_pages": effective_max_pages,
        "modules": results,
        "master_entities": master_entities,
        "synced_at": synced_at.isoformat(sep=' ', timespec='seconds'),
    }


def load_procurement_document_cache(engine: Engine, *, limit: int = 20) -> Dict[str, Any]:
    ensure_procurement_cache_schema(engine)
    rows_by_module: Dict[str, List[Dict[str, Any]]] = {}
    sync_state_by_module: Dict[str, Dict[str, Any]] = {}
    cursor_state_by_module: Dict[str, Dict[str, Any]] = {}
    with engine.connect() as conn:
        master_current_count = sum(_table_count(conn, tables["current"]) for tables in PROCUREMENT_MASTER_ENTITY_TABLES.values())
        document_raw_count = sum(_table_count(conn, tables["raw"]) for tables in PROCUREMENT_DOCUMENT_TABLES.values())
        if document_raw_count > 0 and master_current_count == 0:
            refresh_procurement_master_entity_cache_from_conn(
                conn,
                synced_at=datetime.now(),
                trigger="cache_load_bootstrap",
            )

        state_rows = conn.execute(
            text(
                """
                SELECT module_key, module_name, last_synced_at, last_status, last_message,
                       raw_row_count, clean_row_count, latest_source_updated_at, trigger_mode
                FROM bi_yonyou_scm_sync_state
                ORDER BY module_key
                """
            )
        ).mappings().all()
        for state in state_rows:
            sync_state_by_module[str(state["module_key"])] = _json_ready(dict(state))
        cursor_state_by_module = _load_cursor_state(conn)

        for module_key in PROCUREMENT_DOCUMENT_MODULE_ORDER:
            table_name = PROCUREMENT_DOCUMENT_TABLES[module_key]["clean"]
            payloads = conn.execute(
                text(
                    f"""
                    SELECT clean_json
                    FROM {table_name}
                    ORDER BY updated_at DESC, id DESC
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            ).scalars().all()
            parsed_rows: List[Dict[str, Any]] = []
            for payload in payloads:
                try:
                    row = json.loads(str(payload or ""))
                except json.JSONDecodeError:
                    continue
                if isinstance(row, dict):
                    parsed_rows.append(row)
            rows_by_module[module_key] = parsed_rows

    last_synced_candidates = [
        value.get("last_synced_at")
        for value in sync_state_by_module.values()
        if value.get("last_synced_at") is not None
    ]
    normalized_last_synced: List[datetime] = []
    for value in last_synced_candidates:
        if isinstance(value, datetime):
            normalized_last_synced.append(value)
            continue
        try:
            normalized_last_synced.append(datetime.fromisoformat(str(value)))
        except Exception:
            continue
    last_synced_at = max(normalized_last_synced) if normalized_last_synced else None
    stale_cutoff = datetime.now() - timedelta(seconds=PROCUREMENT_DOCUMENT_CACHE_TTL_SECONDS)
    is_stale = bool(last_synced_at is None or last_synced_at < stale_cutoff)
    total_clean_rows = sum(
        int((sync_state_by_module.get(module_key) or {}).get("clean_row_count") or len(rows_by_module.get(module_key) or []))
        for module_key in PROCUREMENT_DOCUMENT_MODULE_ORDER
    )
    return {
        "rows_by_module": rows_by_module,
        "sync_summary": {
            "data_source": "mysql_cache",
            "cache_ready": total_clean_rows > 0,
            "is_configured": is_procurement_yonyou_configured(),
            "last_synced_at": last_synced_at.isoformat(sep=" ", timespec="seconds") if isinstance(last_synced_at, datetime) else None,
            "is_stale": is_stale,
            "stale_after_seconds": PROCUREMENT_DOCUMENT_CACHE_TTL_SECONDS,
            "total_clean_rows": total_clean_rows,
            "master_entities": _load_master_entity_summary(conn, sync_state_by_module),
            "modules": [
                {
                    "module_key": module_key,
                    "module_name": PROCUREMENT_DOCUMENT_TABLES[module_key]["label"],
                    "clean_row_count": int(
                        (sync_state_by_module.get(module_key) or {}).get("clean_row_count")
                        or len(rows_by_module.get(module_key) or [])
                    ),
                    "state": sync_state_by_module.get(module_key, {}),
                    "cursor": cursor_state_by_module.get(module_key, {}),
                }
                for module_key in PROCUREMENT_DOCUMENT_MODULE_ORDER
            ],
        },
    }


def procurement_document_cache_needs_refresh(engine: Engine) -> bool:
    snapshot = load_procurement_document_cache(engine, limit=1)
    sync_summary = snapshot.get("sync_summary") or {}
    return bool(sync_summary.get("is_configured") and (sync_summary.get("is_stale") or not sync_summary.get("cache_ready")))
