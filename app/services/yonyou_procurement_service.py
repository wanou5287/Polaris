from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

import yaml

from scripts.yonyou_purchase_order import (
    PURCHASE_ORDER_PATH,
    build_purchase_order_payload,
    validate_purchase_order_payload,
)
from scripts.yonyou_purchase_order_flow import (
    MORPHOLOGY_CONVERSION_LIST_PATH,
    PURCHASE_INBOUND_LIST_PATH,
    PURCHASE_ORDER_LIST_PATH,
    STOREOUT_DETAIL_PATH,
    STOREOUT_LIST_PATH,
    STOREOUT_BY_SOURCE_SAVE_PATH,
    SUCCESS_CODES,
    TRANSFER_ORDER_LIST_PATH,
    YonyouHttpClient,
    YonyouRequestError,
    YonyouRuntimeConfig,
    build_morphology_conversion_payload,
    build_purchase_inbound_from_source_payload,
    build_storeout_from_transfer_order_payload,
    build_transfer_order_from_purchase_inbound_payload,
    create_morphology_conversion,
    create_purchase_inbound_from_source,
    create_storeout_from_source,
    create_transfer_order,
    decimal_to_json_number,
    fetch_purchase_inbound_detail,
    fetch_purchase_order_detail,
    fetch_transfer_order_detail,
    is_response_success,
    resolve_order_id,
    resolve_purchase_inbound_id,
    resolve_storeout_bustype,
    resolve_transfer_order_bustype,
    to_compact_date,
    to_decimal,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOCAL_CONFIG_PATH = PROJECT_ROOT / "config" / "yonyou_inventory_sync.yaml"
DEFAULT_BASE_URL = "https://c3.yonyoucloud.com"
DEFAULT_GATEWAY_PREFIX = "/iuap-api-gateway"
DEFAULT_AUTH_PATH = "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken"
STOREIN_LIST_PATH = "/yonbip/scm/storein/list"
STOREIN_SAVE_PATH = "/yonbip/scm/storein/mergeSourceData/save"

DEFAULT_PURCHASE_ORDER_VALUES = {
    "bustype_code": "A20001",
    "vendor_code": "01000327",
    "invoice_vendor_code": "01000327",
    "org_code": "ZJJZX",
    "exch_rate_type": "01",
    "taxitems_code": "VATR1",
    "currency_code": "CNY",
    "nat_currency_code": "CNY",
    "exch_rate": 1,
}

MATERIAL_MASTER: Dict[str, Dict[str, Any]] = {
    "yscs061601": {
        "material_code": "yscs061601",
        "material_name": "学习机成品",
        "unit_code": "EA",
        "product": 2292380297840295937,
        "productsku": 2292380306430230530,
        "main_unit_id": 2204006097292886042,
        "stock_unit_id": 2204006097292886042,
        "price_uom_id": 2204006097292886042,
        "pur_uom_id": 2204006097292886042,
        "requires_morphology_serials": False,
    },
    "003000013": {
        "material_code": "003000013",
        "material_name": "学习机彩盒",
        "unit_code": "EA",
        "product": 2279066199879843846,
        "main_unit_id": 2204006097292886042,
        "stock_unit_id": 2204006097292886042,
        "price_uom_id": 2204006097292886042,
        "pur_uom_id": 2204006097292886042,
        "requires_morphology_serials": False,
    },
    "004000001": {
        "material_code": "004000001",
        "material_name": "学习机主板",
        "unit_code": "EA",
        "product": 2270896837076975619,
        "main_unit_id": 2204006097292886042,
        "stock_unit_id": 2204006097292886042,
        "price_uom_id": 2204006097292886042,
        "pur_uom_id": 2204006097292886042,
        "requires_morphology_serials": True,
    },
}

WAREHOUSE_MASTER: Dict[str, Dict[str, Any]] = {
    "000003": {
        "warehouse_code": "000003",
        "warehouse_id": 2248509414528516115,
        "warehouse_name": "精准学良品仓",
        "warehouse_person_id": "2297653435361656841",
        "stock_status_doc": 2180202022719455294,
        "stock_type": 2180202031309389825,
        "org_id": "2180205793702313990",
    },
    "15532921": {
        "warehouse_code": "15532921",
        "warehouse_id": 2448927088364224520,
        "warehouse_name": "精准学余杭速豪盒马云仓",
        "warehouse_person_id": "",
        "stock_status_doc": 2180202022719455294,
        "stock_type": 2180202031309389825,
        "org_id": "2180205793702313990",
    },
}

MORPHOLOGY_LINE_TYPE_MAP = {"成品": "3", "半成品": "4"}


def _load_local_config() -> Dict[str, Any]:
    if not LOCAL_CONFIG_PATH.exists():
        return {}
    raw_text = LOCAL_CONFIG_PATH.read_text(encoding="utf-8")
    if not raw_text.strip():
        return {}
    payload = yaml.safe_load(raw_text) or {}
    return payload if isinstance(payload, dict) else {}


def is_procurement_yonyou_configured() -> bool:
    config = _load_local_config().get("yonyou") or {}
    app_key = str(os.getenv("YONYOU_APP_KEY") or config.get("app_key") or "").strip()
    app_secret = str(os.getenv("YONYOU_APP_SECRET") or config.get("app_secret") or "").strip()
    return bool(app_key and app_secret)


def create_procurement_client() -> YonyouHttpClient:
    config = _load_local_config().get("yonyou") or {}
    app_key = str(os.getenv("YONYOU_APP_KEY") or config.get("app_key") or "").strip()
    app_secret = str(os.getenv("YONYOU_APP_SECRET") or config.get("app_secret") or "").strip()
    if not app_key or not app_secret:
        raise YonyouRequestError("未配置用友 AppKey / AppSecret，无法发起真实建单或查询。")
    base_url = str(os.getenv("YONYOU_BASE_URL") or config.get("base_url") or DEFAULT_BASE_URL).strip()
    auth_path = str(config.get("auth_path") or DEFAULT_AUTH_PATH).strip()
    gateway_prefix = str(config.get("gateway_prefix") or DEFAULT_GATEWAY_PREFIX).strip()
    timeout_seconds = int(config.get("request_timeout_seconds") or 60)
    return YonyouHttpClient(
        YonyouRuntimeConfig(
            base_url=base_url.rstrip("/"),
            app_key=app_key,
            app_secret=app_secret,
            auth_path=auth_path,
            gateway_prefix=gateway_prefix,
            timeout_seconds=timeout_seconds,
        )
    )


def _message_from_payload(payload: Dict[str, Any]) -> str:
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        for key in ("messages", "failInfos"):
            values = data.get(key) or []
            if isinstance(values, list) and values:
                first = values[0]
                if isinstance(first, dict):
                    return str(first.get("message") or first.get("errormsg") or first.get("msg") or "").strip()
                return str(first).strip()
    return str(payload.get("message") or payload.get("detail") or "用友接口返回失败").strip()


def _ensure_success_payload(payload: Dict[str, Any], context: str) -> Dict[str, Any]:
    if is_response_success(payload):
        return payload
    raise YonyouRequestError(f"{context}失败：{_message_from_payload(payload)}")


def _coalesce(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _to_status(value: Any) -> str:
    return str(value or "").strip()


def _format_timestamp(*values: Any) -> str:
    for value in values:
        text = _coalesce(value)
        if text:
            return text
    return "--"


def _normalize_quantity(*values: Any) -> int | float | str:
    for value in values:
        if value in (None, ""):
            continue
        try:
            return decimal_to_json_number(to_decimal(value))
        except Exception:
            return str(value)
    return 0


def _group_rows_by_document(rows: Sequence[Dict[str, Any]], *, preferred_keys: Iterable[str] = ()) -> List[Dict[str, Any]]:
    preferred_set = {str(item) for item in preferred_keys}
    grouped: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        document_id = _coalesce(row.get("id"))
        if not document_id:
            continue
        current = grouped.get(document_id)
        row_key = _coalesce(row.get("lineType"))
        if current is None:
            grouped[document_id] = row
            continue
        current_key = _coalesce(current.get("lineType"))
        if row_key in preferred_set and current_key not in preferred_set:
            grouped[document_id] = row
    return list(grouped.values())


def _map_document_status(
    document_key: str,
    *,
    status: Any,
    verifystate: Any,
    completed: bool = False,
) -> str:
    status_text = _to_status(status)
    verifystate_text = _to_status(verifystate)
    if completed:
        return "completed"
    if document_key in {"storeout", "storein"} and (status_text == "3" or verifystate_text == "1"):
        return "completed"
    if verifystate_text == "2" or status_text == "1":
        return "approved"
    if verifystate_text == "1" or status_text == "3":
        return "pending"
    return "draft"


def _query_record_list(client: YonyouHttpClient, *, path: str, body: Dict[str, Any]) -> List[Dict[str, Any]]:
    payload = client.post_json(path, body)
    if _to_status(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(_message_from_payload(payload))
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    return [item for item in record_list if isinstance(item, dict)]


def _find_material_master(material_code: str) -> Dict[str, Any]:
    material = MATERIAL_MASTER.get(str(material_code or "").strip())
    if not material:
        raise ValueError(f"未配置物料主数据：{material_code}")
    return material


def _find_warehouse_master(warehouse_code: str) -> Dict[str, Any]:
    warehouse = WAREHOUSE_MASTER.get(str(warehouse_code or "").strip())
    if not warehouse:
        raise ValueError(f"未配置仓库主数据：{warehouse_code}")
    return warehouse


def _build_purchase_order_spec(payload: Dict[str, Any]) -> Dict[str, Any]:
    material = _find_material_master(_coalesce(payload.get("material_code")))
    quantity = to_decimal(payload.get("quantity"))
    if quantity <= 0:
        raise ValueError("采购数量必须大于 0。")
    unit_price = to_decimal(payload.get("unit_price"), default="0")
    vouchdate = _coalesce(payload.get("vouchdate"), "2026-03-26 00:00:00")
    header = {
        **DEFAULT_PURCHASE_ORDER_VALUES,
        "bustype_code": _coalesce(payload.get("bustype_code"), DEFAULT_PURCHASE_ORDER_VALUES["bustype_code"]),
        "vendor_code": _coalesce(payload.get("vendor_code"), DEFAULT_PURCHASE_ORDER_VALUES["vendor_code"]),
        "invoice_vendor_code": _coalesce(
            payload.get("invoice_vendor_code"),
            payload.get("vendor_code"),
            DEFAULT_PURCHASE_ORDER_VALUES["invoice_vendor_code"],
        ),
        "org_code": _coalesce(payload.get("org_code"), DEFAULT_PURCHASE_ORDER_VALUES["org_code"]),
        "exch_rate_type": _coalesce(payload.get("exch_rate_type"), DEFAULT_PURCHASE_ORDER_VALUES["exch_rate_type"]),
        "taxitems_code": _coalesce(payload.get("taxitems_code"), DEFAULT_PURCHASE_ORDER_VALUES["taxitems_code"]),
        "currency_code": _coalesce(payload.get("currency_code"), DEFAULT_PURCHASE_ORDER_VALUES["currency_code"]),
        "nat_currency_code": _coalesce(
            payload.get("nat_currency_code"),
            payload.get("currency_code"),
            DEFAULT_PURCHASE_ORDER_VALUES["nat_currency_code"],
        ),
        "exch_rate": payload.get("exch_rate") or DEFAULT_PURCHASE_ORDER_VALUES["exch_rate"],
        "vouchdate": vouchdate,
    }
    creator = _coalesce(payload.get("creator"))
    creator_id = _coalesce(payload.get("creator_id"))
    if creator:
        header["creator"] = creator
    if creator_id:
        header["creator_id"] = creator_id
        header["operator"] = creator_id

    return {
        "header": header,
        "lines": [
            {
                "material_code": material["material_code"],
                "quantity": decimal_to_json_number(quantity),
                "unit_price": decimal_to_json_number(unit_price),
                "tax_rate": payload.get("tax_rate") or 0,
                "taxitems_code": header["taxitems_code"],
                "main_unit_code": material["unit_code"],
                "purchase_unit_code": material["unit_code"],
                "price_unit_code": material["unit_code"],
                "in_org_code": header["org_code"],
                "in_invoice_org_code": header["org_code"],
            }
        ],
    }


def _create_purchase_order(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    spec = _build_purchase_order_spec(payload)
    request_payload = build_purchase_order_payload(spec)
    missing_fields = validate_purchase_order_payload(request_payload)
    if missing_fields:
        raise ValueError(f"采购订单缺少必填字段：{', '.join(missing_fields)}")
    response = client.post_json(PURCHASE_ORDER_PATH, request_payload)
    _ensure_success_payload(response, "采购订单创建")
    info = response.get("data") or {}
    first_line = ((info.get("purchaseOrders") or [{}]) or [{}])[0]
    return {
        "document_key": "purchase_order",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "vendor_code": _coalesce(info.get("vendor_code")),
            "material_code": _coalesce(first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
        },
        "request_payload": request_payload,
        "response": response,
    }


def _create_purchase_inbound(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    purchase_order_code = _coalesce(payload.get("purchase_order_code"))
    warehouse_code = _coalesce(payload.get("warehouse_code"))
    if not purchase_order_code:
        raise ValueError("请先输入采购订单编号。")
    if not warehouse_code:
        raise ValueError("请先输入入库仓库编码。")
    order_id = resolve_order_id(client, code=purchase_order_code, order_id="")
    purchase_order_detail = fetch_purchase_order_detail(client, order_id)
    request_payload = build_purchase_inbound_from_source_payload(
        purchase_order_detail,
        make_rule_code="st_purchaseorder",
        warehouse_code=warehouse_code,
        bustype=_coalesce(payload.get("bustype"), "2180202658394538040"),
        merge_source_data=True,
        vouchdate=_coalesce(payload.get("vouchdate"), purchase_order_detail.get("vouchdate"), "2026-03-26 00:00:00"),
    )
    response = create_purchase_inbound_from_source(client, request_payload)
    _ensure_success_payload(response, "采购入库创建")
    info = ((response.get("data") or {}).get("infos") or [{}])[0]
    first_line = ((info.get("purInRecords") or [{}]) or [{}])[0]
    return {
        "document_key": "purchase_inbound",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "warehouse": _coalesce(info.get("warehouse_name"), info.get("subWarehouse_name")),
            "source_no": _coalesce(info.get("srcBillNO"), info.get("firstupcode")),
            "material_code": _coalesce(first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
        },
        "request_payload": request_payload,
        "response": response,
    }


def _build_morphology_lines(
    *,
    bom_lines: Sequence[Dict[str, Any]],
    warehouse_code: str,
    finished_qty: Any,
    serials: Sequence[str],
) -> List[Dict[str, Any]]:
    warehouse = _find_warehouse_master(warehouse_code)
    ratio_base = None
    for line in bom_lines:
        if str(line.get("line_type")) == "成品":
            ratio_base = to_decimal(line.get("qty"), default="1")
            break
    ratio_base = ratio_base or to_decimal("1")
    ratio = to_decimal(finished_qty) / ratio_base
    payload_lines: List[Dict[str, Any]] = []
    serial_index = 0

    for index, bom_line in enumerate(bom_lines, start=1):
        material = _find_material_master(_coalesce(bom_line.get("material_code")))
        line_qty = to_decimal(bom_line.get("qty"), default="0") * ratio
        payload_line: Dict[str, Any] = {
            "groupNumber": "1",
            "lineType": MORPHOLOGY_LINE_TYPE_MAP.get(_coalesce(bom_line.get("line_type")), "4"),
            "warehouse": str(warehouse["warehouse_id"]),
            "warehousePersonId": _coalesce(warehouse.get("warehouse_person_id")),
            "product": material["product"],
            "mainUnitId": material["main_unit_id"],
            "stockUnitId": material["stock_unit_id"],
            "invExchRate": "1",
            "stockStatusDoc": warehouse["stock_status_doc"],
            "stockType": warehouse["stock_type"],
            "qty": decimal_to_json_number(line_qty),
            "subQty": decimal_to_json_number(line_qty),
            "scrap": 0,
            "proratadistribution": 100 if index == 1 else 0,
            "lineno": index * 10,
            "_status": "Insert",
        }
        if index == 1:
            payload_line["bomSelect"] = "1"
        if material.get("requires_morphology_serials"):
            needed = int(to_decimal(line_qty))
            provided = list(serials[serial_index : serial_index + needed])
            if len(provided) != needed:
                raise ValueError(f"{material['material_code']} 需要 {needed} 条序列号，当前仅提供 {len(provided)} 条。")
            payload_line["morphologyconversionsn"] = [{"sn": item, "_status": "Insert"} for item in provided]
            serial_index += needed
        payload_lines.append(payload_line)
    return payload_lines


def _create_morphology_conversion(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    purchase_inbound_code = _coalesce(payload.get("purchase_inbound_code"))
    bom_code = _coalesce(payload.get("bom_code"))
    if not purchase_inbound_code:
        raise ValueError("请先输入采购入库单号。")
    if not bom_code:
        raise ValueError("请先选择形态转换 BOM。")

    inbound_id = resolve_purchase_inbound_id(client, code=purchase_inbound_code, inbound_id="")
    inbound_detail = fetch_purchase_inbound_detail(client, inbound_id)
    warehouse_code = _coalesce(inbound_detail.get("warehouse_code"), inbound_detail.get("subWarehouse_code"), "000003")
    if warehouse_code not in WAREHOUSE_MASTER:
        warehouse_code = "000003"
    finished_qty = payload.get("quantity") or ((inbound_detail.get("purInRecords") or [{}]) or [{}])[0].get("qty")
    if not finished_qty:
        raise ValueError("未能从采购入库单中识别数量，请补充形态转换数量。")

    bom_profiles = {
        "BOM20260301": [
            {"line_type": "成品", "material_code": "yscs061601", "qty": 2026},
            {"line_type": "半成品", "material_code": "yscs061601", "qty": 2026},
            {"line_type": "半成品", "material_code": "003000013", "qty": 2026},
            {"line_type": "半成品", "material_code": "004000001", "qty": 20},
        ],
        "BOM20260308": [
            {"line_type": "成品", "material_code": "yscs061601", "qty": 800},
            {"line_type": "半成品", "material_code": "003000013", "qty": 800},
            {"line_type": "半成品", "material_code": "004000001", "qty": 8},
        ],
        "BOM20260312": [
            {"line_type": "成品", "material_code": "yscs061601", "qty": 120},
            {"line_type": "半成品", "material_code": "003000013", "qty": 120},
        ],
    }
    bom_lines = bom_profiles.get(bom_code)
    if not bom_lines:
        raise ValueError(f"未识别的 BOM 编码：{bom_code}")

    request_payload = build_morphology_conversion_payload(
        org=inbound_detail.get("org") or inbound_detail.get("accountOrg"),
        businesstype=_coalesce(payload.get("businesstype"), "A70003"),
        conversion_type=_coalesce(payload.get("conversion_type"), "3"),
        mc_type=_coalesce(payload.get("mc_type"), "3"),
        vouchdate=_coalesce(payload.get("vouchdate"), inbound_detail.get("vouchdate"), "2026-03-26 00:00:00"),
        before_warehouse=str(_find_warehouse_master(warehouse_code)["warehouse_id"]),
        after_warehouse=str(_find_warehouse_master(warehouse_code)["warehouse_id"]),
        lines=_build_morphology_lines(
            bom_lines=bom_lines,
            warehouse_code=warehouse_code,
            finished_qty=finished_qty,
            serials=list(payload.get("serials") or []),
        ),
        remark=_coalesce(payload.get("remark"), f"采购入库 {purchase_inbound_code} 形态转换"),
    )
    response = create_morphology_conversion(client, request_payload)
    _ensure_success_payload(response, "形态转换创建")
    info = ((response.get("data") or {}).get("infos") or [{}])[0]
    first_line = ((info.get("morphologyconversiondetail") or [{}]) or [{}])[0]
    return {
        "document_key": "morphology_conversion",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "warehouse": _coalesce(info.get("beforeWarehouseName")),
            "material_code": _coalesce(first_line.get("productCode"), first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
            "bom_code": bom_code,
        },
        "request_payload": request_payload,
        "response": response,
    }


def _create_transfer_order(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    purchase_inbound_code = _coalesce(payload.get("purchase_inbound_code"))
    inwarehouse_code = _coalesce(payload.get("inwarehouse_code"))
    if not purchase_inbound_code:
        raise ValueError("请先输入采购入库单号。")
    if not inwarehouse_code:
        raise ValueError("请先输入调入仓库编码。")
    inbound_id = resolve_purchase_inbound_id(client, code=purchase_inbound_code, inbound_id="")
    inbound_detail = fetch_purchase_inbound_detail(client, inbound_id)
    outwarehouse_code = _coalesce(inbound_detail.get("warehouse_code"), inbound_detail.get("subWarehouse_code"), "000003")
    if outwarehouse_code not in WAREHOUSE_MASTER:
        outwarehouse_code = "000003"

    request_payload = build_transfer_order_from_purchase_inbound_payload(
        inbound_detail,
        outwarehouse_code=outwarehouse_code,
        inwarehouse_code=inwarehouse_code,
        bustype=resolve_transfer_order_bustype(client, _coalesce(payload.get("bustype"), "2180202658394537993")),
        memo=_coalesce(payload.get("memo"), f"采购入库 {purchase_inbound_code} 调拨申请"),
        vouchdate=_coalesce(payload.get("vouchdate"), inbound_detail.get("vouchdate"), "2026-03-26 00:00:00"),
    )
    response = create_transfer_order(client, request_payload)
    _ensure_success_payload(response, "调拨订单创建")
    info = ((response.get("data") or {}).get("infos") or [{}])[0]
    first_line = ((info.get("transferApplys") or [{}]) or [{}])[0]
    return {
        "document_key": "transfer_order",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "outwarehouse": _coalesce(info.get("outwarehouse")),
            "inwarehouse": _coalesce(info.get("inwarehouse")),
            "material_code": _coalesce(first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
        },
        "request_payload": request_payload,
        "response": response,
    }


def _resolve_transfer_order_id(client: YonyouHttpClient, code: str) -> str:
    payload = client.post_json(
        TRANSFER_ORDER_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 10,
            "isSum": False,
            "simpleVOs": [{"field": "code", "op": "eq", "value1": code}],
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if _to_status(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"查询调拨订单失败：{_message_from_payload(payload)}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise ValueError(f"未找到调拨订单：{code}")
    return _coalesce(record_list[0].get("id"))


def _fetch_storeout_detail(client: YonyouHttpClient, storeout_id: str) -> Dict[str, Any]:
    payload = client.get_json(STOREOUT_DETAIL_PATH, {"id": storeout_id})
    if _to_status(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"查询调出单详情失败：{_message_from_payload(payload)}")
    detail = payload.get("data") or {}
    if not detail:
        raise YonyouRequestError(f"调出单详情为空：{storeout_id}")
    return detail


def _resolve_storeout_id(client: YonyouHttpClient, code: str) -> str:
    payload = client.post_json(
        STOREOUT_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 10,
            "isSum": False,
            "simpleVOs": [{"field": "code", "op": "eq", "value1": code}],
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if _to_status(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"查询调出单失败：{_message_from_payload(payload)}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise ValueError(f"未找到调出单：{code}")
    return _coalesce(record_list[0].get("id"))


def _resolve_storein_bustype(client: YonyouHttpClient, preferred_bustype: str = "") -> str:
    if _coalesce(preferred_bustype):
        return _coalesce(preferred_bustype)
    payload = client.post_json(
        STOREIN_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 1,
            "isSum": False,
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if _to_status(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"查询调入单列表失败：{_message_from_payload(payload)}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        return "2267093420198592517"
    return _coalesce(record_list[0].get("bustype"), "2267093420198592517")


def _build_storein_from_storeout_payload(
    detail: Dict[str, Any],
    *,
    bustype: str,
    make_rule_code: str = "storeoutTostorein",
    merge_source_data: bool = True,
    vouchdate: str = "",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("调出单缺少主表 id。")
    if not _coalesce(bustype):
        raise ValueError("调入单业务类型不能为空。")
    lines = detail.get("details") or []
    if not lines:
        raise ValueError("调出单缺少明细，无法下推调入。")
    details = []
    for line in lines:
        line_id = line.get("id")
        if line_id in (None, ""):
            raise ValueError("调出单明细缺少 id。")
        details.append(
            {
                "_status": "Insert",
                "sourceid": header_id,
                "sourceautoid": line_id,
                "makeRuleCode": make_rule_code,
            }
        )
    return {
        "data": {
            "mergeSourceData": bool(merge_source_data),
            "bustype": bustype,
            "_status": "Insert",
            "vouchdate": to_compact_date(vouchdate or detail.get("vouchdate")),
            "details": details,
        }
    }


def _create_storeout(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    transfer_order_code = _coalesce(payload.get("transfer_order_code"))
    if not transfer_order_code:
        raise ValueError("请先输入调拨订单号。")
    transfer_order_id = _resolve_transfer_order_id(client, transfer_order_code)
    transfer_order_detail = fetch_transfer_order_detail(client, transfer_order_id)
    request_payload = build_storeout_from_transfer_order_payload(
        transfer_order_detail,
        bustype=resolve_storeout_bustype(client, _coalesce(payload.get("bustype"), "2267093136730750978")),
        make_rule_code=_coalesce(payload.get("make_rule_code"), "st_transferapply"),
        merge_source_data=True,
        vouchdate=_coalesce(payload.get("vouchdate"), transfer_order_detail.get("vouchdate"), "20260326"),
    )
    response = create_storeout_from_source(client, request_payload)
    _ensure_success_payload(response, "调出单创建")
    info = response.get("data") or {}
    detail_rows = info.get("details") or []
    first_line = (detail_rows[0] if detail_rows else {}) or {}
    return {
        "document_key": "storeout",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "outwarehouse": _coalesce(info.get("outwarehouse_name"), info.get("outwarehouse")),
            "source_no": _coalesce(info.get("srcBillNO"), info.get("firstupcode")),
            "material_code": _coalesce(first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
        },
        "request_payload": request_payload,
        "response": response,
    }


def _create_storein(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    storeout_code = _coalesce(payload.get("storeout_code"))
    if not storeout_code:
        raise ValueError("请先输入调出单号。")
    storeout_id = _resolve_storeout_id(client, storeout_code)
    storeout_detail = _fetch_storeout_detail(client, storeout_id)
    request_payload = _build_storein_from_storeout_payload(
        storeout_detail,
        bustype=_resolve_storein_bustype(client, _coalesce(payload.get("bustype"), "2267093420198592517")),
        make_rule_code=_coalesce(payload.get("make_rule_code"), "storeoutTostorein"),
        merge_source_data=True,
        vouchdate=_coalesce(payload.get("vouchdate"), storeout_detail.get("vouchdate"), "20260326"),
    )
    response = client.post_json(STOREIN_SAVE_PATH, request_payload)
    _ensure_success_payload(response, "调入单创建")
    info = response.get("data") or {}
    detail_rows = info.get("details") or []
    first_line = (detail_rows[0] if detail_rows else {}) or {}
    return {
        "document_key": "storein",
        "document_id": _coalesce(info.get("id")),
        "document_code": _coalesce(info.get("code")),
        "summary": {
            "code": _coalesce(info.get("code")),
            "status": info.get("status"),
            "verifystate": info.get("verifystate"),
            "inwarehouse": _coalesce(info.get("inwarehouse_name"), info.get("inwarehouse")),
            "source_no": _coalesce(info.get("srcBillNO"), info.get("firstupcode")),
            "material_code": _coalesce(first_line.get("product_cCode")),
            "qty": _normalize_quantity(first_line.get("qty")),
        },
        "request_payload": request_payload,
        "response": response,
    }


def launch_procurement_document(document_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = create_procurement_client()
    normalized_key = _coalesce(document_key)
    if normalized_key == "purchase_order":
        return _create_purchase_order(client, payload)
    if normalized_key == "purchase_inbound":
        return _create_purchase_inbound(client, payload)
    if normalized_key == "morphology_conversion":
        return _create_morphology_conversion(client, payload)
    if normalized_key == "transfer_order":
        return _create_transfer_order(client, payload)
    if normalized_key == "storeout":
        return _create_storeout(client, payload)
    if normalized_key == "storein":
        return _create_storein(client, payload)
    raise ValueError(f"暂不支持单独发起：{document_key}")


def _build_purchase_order_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows)
    result = []
    for row in deduped_rows:
        completed = _to_status(row.get("purchaseOrders_arrivedStatus")) == "1" or _to_status(row.get("purchaseOrders_inWHStatus")) == "1"
        result.append(
            {
                "id": f"purchase-order-{_coalesce(row.get('id'))}",
                "status": _map_document_status("purchase_order", status=row.get("status"), verifystate=row.get("verifystate"), completed=completed),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "vendor_name": _coalesce(row.get("vendor_name"), row.get("invoiceVendor_name"), row.get("vendor_code")),
                    "material_code": _coalesce(row.get("product_cCode")),
                    "qty": _normalize_quantity(row.get("purchaseOrders_subQty"), row.get("totalQuantity"), row.get("qty")),
                    "creator": _coalesce(row.get("creator"), row.get("operator_name"), row.get("submitter")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("submitTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def _build_purchase_inbound_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows)
    result = []
    for row in deduped_rows:
        result.append(
            {
                "id": f"purchase-inbound-{_coalesce(row.get('id'))}",
                "status": _map_document_status("purchase_inbound", status=row.get("status"), verifystate=row.get("verifystate"), completed=_to_status(row.get("writeOffStatus")) == "1"),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "source_no": _coalesce(row.get("pocode"), row.get("srcBillNO"), row.get("firstupcode")),
                    "warehouse_name": _coalesce(row.get("warehouse_name"), row.get("subWarehouse_name"), row.get("warehouse_code")),
                    "material_code": _coalesce(row.get("product_cCode")),
                    "qty": _normalize_quantity(row.get("priceQty"), row.get("qty"), row.get("subQty")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def _build_morphology_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows, preferred_keys={"3"})
    result = []
    for row in deduped_rows:
        result.append(
            {
                "id": f"morphology-{_coalesce(row.get('id'))}",
                "status": _map_document_status("morphology_conversion", status=row.get("status"), verifystate=row.get("verifystate")),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "bom_code": "--",
                    "warehouse_name": _coalesce(row.get("warehouseName"), row.get("beforeWarehouseName")),
                    "material_code": _coalesce(row.get("morphologyconversiondetail_product_cCode"), row.get("productCode")),
                    "qty": _normalize_quantity(row.get("morphologyconversiondetail_qty"), row.get("qty"), row.get("subQty")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("modifyTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def _build_transfer_order_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows)
    result = []
    for row in deduped_rows:
        result.append(
            {
                "id": f"transfer-order-{_coalesce(row.get('id'))}",
                "status": _map_document_status("transfer_order", status=row.get("status"), verifystate=row.get("verifystate"), completed=_to_status(row.get("finishoutqty")) not in {"", "0", "0.0"}),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "out_warehouse": _coalesce(row.get("outwarehouse_name"), row.get("childoutwarehouse_name"), row.get("childoutwarehouse")),
                    "in_warehouse": _coalesce(row.get("inwarehouse_name"), row.get("childinwarehouse_name"), row.get("childinwarehouse")),
                    "material_code": _coalesce(row.get("product_cCode")),
                    "qty": _normalize_quantity(row.get("qty"), row.get("subQty")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def _build_storeout_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows)
    result = []
    for row in deduped_rows:
        result.append(
            {
                "id": f"storeout-{_coalesce(row.get('id'))}",
                "status": _map_document_status("storeout", status=row.get("status"), verifystate=row.get("verifystate")),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "source_no": _coalesce(row.get("srcbillno"), row.get("firstupcode")),
                    "out_warehouse": _coalesce(row.get("outwarehouse_name"), row.get("outwarehouse")),
                    "material_code": _coalesce(row.get("product_cCode")),
                    "qty": _normalize_quantity(row.get("qty"), row.get("subQty"), row.get("totalQuantity")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def _build_storein_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_rows = _group_rows_by_document(rows)
    result = []
    for row in deduped_rows:
        result.append(
            {
                "id": f"storein-{_coalesce(row.get('id'))}",
                "status": _map_document_status("storein", status=row.get("status"), verifystate=row.get("verifystate")),
                "values": {
                    "document_no": _coalesce(row.get("code")),
                    "source_no": _coalesce(row.get("srcbillno"), row.get("firstupcode")),
                    "in_warehouse": _coalesce(row.get("inwarehouse_name"), row.get("inwarehouse")),
                    "material_code": _coalesce(row.get("product_cCode")),
                    "qty": _normalize_quantity(row.get("qty"), row.get("subQty"), row.get("totalQuantity")),
                    "updated_at": _format_timestamp(row.get("auditTime"), row.get("createTime"), row.get("pubts")),
                },
            }
        )
    return result


def query_procurement_document_rows(*, limit: int = 20) -> Dict[str, List[Dict[str, Any]]]:
    client = create_procurement_client()
    purchase_order_rows = _query_record_list(
        client,
        path=PURCHASE_ORDER_LIST_PATH,
        body={"pageIndex": 1, "pageSize": limit, "isSum": False, "queryOrders": [{"field": "id", "order": "desc"}]},
    )
    purchase_inbound_rows = _query_record_list(
        client,
        path=PURCHASE_INBOUND_LIST_PATH,
        body={"pageIndex": 1, "pageSize": limit, "isSum": False, "queryOrders": [{"field": "id", "order": "desc"}]},
    )
    morphology_payload = client.post_json(
        MORPHOLOGY_CONVERSION_LIST_PATH,
        {"data": {"pageIndex": 1, "pageSize": limit, "queryOrders": [{"field": "id", "order": "desc"}]}},
    )
    if _to_status(morphology_payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"查询形态转换列表失败：{_message_from_payload(morphology_payload)}")
    morphology_rows = [item for item in ((morphology_payload.get("data") or {}).get("recordList") or []) if isinstance(item, dict)]
    transfer_rows = _query_record_list(
        client,
        path=TRANSFER_ORDER_LIST_PATH,
        body={"pageIndex": 1, "pageSize": limit, "isSum": False, "queryOrders": [{"field": "id", "order": "desc"}]},
    )
    storeout_rows = _query_record_list(
        client,
        path=STOREOUT_LIST_PATH,
        body={"pageIndex": 1, "pageSize": limit, "isSum": False, "queryOrders": [{"field": "id", "order": "desc"}]},
    )
    storein_rows = _query_record_list(
        client,
        path=STOREIN_LIST_PATH,
        body={"pageIndex": 1, "pageSize": limit, "isSum": False, "queryOrders": [{"field": "id", "order": "desc"}]},
    )
    return {
        "purchase_order": _build_purchase_order_rows(purchase_order_rows),
        "purchase_inbound": _build_purchase_inbound_rows(purchase_inbound_rows),
        "morphology_conversion": _build_morphology_rows(morphology_rows),
        "transfer_order": _build_transfer_order_rows(transfer_rows),
        "storeout": _build_storeout_rows(storeout_rows),
        "storein": _build_storein_rows(storein_rows),
    }
