from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if TYPE_CHECKING:
    from scripts.yonyou_inventory_sync import YonyouOpenApiClient


PURCHASE_ORDER_PATH = "/yonbip/scm/purchaseorder/singleSave_v1"
DEFAULT_BASE_URL = "https://c3.yonyoucloud.com"
DEFAULT_INPUT_PATH = PROJECT_ROOT / "config" / "yonyou_purchase_order_request.example.json"
DECIMAL_PRECISION = Decimal("0.00000001")

REQUIRED_HEADER_FIELDS = (
    "bustype_code",
    "exchRate",
    "exchRateType",
    "invoiceVendor_code",
    "currency_code",
    "natCurrency_code",
    "org_code",
    "_status",
    "vendor_code",
    "vouchdate",
)

REQUIRED_LINE_FIELDS = (
    "inInvoiceOrg_code",
    "inOrg_code",
    "invExchRate",
    "natMoney",
    "natSum",
    "natTax",
    "natTaxUnitPrice",
    "natUnitPrice",
    "oriMoney",
    "oriSum",
    "oriTax",
    "oriTaxUnitPrice",
    "oriUnitPrice",
    "taxitems_code",
    "priceQty",
    "product_cCode",
    "priceUOM_Code",
    "purUOM_Code",
    "qty",
    "subQty",
    "unitExchangeTypePrice",
    "unitExchangeType",
    "invPriceExchRate",
    "unit_code",
    "_status",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build and optionally submit a Yonyou purchase order payload.",
    )
    parser.add_argument(
        "--input-file",
        default=str(DEFAULT_INPUT_PATH),
        help="Path to the simplified purchase-order input JSON file.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("YONYOU_BASE_URL", DEFAULT_BASE_URL),
        help="Yonyou gateway base URL. Defaults to c3 or YONYOU_BASE_URL.",
    )
    parser.add_argument(
        "--app-key",
        default=os.getenv("YONYOU_APP_KEY", ""),
        help="Yonyou AppKey. Defaults to YONYOU_APP_KEY.",
    )
    parser.add_argument(
        "--app-secret",
        default=os.getenv("YONYOU_APP_SECRET", ""),
        help="Yonyou AppSecret. Defaults to YONYOU_APP_SECRET.",
    )
    parser.add_argument(
        "--tenant-id",
        default=os.getenv("YONYOU_TENANT_ID", ""),
        help="Optional Yonyou tenant id.",
    )
    parser.add_argument(
        "--print-body",
        action="store_true",
        help="Print the generated request payload.",
    )
    parser.add_argument(
        "--save-body-file",
        default="",
        help="Optional path to save the generated request payload JSON.",
    )
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Actually submit the purchase order. Without this flag, the script only validates.",
    )
    return parser.parse_args()


def build_logger() -> logging.Logger:
    logger = logging.getLogger("yonyou_purchase_order")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(name)s - %(message)s"))
    logger.addHandler(handler)
    return logger


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent_dir(path: Path) -> None:
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def to_decimal(value: Any, default: str = "0") -> Decimal:
    if value in (None, ""):
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Unable to parse decimal value: {value!r}") from exc


def quantize_decimal(value: Decimal) -> Decimal:
    return value.quantize(DECIMAL_PRECISION, rounding=ROUND_HALF_UP)


def decimal_to_json_number(value: Decimal) -> int | float:
    normalized = quantize_decimal(value)
    if normalized == normalized.to_integral():
        return int(normalized)
    return float(normalized)


def is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def coalesce(*values: Any, default: str = "") -> str:
    for value in values:
        if isinstance(value, str):
            if value.strip():
                return value.strip()
        elif value not in (None, ""):
            return str(value)
    return default


def normalize_datetime(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) == 10:
        return f"{text} 00:00:00"
    return text


