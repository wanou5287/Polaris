from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Sequence

from sqlalchemy import text

from app.core.logger import logger
from app.services.notification_service import NotificationService

FORECAST_HORIZON_DAYS = 14
GOOD_STATUS_KEYWORD = "良品"


def _to_decimal(value: Any) -> Decimal:
    if value in (None, "", "-"):
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).strip())
    except Exception:
        return Decimal("0")


def _to_float(value: Any) -> float:
    return float(_to_decimal(value))


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def ensure_forecast_alert_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_forecast_material_profile (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    material_name VARCHAR(255) NOT NULL,
                    demand_type VARCHAR(16) NOT NULL,
                    material_role VARCHAR(32) NOT NULL,
                    threshold_days INT NOT NULL DEFAULT 14,
                    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    notes VARCHAR(512) NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_forecast_profile (material_name, demand_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_forecast_promotion_event (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    event_name VARCHAR(64) NOT NULL,
                    month_day_start VARCHAR(5) NOT NULL,
                    month_day_end VARCHAR(5) NOT NULL,
                    uplift_factor DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
                    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_forecast_event_name (event_name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_sales_forecast_manual (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    forecast_date DATE NOT NULL,
                    material_name VARCHAR(255) NOT NULL,
                    demand_type VARCHAR(16) NOT NULL,
                    manual_qty DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    notes VARCHAR(512) NOT NULL DEFAULT '',
                    updated_by VARCHAR(64) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_sales_forecast_manual (forecast_date, material_name, demand_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_sales_forecast_ai_daily (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    forecast_date DATE NOT NULL,
                    material_name VARCHAR(255) NOT NULL,
                    demand_type VARCHAR(16) NOT NULL,
                    material_role VARCHAR(32) NOT NULL,
                    base_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    ai_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    manual_qty DECIMAL(18, 4) NULL,
                    final_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    weekday_factor DECIMAL(18, 6) NOT NULL DEFAULT 1,
                    trend_factor DECIMAL(18, 6) NOT NULL DEFAULT 1,
                    promo_factor DECIMAL(18, 6) NOT NULL DEFAULT 1,
                    source_summary_json LONGTEXT NULL,
                    updated_by VARCHAR(64) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_sales_forecast_ai_daily (forecast_date, material_name, demand_type),
                    INDEX idx_bi_sales_forecast_date (forecast_date),
                    INDEX idx_bi_sales_forecast_material (material_name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bi_inventory_alert_log (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    snapshot_date DATE NOT NULL,
                    material_name VARCHAR(255) NOT NULL,
                    demand_type VARCHAR(16) NOT NULL,
                    material_role VARCHAR(32) NOT NULL,
                    current_stock_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    forecast_14d_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    coverage_days DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    threshold_days INT NOT NULL DEFAULT 14,
                    alert_level VARCHAR(16) NOT NULL DEFAULT 'warning',
                    pushed_to_dingtalk TINYINT(1) NOT NULL DEFAULT 0,
                    push_result VARCHAR(255) NOT NULL DEFAULT '',
                    message VARCHAR(1024) NOT NULL DEFAULT '',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_bi_inventory_alert_log (snapshot_date, material_name, demand_type),
                    INDEX idx_bi_inventory_alert_snapshot (snapshot_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
        )
        seed_forecast_material_profiles(conn)
        seed_default_promotion_events(conn)


def seed_forecast_material_profiles(conn) -> None:
    conn.execute(
        text(
            """
            INSERT IGNORE INTO bi_forecast_material_profile(material_name, demand_type, material_role, threshold_days, is_enabled)
            SELECT DISTINCT material_name, 'sales', 'machine', 14, 1
            FROM bi_material_sales_daily_cleaning
            WHERE material_name IS NOT NULL AND material_name <> ''
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT IGNORE INTO bi_forecast_material_profile(material_name, demand_type, material_role, threshold_days, is_enabled)
            SELECT DISTINCT r.material_name, 'sales', 'machine', 14, 1
            FROM bi_refurb_production_daily r
            LEFT JOIN bi_forecast_material_profile p
                ON p.material_name = r.material_name AND p.demand_type = 'sales'
            WHERE r.material_name IS NOT NULL AND r.material_name <> ''
              AND p.id IS NULL
              AND (
                r.material_name LIKE '%主机%'
                OR r.material_name LIKE '%辅学机%'
                OR r.material_name LIKE '%整机%'
                OR r.material_name LIKE '%学习机%'
              )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT IGNORE INTO bi_forecast_material_profile(material_name, demand_type, material_role, threshold_days, is_enabled)
            SELECT DISTINCT r.material_name, 'refurb', 'refurb_material', 14, 1
            FROM bi_refurb_production_daily r
            LEFT JOIN (
                SELECT DISTINCT material_name
                FROM bi_material_sales_daily_cleaning
                WHERE material_name IS NOT NULL AND material_name <> ''
            ) s ON s.material_name = r.material_name
            WHERE r.material_name IS NOT NULL AND r.material_name <> ''
              AND s.material_name IS NULL
              AND r.material_name NOT LIKE '%主机%'
              AND r.material_name NOT LIKE '%辅学机%'
              AND r.material_name NOT LIKE '%整机%'
              AND r.material_name NOT LIKE '%学习机%'
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE bi_forecast_material_profile
            SET is_enabled = 0, material_role = 'machine'
            WHERE demand_type = 'refurb'
              AND (
                material_name LIKE '%主机%'
                OR material_name LIKE '%辅学机%'
                OR material_name LIKE '%整机%'
                OR material_name LIKE '%学习机%'
              )
            """
        )
    )


def seed_default_promotion_events(conn) -> None:
    defaults = [
        {"event_name": "618", "month_day_start": "06-01", "month_day_end": "06-20", "uplift_factor": Decimal("1.35")},
        {"event_name": "双11", "month_day_start": "11-01", "month_day_end": "11-15", "uplift_factor": Decimal("1.55")},
    ]
    for row in defaults:
        conn.execute(
            text(
                """
                INSERT IGNORE INTO bi_forecast_promotion_event(
                    event_name, month_day_start, month_day_end, uplift_factor, is_enabled
                ) VALUES (
                    :event_name, :month_day_start, :month_day_end, :uplift_factor, 1
                )
                """
            ),
            row,
        )


def list_forecast_profiles(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        text(
            """
            SELECT id, material_name, demand_type, material_role, threshold_days, is_enabled, notes, created_at, updated_at
            FROM bi_forecast_material_profile
            WHERE is_enabled = 1
            ORDER BY demand_type, material_name
            """
        )
    ).mappings().all()
    return [{key: _plain(value) for key, value in dict(row).items()} for row in rows]


def list_promotion_events(conn) -> List[Dict[str, Any]]:
    rows = conn.execute(
        text(
            """
            SELECT id, event_name, month_day_start, month_day_end, uplift_factor, is_enabled, created_at, updated_at
            FROM bi_forecast_promotion_event
            ORDER BY event_name
            """
        )
    ).mappings().all()
    return [{key: _plain(value) for key, value in dict(row).items()} for row in rows]


def list_manual_forecasts(conn, start_date: date | None = None, end_date: date | None = None, limit: int = 300) -> List[Dict[str, Any]]:
    query = """
        SELECT id, forecast_date, material_name, demand_type, manual_qty, notes, updated_by, created_at, updated_at
        FROM bi_sales_forecast_manual
        WHERE 1 = 1
    """
    params: Dict[str, Any] = {"limit": max(1, min(limit, 1000))}
    if start_date is not None:
        query += " AND forecast_date >= :start_date"
        params["start_date"] = start_date
    if end_date is not None:
        query += " AND forecast_date <= :end_date"
        params["end_date"] = end_date
    query += " ORDER BY forecast_date, demand_type, material_name LIMIT :limit"
    rows = conn.execute(text(query), params).mappings().all()
    return [{key: _plain(value) for key, value in dict(row).items()} for row in rows]


def list_ai_forecasts(conn, start_date: date | None = None, end_date: date | None = None, limit: int = 500) -> List[Dict[str, Any]]:
    query = """
        SELECT
            id, forecast_date, material_name, demand_type, material_role, base_qty, ai_qty,
            manual_qty, final_qty, weekday_factor, trend_factor, promo_factor,
            source_summary_json, updated_by, created_at, updated_at
        FROM bi_sales_forecast_ai_daily
        WHERE 1 = 1
    """
    params: Dict[str, Any] = {"limit": max(1, min(limit, 2000))}
    if start_date is not None:
        query += " AND forecast_date >= :start_date"
        params["start_date"] = start_date
    if end_date is not None:
        query += " AND forecast_date <= :end_date"
        params["end_date"] = end_date
    query += " ORDER BY forecast_date, demand_type, material_name LIMIT :limit"
    rows = conn.execute(text(query), params).mappings().all()
    results = []
    for row in rows:
        item = {key: _plain(value) for key, value in dict(row).items()}
        try:
            item["source_summary"] = json.loads(item.pop("source_summary_json") or "{}")
        except Exception:
            item["source_summary"] = {}
        results.append(item)
    return results


def list_inventory_alerts(conn, snapshot_date: date | None = None, limit: int = 200) -> List[Dict[str, Any]]:
    if snapshot_date is None:
        snapshot_date = conn.execute(text("SELECT MAX(snapshot_date) FROM bi_inventory_alert_log")).scalar()
    if snapshot_date is None:
        return []
    rows = conn.execute(
        text(
            """
            SELECT
                id, snapshot_date, material_name, demand_type, material_role,
                current_stock_qty, forecast_14d_qty, coverage_days, threshold_days,
                alert_level, pushed_to_dingtalk, push_result, message, created_at, updated_at
            FROM bi_inventory_alert_log
            WHERE snapshot_date = :snapshot_date
            ORDER BY coverage_days ASC, material_name ASC
            LIMIT :limit
            """
        ),
        {"snapshot_date": snapshot_date, "limit": max(1, min(limit, 1000))},
    ).mappings().all()
    return [{key: _plain(value) for key, value in dict(row).items()} for row in rows]


def save_manual_forecast(engine, payload: Dict[str, Any], updated_by: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO bi_sales_forecast_manual(
                    forecast_date, material_name, demand_type, manual_qty, notes, updated_by
                ) VALUES (
                    :forecast_date, :material_name, :demand_type, :manual_qty, :notes, :updated_by
                )
                ON DUPLICATE KEY UPDATE
                    manual_qty = VALUES(manual_qty),
                    notes = VALUES(notes),
                    updated_by = VALUES(updated_by)
                """
            ),
            {
                "forecast_date": payload["forecast_date"],
                "material_name": payload["material_name"],
                "demand_type": payload["demand_type"],
                "manual_qty": payload["manual_qty"],
                "notes": payload.get("notes", ""),
                "updated_by": updated_by,
            },
        )


def save_promotion_events(engine, rows: Sequence[Dict[str, Any]]) -> None:
    with engine.begin() as conn:
        existing_ids = {int(row[0]) for row in conn.execute(text("SELECT id FROM bi_forecast_promotion_event")).fetchall()}
        submitted_ids = {int(row.get("id") or 0) for row in rows if int(row.get("id") or 0) > 0}
        for row in rows:
            payload = {
                "id": int(row.get("id") or 0),
                "event_name": str(row.get("event_name") or "").strip(),
                "month_day_start": str(row.get("month_day_start") or "").strip(),
                "month_day_end": str(row.get("month_day_end") or "").strip(),
                "uplift_factor": _to_decimal(row.get("uplift_factor") or 1),
                "is_enabled": 1 if bool(row.get("is_enabled", True)) else 0,
            }
            if payload["id"] > 0:
                updated = conn.execute(
                    text(
                        """
                        UPDATE bi_forecast_promotion_event
                        SET
                            event_name = :event_name,
                            month_day_start = :month_day_start,
                            month_day_end = :month_day_end,
                            uplift_factor = :uplift_factor,
                            is_enabled = :is_enabled
                        WHERE id = :id
                        """
                    ),
                    payload,
                )
                if updated.rowcount:
                    continue
            conn.execute(
                text(
                    """
                    INSERT INTO bi_forecast_promotion_event(
                        event_name, month_day_start, month_day_end, uplift_factor, is_enabled
                    ) VALUES (
                        :event_name, :month_day_start, :month_day_end, :uplift_factor, :is_enabled
                    )
                    """
                ),
                {key: payload[key] for key in ("event_name", "month_day_start", "month_day_end", "uplift_factor", "is_enabled")},
            )
        disabled_ids = sorted(existing_ids - submitted_ids)
        if disabled_ids:
            placeholders = ", ".join(f":id_{idx}" for idx, _ in enumerate(disabled_ids))
            params = {f"id_{idx}": row_id for idx, row_id in enumerate(disabled_ids)}
            conn.execute(text(f"UPDATE bi_forecast_promotion_event SET is_enabled = 0 WHERE id IN ({placeholders})"), params)


def _history_source_table(demand_type: str) -> tuple[str, str]:
    if demand_type == "sales":
        return "bi_material_sales_daily_cleaning", "total_sales_qty"
    return "bi_refurb_production_daily", "feeding_qty"


def _load_history_series(conn, material_name: str, demand_type: str, start_date: date, end_date: date) -> Dict[date, Decimal]:
    table_name, qty_field = _history_source_table(demand_type)
    date_field = "biz_date"
    rows = conn.execute(
        text(
            f"""
            SELECT `{date_field}` AS biz_date, SUM(`{qty_field}`) AS qty
            FROM `{table_name}`
            WHERE material_name = :material_name
              AND `{date_field}` >= :start_date
              AND `{date_field}` <= :end_date
            GROUP BY `{date_field}`
            ORDER BY `{date_field}`
            """
        ),
        {"material_name": material_name, "start_date": start_date, "end_date": end_date},
    ).mappings().all()
    return {row["biz_date"]: _to_decimal(row["qty"]) for row in rows}


def _event_factor(events: Sequence[Dict[str, Any]], target_date: date) -> tuple[Decimal, List[str]]:
    month_day = target_date.strftime("%m-%d")
    matched_names: List[str] = []
    factor = Decimal("1")
    for event in events:
        if not event.get("is_enabled", True):
            continue
        start_value = str(event.get("month_day_start") or "")
        end_value = str(event.get("month_day_end") or "")
        if start_value <= month_day <= end_value:
            matched_names.append(str(event.get("event_name") or "促销活动"))
            factor = max(factor, _to_decimal(event.get("uplift_factor") or 1))
    return factor, matched_names


def _clamp_decimal(value: Decimal, minimum: Decimal, maximum: Decimal) -> Decimal:
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def _build_forecast_row(
    material_name: str,
    demand_type: str,
    material_role: str,
    threshold_days: int,
    history_map: Dict[date, Decimal],
    manual_map: Dict[tuple[date, str, str], Decimal],
    events: Sequence[Dict[str, Any]],
    forecast_date: date,
) -> Dict[str, Any]:
    history_end = forecast_date - timedelta(days=1)
    last_28_days = [history_map.get(history_end - timedelta(days=offset), Decimal("0")) for offset in range(27, -1, -1)]
    last_7_days = last_28_days[-7:]
    base_28 = sum(last_28_days, Decimal("0")) / Decimal(str(max(len(last_28_days), 1)))
    base_7 = sum(last_7_days, Decimal("0")) / Decimal(str(max(len(last_7_days), 1)))
    base_qty = (base_7 * Decimal("0.65")) + (base_28 * Decimal("0.35"))
    if base_qty <= 0 and history_map:
        base_qty = sum(history_map.values(), Decimal("0")) / Decimal(str(len(history_map)))

    weekday_values = [qty for day, qty in history_map.items() if day.weekday() == forecast_date.weekday()]
    overall_avg = base_28 if base_28 > 0 else (sum(history_map.values(), Decimal("0")) / Decimal(str(len(history_map) or 1)))
    weekday_avg = sum(weekday_values, Decimal("0")) / Decimal(str(len(weekday_values) or 1)) if weekday_values else overall_avg
    weekday_factor = Decimal("1")
    if overall_avg > 0 and weekday_avg > 0:
        weekday_factor = _clamp_decimal(weekday_avg / overall_avg, Decimal("0.75"), Decimal("1.35"))

    trend_factor = Decimal("1")
    if base_28 > 0 and base_7 > 0:
        trend_factor = _clamp_decimal(base_7 / base_28, Decimal("0.70"), Decimal("1.30"))

    promo_factor, matched_events = _event_factor(events, forecast_date)
    ai_qty = (base_qty * weekday_factor * trend_factor * promo_factor).quantize(Decimal("0.0001"))
    if ai_qty < 0:
        ai_qty = Decimal("0")
    manual_qty = manual_map.get((forecast_date, material_name, demand_type))
    final_qty = manual_qty if manual_qty is not None else ai_qty
    return {
        "forecast_date": forecast_date,
        "material_name": material_name,
        "demand_type": demand_type,
        "material_role": material_role,
        "threshold_days": threshold_days,
        "base_qty": base_qty.quantize(Decimal("0.0001")),
        "ai_qty": ai_qty,
        "manual_qty": manual_qty,
        "final_qty": final_qty.quantize(Decimal("0.0001")),
        "weekday_factor": weekday_factor.quantize(Decimal("0.000001")),
        "trend_factor": trend_factor.quantize(Decimal("0.000001")),
        "promo_factor": promo_factor.quantize(Decimal("0.000001")),
        "source_summary_json": json.dumps(
            {
                "matched_events": matched_events,
                "history_days": len(history_map),
                "base_7_avg": _plain(base_7),
                "base_28_avg": _plain(base_28),
            },
            ensure_ascii=False,
        ),
    }


def recalculate_forecasts_and_alerts(
    engine,
    *,
    updated_by: str = "system",
    horizon_days: int = FORECAST_HORIZON_DAYS,
    send_notifications: bool = True,
) -> Dict[str, Any]:
    ensure_forecast_alert_schema(engine)
    with engine.begin() as conn:
        seed_forecast_material_profiles(conn)
        profiles = list_forecast_profiles(conn)
        events = list_promotion_events(conn)
        latest_snapshot_date = conn.execute(text("SELECT MAX(snapshot_date) FROM bi_inventory_snapshot_daily_cleaning")).scalar()
        if latest_snapshot_date is None:
            return {
                "snapshot_date": None,
                "forecast_rows": 0,
                "alert_rows": 0,
                "notified": False,
                "message": "库存清洗表暂无数据，已跳过预测与预警重算。",
            }

        forecast_start = latest_snapshot_date + timedelta(days=1)
        forecast_end = forecast_start + timedelta(days=horizon_days - 1)
        history_start = latest_snapshot_date - timedelta(days=90)
        manual_rows = conn.execute(
            text(
                """
                SELECT forecast_date, material_name, demand_type, manual_qty
                FROM bi_sales_forecast_manual
                WHERE forecast_date >= :forecast_start AND forecast_date <= :forecast_end
                """
            ),
            {"forecast_start": forecast_start, "forecast_end": forecast_end},
        ).mappings().all()
        manual_map = {
            (row["forecast_date"], row["material_name"], row["demand_type"]): _to_decimal(row["manual_qty"])
            for row in manual_rows
        }

        forecast_rows: List[Dict[str, Any]] = []
        for profile in profiles:
            history_map = _load_history_series(conn, profile["material_name"], profile["demand_type"], history_start, latest_snapshot_date)
            for offset in range(horizon_days):
                current_forecast_date = forecast_start + timedelta(days=offset)
                forecast_rows.append(
                    _build_forecast_row(
                        profile["material_name"],
                        profile["demand_type"],
                        profile["material_role"],
                        int(profile["threshold_days"] or 14),
                        history_map,
                        manual_map,
                        events,
                        current_forecast_date,
                    )
                )

        conn.execute(
            text(
                """
                DELETE FROM bi_sales_forecast_ai_daily
                WHERE forecast_date >= :forecast_start AND forecast_date <= :forecast_end
                """
            ),
            {"forecast_start": forecast_start, "forecast_end": forecast_end},
        )
        if forecast_rows:
            conn.execute(
                text(
                    """
                    INSERT INTO bi_sales_forecast_ai_daily(
                        forecast_date, material_name, demand_type, material_role,
                        base_qty, ai_qty, manual_qty, final_qty, weekday_factor,
                        trend_factor, promo_factor, source_summary_json, updated_by
                    ) VALUES (
                        :forecast_date, :material_name, :demand_type, :material_role,
                        :base_qty, :ai_qty, :manual_qty, :final_qty, :weekday_factor,
                        :trend_factor, :promo_factor, :source_summary_json, :updated_by
                    )
                    """
                ),
                [{**row, "updated_by": updated_by} for row in forecast_rows],
            )

        good_stock_rows = conn.execute(
            text(
                f"""
                SELECT material_name, SUM(qty) AS stock_qty
                FROM bi_inventory_snapshot_daily_cleaning
                WHERE snapshot_date = :snapshot_date
                  AND stock_status_name LIKE :status_like
                GROUP BY material_name
                """
            ),
            {"snapshot_date": latest_snapshot_date, "status_like": f"%{GOOD_STATUS_KEYWORD}%"},
        ).mappings().all()
        stock_map = {row["material_name"]: _to_decimal(row["stock_qty"]) for row in good_stock_rows}

        forecast_agg: Dict[tuple[str, str], Decimal] = {}
        role_map: Dict[tuple[str, str], str] = {}
        threshold_map: Dict[tuple[str, str], int] = {}
        for row in forecast_rows:
            key = (row["material_name"], row["demand_type"])
            forecast_agg[key] = forecast_agg.get(key, Decimal("0")) + row["final_qty"]
            role_map[key] = row["material_role"]
            threshold_map[key] = int(row["threshold_days"])

        alert_rows: List[Dict[str, Any]] = []
        for (material_name, demand_type), forecast_qty in forecast_agg.items():
            if forecast_qty <= 0:
                continue
            threshold_days = threshold_map[(material_name, demand_type)]
            current_stock_qty = stock_map.get(material_name, Decimal("0"))
            daily_avg = forecast_qty / Decimal(str(horizon_days))
            coverage_days = Decimal("9999")
            if daily_avg > 0:
                coverage_days = current_stock_qty / daily_avg
            if coverage_days < Decimal(str(threshold_days)):
                alert_rows.append(
                    {
                        "snapshot_date": latest_snapshot_date,
                        "material_name": material_name,
                        "demand_type": demand_type,
                        "material_role": role_map[(material_name, demand_type)],
                        "current_stock_qty": current_stock_qty.quantize(Decimal("0.0001")),
                        "forecast_14d_qty": forecast_qty.quantize(Decimal("0.0001")),
                        "coverage_days": coverage_days.quantize(Decimal("0.0001")),
                        "threshold_days": threshold_days,
                        "alert_level": "critical" if coverage_days < Decimal("7") else "warning",
                        "pushed_to_dingtalk": 0,
                        "push_result": "",
                        "message": (
                            f"{material_name} 当前良品库存 {float(current_stock_qty):.2f}，"
                            f"未来{horizon_days}天需求 {float(forecast_qty):.2f}，覆盖天数 {float(coverage_days):.2f}。"
                        ),
                    }
                )

        conn.execute(text("DELETE FROM bi_inventory_alert_log WHERE snapshot_date = :snapshot_date"), {"snapshot_date": latest_snapshot_date})
        if alert_rows:
            conn.execute(
                text(
                    """
                    INSERT INTO bi_inventory_alert_log(
                        snapshot_date, material_name, demand_type, material_role, current_stock_qty,
                        forecast_14d_qty, coverage_days, threshold_days, alert_level,
                        pushed_to_dingtalk, push_result, message
                    ) VALUES (
                        :snapshot_date, :material_name, :demand_type, :material_role, :current_stock_qty,
                        :forecast_14d_qty, :coverage_days, :threshold_days, :alert_level,
                        :pushed_to_dingtalk, :push_result, :message
                    )
                    """
                ),
                alert_rows,
            )

    notified = False
    push_result = "钉钉未配置或无需推送"
    if send_notifications and alert_rows:
        notified, push_result = send_inventory_alert_notification(latest_snapshot_date, alert_rows)
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE bi_inventory_alert_log
                    SET pushed_to_dingtalk = :pushed_to_dingtalk, push_result = :push_result
                    WHERE snapshot_date = :snapshot_date
                    """
                ),
                {
                    "snapshot_date": latest_snapshot_date,
                    "pushed_to_dingtalk": 1 if notified else 0,
                    "push_result": push_result,
                },
            )

    return {
        "snapshot_date": latest_snapshot_date.isoformat(),
        "forecast_start_date": forecast_start.isoformat(),
        "forecast_end_date": forecast_end.isoformat(),
        "forecast_rows": len(forecast_rows),
        "alert_rows": len(alert_rows),
        "notified": notified,
        "push_result": push_result,
    }


def send_inventory_alert_notification(snapshot_date: date, alert_rows: Sequence[Dict[str, Any]]) -> tuple[bool, str]:
    notifier = NotificationService()
    if not getattr(notifier, "dingtalk_webhook_url", None):
        logger.warning("DingTalk webhook not configured, skip forecast inventory alert notification.")
        return False, "钉钉 Webhook 未配置"

    lines = [
        f"安全库存预警：{snapshot_date.isoformat()}",
        f"预警物料数：{len(alert_rows)}",
        "",
    ]
    for row in list(alert_rows)[:20]:
        lines.append(
            f"- {row['material_name']} | 类型: {row['demand_type']} | 良品库存: {float(row['current_stock_qty']):.2f} | "
            f"未来14天需求: {float(row['forecast_14d_qty']):.2f} | 覆盖天数: {float(row['coverage_days']):.2f}"
        )
    if len(alert_rows) > 20:
        lines.append(f"... 其余 {len(alert_rows) - 20} 条请登录 BI 页面查看")

    try:
        result = asyncio.run(notifier.send_text_notification("供应链安全库存预警", lines))
        return bool(result), "发送成功" if result else "发送失败"
    except Exception as exc:
        logger.exception("Send forecast inventory alert failed: %s", exc)
        return False, str(exc)