def build_line_payload(header: Dict[str, Any], raw_line: Dict[str, Any], index: int) -> Dict[str, Any]:
    quantity = to_decimal(raw_line.get("quantity"))
    unit_price = to_decimal(raw_line.get("unit_price"))
    tax_rate = to_decimal(raw_line.get("tax_rate"))
    exch_rate = to_decimal(header.get("exch_rate", 1), default="1")
    main_unit_code = coalesce(raw_line.get("main_unit_code"))
    purchase_unit_code = coalesce(raw_line.get("purchase_unit_code"), main_unit_code)
    price_unit_code = coalesce(raw_line.get("price_unit_code"), main_unit_code)
    in_org_code = coalesce(raw_line.get("in_org_code"), header.get("org_code"))
    in_invoice_org_code = coalesce(raw_line.get("in_invoice_org_code"), header.get("org_code"))

    tax_amount = quantize_decimal(quantity * unit_price * tax_rate / Decimal("100"))
    ori_money = quantize_decimal(quantity * unit_price)
    ori_sum = quantize_decimal(ori_money + tax_amount)
    ori_tax_unit_price = quantize_decimal(unit_price + (unit_price * tax_rate / Decimal("100")))
    nat_money = quantize_decimal(ori_money * exch_rate)
    nat_tax = quantize_decimal(tax_amount * exch_rate)
    nat_sum = quantize_decimal(ori_sum * exch_rate)
    nat_unit_price = quantize_decimal(unit_price * exch_rate)
    nat_tax_unit_price = quantize_decimal(ori_tax_unit_price * exch_rate)

    payload: Dict[str, Any] = {
        "inInvoiceOrg_code": in_invoice_org_code,
        "inOrg_code": in_org_code,
        "invExchRate": decimal_to_json_number(to_decimal(raw_line.get("inv_exch_rate", 1), default="1")),
        "natMoney": decimal_to_json_number(nat_money),
        "natSum": decimal_to_json_number(nat_sum),
        "natTax": decimal_to_json_number(nat_tax),
        "natTaxUnitPrice": decimal_to_json_number(nat_tax_unit_price),
        "natUnitPrice": decimal_to_json_number(nat_unit_price),
        "oriMoney": decimal_to_json_number(ori_money),
        "oriSum": decimal_to_json_number(ori_sum),
        "oriTax": decimal_to_json_number(tax_amount),
        "oriTaxUnitPrice": decimal_to_json_number(ori_tax_unit_price),
        "oriUnitPrice": decimal_to_json_number(unit_price),
        "taxitems_code": coalesce(raw_line.get("taxitems_code")),
        "priceQty": decimal_to_json_number(quantity),
        "product_cCode": coalesce(raw_line.get("material_code")),
        "priceUOM_Code": price_unit_code,
        "purUOM_Code": purchase_unit_code,
        "qty": decimal_to_json_number(quantity),
        "rowno": str(raw_line.get("rowno") or ((index + 1) * 10)),
        "subQty": decimal_to_json_number(quantity),
        "unitExchangeTypePrice": int(raw_line.get("unit_exchange_type_price", 0)),
        "unitExchangeType": int(raw_line.get("unit_exchange_type", 0)),
        "invPriceExchRate": decimal_to_json_number(to_decimal(raw_line.get("inv_price_exch_rate", 1), default="1")),
        "unit_code": main_unit_code,
        "_status": str(raw_line.get("_status") or "Insert"),
    }

    optional_mappings = {
        "warehouse_code": "warehouse_code",
        "project_code": "project_code",
        "productsku_code": "productsku",
    }
    for source_key, target_key in optional_mappings.items():
        value = coalesce(raw_line.get(source_key))
        if value:
            payload[target_key] = value

    if raw_line.get("is_gift") is not None:
        payload["isGiftProduct"] = bool(raw_line.get("is_gift"))

    if raw_line.get("line_id"):
        payload["id"] = str(raw_line.get("line_id"))

    return payload


def build_purchase_order_payload(spec: Dict[str, Any]) -> Dict[str, Any]:
    header = dict(spec.get("header") or {})
    raw_lines = list(spec.get("lines") or [])

    exch_rate = to_decimal(header.get("exch_rate", 1), default="1")
    lines = [build_line_payload(header, line, index) for index, line in enumerate(raw_lines)]

    total_ori_money = sum(to_decimal(line["oriMoney"]) for line in lines)
    total_ori_sum = sum(to_decimal(line["oriSum"]) for line in lines)
    total_nat_money = sum(to_decimal(line["natMoney"]) for line in lines)
    total_nat_sum = sum(to_decimal(line["natSum"]) for line in lines)

    payload: Dict[str, Any] = {
        "data": {
            "bustype_code": coalesce(header.get("bustype_code")),
            "exchRate": decimal_to_json_number(exch_rate),
            "exchRateType": coalesce(header.get("exch_rate_type")),
            "invoiceVendor_code": coalesce(header.get("invoice_vendor_code"), header.get("vendor_code")),
            "currency_code": coalesce(header.get("currency_code"), default="CNY"),
            "natCurrency_code": coalesce(header.get("nat_currency_code"), header.get("currency_code"), default="CNY"),
            "natMoney": decimal_to_json_number(total_nat_money),
            "natSum": decimal_to_json_number(total_nat_sum),
            "org_code": coalesce(header.get("org_code")),
            "bAutoGetPriceForApi": bool(header.get("auto_get_price", False)),
            "oriMoney": decimal_to_json_number(total_ori_money),
            "oriSum": decimal_to_json_number(total_ori_sum),
            "purchaseOrders": lines,
            "_status": str(header.get("_status") or "Insert"),
            "vendor_code": coalesce(header.get("vendor_code")),
            "vouchdate": normalize_datetime(header.get("vouchdate")),
        }
    }

    optional_header_mappings = {
        "code": "code",
        "id": "id",
        "creator": "creator",
        "creator_id": "creatorId",
        "operator": "operator",
        "department": "department",
        "contact": "contact",
        "vendor_contact": "vendorcontact",
        "trade_route_id": "tradeRouteID",
        "trade_route_code": "tradeRouteID_code",
    }
    for source_key, target_key in optional_header_mappings.items():
        value = header.get(source_key)
        if value not in (None, ""):
            payload["data"][target_key] = value

    return payload


def validate_purchase_order_payload(payload: Dict[str, Any]) -> List[str]:
    data = payload.get("data") or {}
    missing: List[str] = []

    for field in REQUIRED_HEADER_FIELDS:
        if is_missing(data.get(field)):
            missing.append(f"data.{field}")

    purchase_orders = data.get("purchaseOrders")
    if not isinstance(purchase_orders, list) or not purchase_orders:
        missing.append("data.purchaseOrders")
        return missing

    for index, order in enumerate(purchase_orders):
        for field in REQUIRED_LINE_FIELDS:
            if is_missing(order.get(field)):
                missing.append(f"data.purchaseOrders[{index}].{field}")

        if to_decimal(order.get("qty"), default="0") <= 0:
            missing.append(f"data.purchaseOrders[{index}].qty")

    return missing


def save_payload(path: Path, payload: Dict[str, Any]) -> None:
    ensure_parent_dir(path)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_yonyou_runtime_types():
    try:
        from scripts.yonyou_inventory_sync import EndpointConfig, YonyouApiError, YonyouConfig, YonyouOpenApiClient
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Submitting to Yonyou requires runtime dependencies from requirements.txt, including requests."
        ) from exc
    return EndpointConfig, YonyouApiError, YonyouConfig, YonyouOpenApiClient


def build_client(args: argparse.Namespace, logger: logging.Logger) -> "YonyouOpenApiClient":
    EndpointConfig, _, YonyouConfig, YonyouOpenApiClient = load_yonyou_runtime_types()
    config = YonyouConfig(
        base_url=str(args.base_url).rstrip("/"),
        app_key=str(args.app_key),
        app_secret=str(args.app_secret),
        tenant_id=str(args.tenant_id),
        inventory=EndpointConfig(path="/yonbip/scm/stock/QueryCurrentStocksByCondition"),
        salesout=EndpointConfig(path="/yonbip/scm/salesout/list"),
    )
    return YonyouOpenApiClient(config, logger)


def main() -> int:
    args = parse_args()
    logger = build_logger()

    input_path = Path(args.input_file)
    if not input_path.is_absolute():
        input_path = PROJECT_ROOT / input_path
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    if args.submit and (not args.app_key or not args.app_secret):
        print("AppKey/AppSecret are required when --submit is used.", file=sys.stderr)
        return 1

    spec = load_json(input_path)
    payload = build_purchase_order_payload(spec)
    missing_fields = validate_purchase_order_payload(payload)

    if args.save_body_file:
        body_path = Path(args.save_body_file)
        if not body_path.is_absolute():
            body_path = PROJECT_ROOT / body_path
        save_payload(body_path, payload)
        print(f"Generated payload saved to: {body_path}")

    if args.print_body:
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    if missing_fields:
        print(
            json.dumps(
                {
                    "status": "validation_failed",
                    "missing_fields": missing_fields,
                    "hint": "Fill the missing business master-data fields before submitting.",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    if not args.submit:
        print(
            json.dumps(
                {
                    "status": "validated",
                    "message": "Payload validated. Re-run with --submit to create the purchase order.",
                    "path": PURCHASE_ORDER_PATH,
                    "base_url": str(args.base_url).rstrip("/"),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    try:
        _, YonyouApiError, _, _ = load_yonyou_runtime_types()
        client = build_client(args, logger)
        result = client.post_json(PURCHASE_ORDER_PATH, payload, access_token_mode="query")
    except RuntimeError as exc:
        print(
            json.dumps(
                {
                    "status": "dependency_missing",
                    "message": str(exc),
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 2
    except YonyouApiError as exc:
        print(
            json.dumps(
                {
                    "status": "request_failed",
                    "message": str(exc),
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 2

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
