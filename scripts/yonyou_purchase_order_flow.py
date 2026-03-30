from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterable, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "https://c3.yonyoucloud.com"
DEFAULT_TIMEOUT_SECONDS = 60
SUCCESS_CODES = {"0", "00000", "200", "success", "SUCCESS"}
PURCHASE_ORDER_LIST_PATH = "/yonbip/scm/purchaseorder/list"
PURCHASE_ORDER_DETAIL_PATH = "/yonbip/scm/purchaseorder/detail"
PURCHASE_ORDER_SUBMIT_PATH = "/yonbip/scm/purchaseorder/batchsubmit"
ARRIVAL_BY_SOURCE_PATH = "/yonbip/scm/arrivalorder/addArrivalOrderBySource"
PURCHASE_INBOUND_LIST_PATH = "/yonbip/scm/purinrecord/list"
PURCHASE_INBOUND_DETAIL_PATH = "/yonbip/scm/purinrecord/detail"
PURCHASE_INBOUND_SUBMIT_PATH = "/yonbip/scm/purinrecord/batchsubmit"
PURCHASE_INBOUND_BY_SOURCE_SAVE_PATH = "/yonbip/scm/purinrecord/mergeSourceData/save"
MORPHOLOGY_CONVERSION_LIST_PATH = "/yonbip/scm/morphologyconversion/list"
MORPHOLOGY_CONVERSION_DETAIL_PATH = "/yonbip/scm/morphologyconversion/detail"
MORPHOLOGY_CONVERSION_SAVE_PATH = "/yonbip/scm/morphologyconversion/save"
MORPHOLOGY_CONVERSION_SUBMIT_PATH = "/yonbip/scm/morphologyconversion/batchsubmit"
MORPHOLOGY_CONVERSION_REVIEW_PATH = "/yonbip/scm/morphologyconversion/batchaudit"
MORPHOLOGY_CONVERSION_UNREVIEW_PATH = "/yonbip/scm/morphologyconversion/batchunaudit"
MORPHOLOGY_CONVERSION_DELETE_PATH = "/yonbip/scm/morphologyconversion/batchdelete"
TRANSFER_ORDER_LIST_PATH = "/yonbip/scm/transferapply/list"
TRANSFER_ORDER_DETAIL_PATH = "/yonbip/scm/transferapply/detail"
TRANSFER_ORDER_SAVE_PATH = "/yonbip/scm/transferapply/save"
TRANSFER_ORDER_SUBMIT_PATH = "/yonbip/scm/transferapply/batchsubmit"
TRANSFER_ORDER_REVIEW_PATH = "/yonbip/scm/transferapply/batchaudit"
TRANSFER_ORDER_UNREVIEW_PATH = "/yonbip/scm/transferapply/batchunaudit"
TRANSFER_ORDER_DELETE_PATH = "/yonbip/scm/transferapply/batchdelete"
STOREOUT_LIST_PATH = "/yonbip/scm/storeout/list"
STOREOUT_DETAIL_PATH = "/yonbip/scm/storeout/detail"
STOREOUT_SUBMIT_PATH = "/yonbip/scm/storeout/batchsubmit"
STOREOUT_BY_SOURCE_SAVE_PATH = "/yonbip/scm/storeout/mergeSourceData/save"
STOREOUT_REVIEW_PATH = "/yonbip/scm/storeout/batchaudit"
STOREOUT_DELETE_PATH = "/yonbip/scm/storeout/batchdelete"
DEFAULT_WATCH_CONFIG_PATH = PROJECT_ROOT / "config" / "yonyou_purchase_order_watch.example.json"
DECIMAL_PRECISION = Decimal("0.00000001")


class YonyouRequestError(RuntimeError):
    pass


@dataclass
class YonyouRuntimeConfig:
    base_url: str
    app_key: str
    app_secret: str
    auth_path: str = "/iuap-api-auth/open-auth/selfAppAuth/getAccessToken"
    gateway_prefix: str = "/iuap-api-gateway"
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Submit, query, watch, and orchestrate Yonyou purchase orders.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("YONYOU_BASE_URL", DEFAULT_BASE_URL),
        help="Yonyou gateway base URL.",
    )
    parser.add_argument(
        "--app-key",
        default=os.getenv("YONYOU_APP_KEY", ""),
        help="Yonyou AppKey.",
    )
    parser.add_argument(
        "--app-secret",
        default=os.getenv("YONYOU_APP_SECRET", ""),
        help="Yonyou AppSecret.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP request timeout in seconds.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    query_parser = subparsers.add_parser("query", help="Query a purchase order and optionally print its detail.")
    add_order_ref_arguments(query_parser)
    query_parser.add_argument("--print-detail", action="store_true", help="Print detail payload.")
    query_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the query result.")

    submit_parser = subparsers.add_parser("submit", help="Submit a purchase order into Yonyou workflow.")
    add_order_ref_arguments(submit_parser)
    submit_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the submit result.")

    arrival_parser = subparsers.add_parser("create-arrival", help="Create a purchase arrival order from a purchase order source.")
    add_order_ref_arguments(arrival_parser)
    add_shared_warehouse_argument(arrival_parser)
    add_arrival_arguments(arrival_parser)
    arrival_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    inbound_parser = subparsers.add_parser(
        "create-inbound",
        help="Create a purchase inbound record from a purchase order source.",
    )
    add_order_ref_arguments(inbound_parser)
    add_shared_warehouse_argument(inbound_parser)
    add_inbound_arguments(inbound_parser)
    inbound_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    inbound_query_parser = subparsers.add_parser(
        "query-inbound",
        help="Query a purchase inbound record and optionally print its detail.",
    )
    add_order_ref_arguments(inbound_query_parser)
    inbound_query_parser.add_argument("--print-detail", action="store_true", help="Print detail payload.")
    inbound_query_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the query result.")

    inbound_submit_parser = subparsers.add_parser(
        "submit-inbound",
        help="Submit a purchase inbound record into Yonyou workflow.",
    )
    add_order_ref_arguments(inbound_submit_parser)
    inbound_submit_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the submit result.")

    morphology_create_parser = subparsers.add_parser(
        "create-morphologyconversion",
        help="Create a morphology-conversion document from explicit header fields and line JSON.",
    )
    add_morphology_conversion_arguments(morphology_create_parser)
    morphology_create_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    morphology_query_parser = subparsers.add_parser(
        "query-morphologyconversion",
        help="Query a morphology-conversion document and optionally print its detail.",
    )
    add_order_ref_arguments(morphology_query_parser)
    morphology_query_parser.add_argument("--print-detail", action="store_true", help="Print detail payload.")
    morphology_query_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the query result.")

    morphology_submit_parser = subparsers.add_parser(
        "submit-morphologyconversion",
        help="Submit a morphology-conversion document into Yonyou workflow.",
    )
    add_order_ref_arguments(morphology_submit_parser)
    morphology_submit_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the submit result.")

    morphology_review_parser = subparsers.add_parser(
        "review-morphologyconversion",
        help="Review a morphology-conversion document that does not use workflow submission.",
    )
    add_order_ref_arguments(morphology_review_parser)
    morphology_review_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the review result.")

    transfer_create_parser = subparsers.add_parser(
        "create-transfer-order",
        help="Create a transfer order from a purchase inbound document.",
    )
    add_order_ref_arguments(transfer_create_parser)
    add_transfer_order_arguments(transfer_create_parser)
    transfer_create_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    transfer_query_parser = subparsers.add_parser(
        "query-transfer-order",
        help="Query a transfer order and optionally print its detail.",
    )
    add_order_ref_arguments(transfer_query_parser)
    transfer_query_parser.add_argument("--print-detail", action="store_true", help="Print detail payload.")
    transfer_query_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the query result.")

    transfer_submit_parser = subparsers.add_parser(
        "submit-transfer-order",
        help="Submit a transfer order into Yonyou workflow.",
    )
    add_order_ref_arguments(transfer_submit_parser)
    transfer_submit_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the submit result.")

    transfer_review_parser = subparsers.add_parser(
        "review-transfer-order",
        help="Review a transfer order that does not use workflow submission.",
    )
    add_order_ref_arguments(transfer_review_parser)
    transfer_review_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the review result.")

    storeout_parser = subparsers.add_parser(
        "create-storeout",
        help="Create a transfer-out document from a purchase inbound source.",
    )
    add_order_ref_arguments(storeout_parser)
    add_storeout_arguments(storeout_parser, include_warehouses=True, make_rule_default="st_purinrecord")
    storeout_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    transfer_storeout_parser = subparsers.add_parser(
        "create-storeout-from-transfer-order",
        help="Create a transfer-out document from a transfer order source.",
    )
    add_order_ref_arguments(transfer_storeout_parser)
    add_storeout_arguments(
        transfer_storeout_parser,
        include_warehouses=False,
        make_rule_default="st_transferapply",
    )
    transfer_storeout_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the result.")

    inbound_watch_parser = subparsers.add_parser(
        "watch-inbound",
        help="Poll a purchase inbound record until approved, and optionally create a transfer-out document from source.",
    )
    add_order_ref_arguments(inbound_watch_parser)
    inbound_watch_parser.add_argument(
        "--poll-interval-seconds",
        type=int,
        default=60,
        help="Polling interval in seconds.",
    )
    inbound_watch_parser.add_argument(
        "--watch-timeout-seconds",
        type=int,
        default=4 * 60 * 60,
        help="Maximum watch duration in seconds.",
    )
    inbound_watch_parser.add_argument(
        "--approved-status",
        action="append",
        default=[],
        help="Status value treated as approved. Can be repeated. Defaults to 1.",
    )
    inbound_watch_parser.add_argument(
        "--approved-verifystate",
        action="append",
        default=[],
        help="Optional verifystate value treated as approved. Can be repeated. Defaults to 2.",
    )
    inbound_watch_parser.add_argument(
        "--auto-create-storeout",
        action="store_true",
        help="Create a transfer-out document after approval is detected.",
    )
    inbound_watch_parser.add_argument(
        "--auto-create-transfer-order",
        action="store_true",
        help="Create a transfer order after purchase inbound approval is detected.",
    )
    inbound_watch_parser.add_argument(
        "--auto-submit-transfer-order",
        action="store_true",
        help="Submit the transfer order after it is created when workflow is enabled.",
    )
    inbound_watch_parser.add_argument(
        "--auto-review-transfer-order",
        action="store_true",
        help="Review the transfer order after it is created.",
    )
    inbound_watch_parser.add_argument(
        "--auto-create-storeout-from-transfer-order",
        action="store_true",
        help="Create a transfer-out document from the transfer order after it becomes approved.",
    )
    add_transfer_order_arguments(inbound_watch_parser)
    add_storeout_arguments(inbound_watch_parser, include_warehouses=True, make_rule_default="st_purinrecord")
    inbound_watch_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the watch result.")

    transfer_watch_parser = subparsers.add_parser(
        "watch-transfer-order",
        help="Poll a transfer order until approved, and optionally create a transfer-out document from source.",
    )
    add_order_ref_arguments(transfer_watch_parser)
    transfer_watch_parser.add_argument(
        "--poll-interval-seconds",
        type=int,
        default=60,
        help="Polling interval in seconds.",
    )
    transfer_watch_parser.add_argument(
        "--watch-timeout-seconds",
        type=int,
        default=4 * 60 * 60,
        help="Maximum watch duration in seconds.",
    )
    transfer_watch_parser.add_argument(
        "--approved-status",
        action="append",
        default=[],
        help="Status value treated as approved. Can be repeated. Defaults to 1.",
    )
    transfer_watch_parser.add_argument(
        "--approved-verifystate",
        action="append",
        default=[],
        help="Optional verifystate value treated as approved. Can be repeated. Defaults to 2.",
    )
    transfer_watch_parser.add_argument(
        "--auto-create-storeout",
        action="store_true",
        help="Create a transfer-out document after transfer-order approval is detected.",
    )
    add_storeout_arguments(
        transfer_watch_parser,
        include_warehouses=False,
        make_rule_default="st_transferapply",
    )
    transfer_watch_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the watch result.")

    watch_parser = subparsers.add_parser(
        "watch",
        help="Poll a purchase order until approved, and optionally create an arrival order from source.",
    )
    add_order_ref_arguments(watch_parser)
    add_shared_warehouse_argument(watch_parser)
    watch_parser.add_argument(
        "--config-file",
        default="",
        help="Optional JSON config file for watch mode.",
    )
    watch_parser.add_argument(
        "--poll-interval-seconds",
        type=int,
        default=60,
        help="Polling interval in seconds.",
    )
    watch_parser.add_argument(
        "--watch-timeout-seconds",
        type=int,
        default=4 * 60 * 60,
        help="Maximum watch duration in seconds.",
    )
    watch_parser.add_argument(
        "--approved-status",
        action="append",
        default=[],
        help="Status value treated as approved. Can be repeated. Defaults to 1.",
    )
    watch_parser.add_argument(
        "--approved-verifystate",
        action="append",
        default=[],
        help="Optional verifystate value treated as approved. Can be repeated.",
    )
    watch_parser.add_argument(
        "--auto-create-arrival",
        action="store_true",
        help="Create a purchase arrival order after approval is detected.",
    )
    watch_parser.add_argument(
        "--auto-create-inbound",
        action="store_true",
        help="Create a purchase inbound record after approval is detected.",
    )
    add_arrival_arguments(watch_parser)
    add_inbound_arguments(watch_parser)
    watch_parser.add_argument("--save-file", default="", help="Optional JSON file path to save the watch result.")

    return parser.parse_args()


def add_order_ref_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--code", default="", help="Document code for the selected command.")
    parser.add_argument("--id", default="", help="Document id for the selected command.")


def add_shared_warehouse_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--warehouse-code",
        default="",
        help="Warehouse code used when creating the arrival/inbound document.",
    )


def add_arrival_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--make-rule-code",
        default="",
        help="Arrival source makeRuleCode.",
    )
    parser.add_argument(
        "--purchase-department-code",
        default="",
        help="Optional purchase department code for the arrival order header.",
    )
    parser.add_argument(
        "--recalculate-qty",
        dest="recalculate_qty",
        action="store_true",
        default=None,
        help="Whether the arrival interface should recalculate quantity.",
    )
    parser.add_argument(
        "--no-recalculate-qty",
        dest="recalculate_qty",
        action="store_false",
        help="Disable quantity recalculation when creating the arrival order.",
    )
    parser.add_argument(
        "--accept-qty-mode",
        choices=("full", "zero"),
        default=None,
        help="How to populate acceptqty for each source line.",
    )


def add_inbound_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--inbound-make-rule-code",
        default="",
        help="Purchase inbound source makeRuleCode.",
    )
    parser.add_argument(
        "--inbound-bustype",
        default="",
        help="Purchase inbound transaction type id/code.",
    )
    parser.add_argument(
        "--merge-source-data",
        dest="merge_source_data",
        action="store_true",
        default=None,
        help="Merge purchase source lines when creating the inbound record.",
    )
    parser.add_argument(
        "--no-merge-source-data",
        dest="merge_source_data",
        action="store_false",
        help="Do not merge purchase source lines when creating the inbound record.",
    )


def add_transfer_order_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--transfer-outwarehouse-code",
        default="",
        help="Transfer-order out-warehouse value. Supports warehouse code or id.",
    )
    parser.add_argument(
        "--transfer-inwarehouse-code",
        default="",
        help="Transfer-order in-warehouse value. Supports warehouse code or id.",
    )
    parser.add_argument(
        "--transfer-bustype",
        default="",
        help="Transfer-order transaction type id/code. Defaults to the latest tenant value.",
    )
    parser.add_argument(
        "--transfer-memo",
        default="",
        help="Optional memo for the transfer order.",
    )


def add_morphology_conversion_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--morphology-org",
        default="",
        help="Inventory organization value. Supports organization code or id.",
    )
    parser.add_argument(
        "--morphology-bustype",
        default="",
        help="Morphology-conversion transaction type id/code.",
    )
    parser.add_argument(
        "--morphology-conversion-type",
        default="",
        help="Morphology-conversion conversionType value.",
    )
    parser.add_argument(
        "--morphology-mc-type",
        default="",
        help="Morphology-conversion mcType value.",
    )
    parser.add_argument(
        "--morphology-before-warehouse",
        default="",
        help="Header beforeWarehouse value. Supports warehouse code or id.",
    )
    parser.add_argument(
        "--morphology-after-warehouse",
        default="",
        help="Header afterWarehouse value. Supports warehouse code or id.",
    )
    parser.add_argument(
        "--morphology-vouchdate",
        default="",
        help="Document date for the morphology-conversion document.",
    )
    parser.add_argument(
        "--morphology-remark",
        default="",
        help="Optional remark for the morphology-conversion document.",
    )
    parser.add_argument(
        "--morphology-creator",
        default="",
        help="Optional creator value for the morphology-conversion document.",
    )
    parser.add_argument(
        "--morphology-operator",
        default="",
        help="Optional operator value for the morphology-conversion document.",
    )
    parser.add_argument(
        "--morphology-request-file",
        default="",
        help="Optional path to a JSON file containing the full morphology-conversion payload.",
    )
    parser.add_argument(
        "--morphology-lines-file",
        default="",
        help="Path to a JSON file containing an array of morphology-conversion lines or an object with a lines field.",
    )


def add_storeout_arguments(
    parser: argparse.ArgumentParser,
    *,
    include_warehouses: bool,
    make_rule_default: str,
) -> None:
    if include_warehouses:
        parser.add_argument(
            "--outwarehouse-code",
            default="",
            help="Transfer-out warehouse value. Supports warehouse code or id.",
        )
        parser.add_argument(
            "--inwarehouse-code",
            default="",
            help="Transfer-in warehouse value. Supports warehouse code or id.",
        )
    parser.add_argument(
        "--storeout-bustype",
        default="",
        help="Transfer-out transaction type id/code. Defaults to the latest tenant value.",
    )
    parser.add_argument(
        "--storeout-make-rule-code",
        default=make_rule_default,
        help="Transfer-out source makeRuleCode.",
    )
    parser.add_argument(
        "--storeout-merge-source-data",
        dest="storeout_merge_source_data",
        action="store_true",
        default=None,
        help="Merge purchase inbound source lines when creating the transfer-out document.",
    )
    parser.add_argument(
        "--no-storeout-merge-source-data",
        dest="storeout_merge_source_data",
        action="store_false",
        help="Do not merge purchase inbound source lines when creating the transfer-out document.",
    )


class YonyouHttpClient:
    def __init__(self, config: YonyouRuntimeConfig):
        self.config = config
        self._access_token = ""
        self._access_token_deadline = 0.0

    def _sign(self, params: Dict[str, str]) -> str:
        items = sorted((key, value) for key, value in params.items() if key != "signature")
        raw = "".join(f"{key}{value}" for key, value in items)
        digest = hmac.new(
            self.config.app_secret.encode("utf-8"),
            raw.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("utf-8")

    def _open_json(
        self,
        method: str,
        url: str,
        *,
        body: Dict[str, Any] | list[Any] | None = None,
        headers: Dict[str, str] | None = None,
    ) -> Dict[str, Any]:
        request_headers = {
            "User-Agent": "Polaris/1.0",
            "Content-Type": "application/json",
        }
        if headers:
            request_headers.update(headers)

        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=data,
            headers=request_headers,
            method=method.upper(),
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                text = response.read().decode("utf-8", errors="replace")
                payload = json.loads(text)
                payload["_http_status"] = response.status
                return payload
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as json_exc:
                raise YonyouRequestError(f"HTTP {exc.code} returned non-JSON response: {text}") from json_exc
            payload["_http_status"] = exc.code
            return payload
        except (TimeoutError, socket.timeout, urllib.error.URLError) as exc:
            raise YonyouRequestError(f"Request failed: {exc}") from exc

    def get_access_token(self, *, force_refresh: bool = False) -> str:
        now = time.time()
        if not force_refresh and self._access_token and now < self._access_token_deadline:
            return self._access_token

        timestamp = str(int(now * 1000))
        params = {"appKey": self.config.app_key, "timestamp": timestamp}
        params["signature"] = self._sign(params)
        url = (
            f"{self.config.base_url.rstrip('/')}{self.config.auth_path}"
            f"?{urllib.parse.urlencode(params)}"
        )
        payload = self._open_json("GET", url)
        if str(payload.get("code")) not in {"00000", "200"}:
            raise YonyouRequestError(f"Failed to get access token: {payload}")
        token = ((payload.get("data") or {}).get("access_token") or "").strip()
        if not token:
            raise YonyouRequestError(f"Access token missing in response: {payload}")
        expire_seconds = int(((payload.get("data") or {}).get("expire") or 3600))
        self._access_token = token
        self._access_token_deadline = now + max(expire_seconds - 300, 60)
        return token

    def request_json(
        self,
        path: str,
        *,
        method: str,
        query: Dict[str, Any] | None = None,
        body: Dict[str, Any] | list[Any] | None = None,
        retry_on_token_error: bool = True,
    ) -> Dict[str, Any]:
        token = self.get_access_token()
        query_params = dict(query or {})
        query_params["access_token"] = token
        url = (
            f"{self.config.base_url.rstrip('/')}{self.config.gateway_prefix}{path}"
            f"?{urllib.parse.urlencode(query_params)}"
        )
        payload = self._open_json(method, url, body=body)
        if retry_on_token_error and str(payload.get("code")) in {"102", "300001", "300002"}:
            self.get_access_token(force_refresh=True)
            return self.request_json(path, method=method, query=query, body=body, retry_on_token_error=False)
        return payload

    def post_json(self, path: str, body: Dict[str, Any] | list[Any]) -> Dict[str, Any]:
        return self.request_json(path, method="POST", body=body)

    def get_json(self, path: str, query: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return self.request_json(path, method="GET", query=query)


def ensure_credentials(args: argparse.Namespace) -> YonyouRuntimeConfig:
    if not args.app_key or not args.app_secret:
        raise YonyouRequestError("AppKey/AppSecret are required. Provide them through CLI args or env vars.")
    return YonyouRuntimeConfig(
        base_url=str(args.base_url).rstrip("/"),
        app_key=str(args.app_key),
        app_secret=str(args.app_secret),
        timeout_seconds=int(args.timeout_seconds),
    )


def resolve_path(path_text: str) -> Path:
    path = Path(path_text)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
    return path


def save_json(path_text: str, payload: Dict[str, Any]) -> None:
    path = resolve_path(path_text)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json_file(path_text: str) -> Any:
    if not str(path_text or "").strip():
        raise ValueError("JSON file path is required.")
    path = Path(path_text)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    if not path.exists():
        raise ValueError(f"JSON file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def to_decimal(value: Any, default: str = "0") -> Decimal:
    if value in (None, ""):
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"Unable to parse decimal value: {value!r}") from exc


def decimal_to_json_number(value: Decimal) -> int | float:
    normalized = value.quantize(DECIMAL_PRECISION, rounding=ROUND_HALF_UP)
    if normalized == normalized.to_integral():
        return int(normalized)
    return float(normalized)


def to_compact_date(value: Any) -> str:
    text = str(value or "").strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 8:
        return digits[:8]
    raise ValueError(f"Unable to normalize compact date from value: {value!r}")


def normalize_state_values(values: Iterable[Any]) -> set[str]:
    normalized: set[str] = set()
    for value in values:
        text = str(value).strip()
        if text:
            normalized.add(text)
    return normalized


def load_watch_config(path_text: str) -> Dict[str, Any]:
    if not str(path_text or "").strip():
        return {}
    path = Path(path_text)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_order_id(client: YonyouHttpClient, *, code: str, order_id: str) -> str:
    if str(order_id or "").strip():
        return str(order_id).strip()
    if not str(code or "").strip():
        raise ValueError("Either --id or --code must be provided.")

    payload = client.post_json(
        PURCHASE_ORDER_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 10,
            "isSum": False,
            "simpleVOs": [
                {
                    "field": "code",
                    "op": "eq",
                    "value1": str(code).strip(),
                }
            ],
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query purchase order list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise YonyouRequestError(f"Purchase order not found by code: {code}")
    return str(record_list[0]["id"])


def resolve_purchase_inbound_id(client: YonyouHttpClient, *, code: str, inbound_id: str) -> str:
    if str(inbound_id or "").strip():
        return str(inbound_id).strip()
    if not str(code or "").strip():
        raise ValueError("Either --id or --code must be provided.")

    payload = client.post_json(
        PURCHASE_INBOUND_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 10,
            "isSum": False,
            "simpleVOs": [
                {
                    "field": "code",
                    "op": "eq",
                    "value1": str(code).strip(),
                }
            ],
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query purchase inbound list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise YonyouRequestError(f"Purchase inbound not found by code: {code}")
    return str(record_list[0]["id"])


def resolve_morphology_conversion_id(client: YonyouHttpClient, *, code: str, morphology_conversion_id: str) -> str:
    if str(morphology_conversion_id or "").strip():
        return str(morphology_conversion_id).strip()
    if not str(code or "").strip():
        raise ValueError("Either --id or --code must be provided.")

    payload = client.post_json(
        MORPHOLOGY_CONVERSION_LIST_PATH,
        {
            "data": {
                "pageIndex": 1,
                "pageSize": 10,
                "conditions": [
                    {
                        "field": "code",
                        "op": "eq",
                        "value1": str(code).strip(),
                    }
                ],
                "queryOrders": [{"field": "id", "order": "desc"}],
            }
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query morphology-conversion list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise YonyouRequestError(f"Morphology-conversion document not found by code: {code}")
    return str(record_list[0]["id"])


def resolve_transfer_order_id(client: YonyouHttpClient, *, code: str, transfer_order_id: str) -> str:
    if str(transfer_order_id or "").strip():
        return str(transfer_order_id).strip()
    if not str(code or "").strip():
        raise ValueError("Either --id or --code must be provided.")

    payload = client.post_json(
        TRANSFER_ORDER_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 10,
            "isSum": False,
            "simpleVOs": [
                {
                    "field": "code",
                    "op": "eq",
                    "value1": str(code).strip(),
                }
            ],
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query transfer-order list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list:
        raise YonyouRequestError(f"Transfer order not found by code: {code}")
    return str(record_list[0]["id"])


def fetch_purchase_order_detail(client: YonyouHttpClient, order_id: str) -> Dict[str, Any]:
    payload = client.get_json(PURCHASE_ORDER_DETAIL_PATH, {"id": str(order_id)})
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query purchase order detail: {payload}")
    detail = payload.get("data") or {}
    if not detail:
        raise YonyouRequestError(f"Purchase order detail is empty for id={order_id}")
    return detail


def fetch_purchase_inbound_detail(client: YonyouHttpClient, inbound_id: str) -> Dict[str, Any]:
    payload = client.get_json(PURCHASE_INBOUND_DETAIL_PATH, {"id": str(inbound_id)})
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query purchase inbound detail: {payload}")
    detail = payload.get("data") or {}
    if not detail:
        raise YonyouRequestError(f"Purchase inbound detail is empty for id={inbound_id}")
    return detail


def fetch_morphology_conversion_detail(client: YonyouHttpClient, morphology_conversion_id: str) -> Dict[str, Any]:
    payload = client.get_json(MORPHOLOGY_CONVERSION_DETAIL_PATH, {"id": str(morphology_conversion_id)})
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query morphology-conversion detail: {payload}")
    detail = payload.get("data") or {}
    if not detail:
        raise YonyouRequestError(f"Morphology-conversion detail is empty for id={morphology_conversion_id}")
    return detail


def fetch_transfer_order_detail(client: YonyouHttpClient, transfer_order_id: str) -> Dict[str, Any]:
    payload = client.get_json(TRANSFER_ORDER_DETAIL_PATH, {"id": str(transfer_order_id)})
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query transfer-order detail: {payload}")
    detail = payload.get("data") or {}
    if not detail:
        raise YonyouRequestError(f"Transfer-order detail is empty for id={transfer_order_id}")
    return detail


def submit_purchase_order(client: YonyouHttpClient, order_id: str) -> Dict[str, Any]:
    payload = client.post_json(PURCHASE_ORDER_SUBMIT_PATH, {"data": [{"id": int(order_id)}]})
    return payload


def submit_purchase_inbound(client: YonyouHttpClient, inbound_id: str) -> Dict[str, Any]:
    return client.post_json(PURCHASE_INBOUND_SUBMIT_PATH, {"data": [{"id": int(inbound_id)}]})


def submit_morphology_conversion(client: YonyouHttpClient, morphology_conversion_id: str) -> Dict[str, Any]:
    return client.post_json(MORPHOLOGY_CONVERSION_SUBMIT_PATH, {"data": [{"id": int(morphology_conversion_id)}]})


def review_morphology_conversion(client: YonyouHttpClient, morphology_conversion_id: str) -> Dict[str, Any]:
    return client.post_json(MORPHOLOGY_CONVERSION_REVIEW_PATH, {"data": [{"id": int(morphology_conversion_id)}]})


def submit_transfer_order(client: YonyouHttpClient, transfer_order_id: str) -> Dict[str, Any]:
    return client.post_json(TRANSFER_ORDER_SUBMIT_PATH, {"data": [{"id": int(transfer_order_id)}]})


def review_transfer_order(client: YonyouHttpClient, transfer_order_id: str) -> Dict[str, Any]:
    return client.post_json(TRANSFER_ORDER_REVIEW_PATH, {"data": [{"id": int(transfer_order_id)}]})


def summarize_purchase_order(detail: Dict[str, Any]) -> Dict[str, Any]:
    first_line = ((detail.get("purchaseOrders") or [{}]) or [{}])[0]
    return {
        "id": detail.get("id"),
        "code": detail.get("code"),
        "status": detail.get("status"),
        "verifystate": detail.get("verifystate"),
        "submitTime": detail.get("submitTime"),
        "submitter": detail.get("submitter"),
        "submitter_username": detail.get("submitter_username"),
        "creator": detail.get("creator"),
        "creatorId": detail.get("creatorId"),
        "operator": detail.get("operator"),
        "operator_name": detail.get("operator_name"),
        "isWfControlled": detail.get("isWfControlled"),
        "bizFlow_name": detail.get("bizFlow_name"),
        "purchaseOrder_allArrivedStatus": detail.get("purchaseOrder_allArrivedStatus"),
        "purchaseOrder_allInWHStatus": detail.get("purchaseOrder_allInWHStatus"),
        "purchaseOrder_allInvoiceStatus": detail.get("purchaseOrder_allInvoiceStatus"),
        "line_id": first_line.get("id"),
        "line_arrivedStatus": first_line.get("arrivedStatus"),
        "line_inWHStatus": first_line.get("inWHStatus"),
        "line_invoiceStatus": first_line.get("invoiceStatus"),
        "line_payStatus": first_line.get("payStatus"),
    }


def summarize_purchase_inbound(detail: Dict[str, Any]) -> Dict[str, Any]:
    first_line = ((detail.get("purInRecords") or [{}]) or [{}])[0]
    return {
        "id": detail.get("id"),
        "code": detail.get("code"),
        "status": detail.get("status"),
        "verifystate": detail.get("verifystate"),
        "creator": detail.get("creator"),
        "creatorId": detail.get("creatorId"),
        "operator": detail.get("operator"),
        "operator_name": detail.get("operator_name"),
        "isWfControlled": detail.get("isWfControlled"),
        "bizFlow_name": detail.get("bizFlow_name"),
        "warehouse": detail.get("warehouse"),
        "warehouse_name": detail.get("warehouse_name"),
        "srcBillType": detail.get("srcBillType"),
        "srcBillNO": detail.get("srcBillNO"),
        "line_id": first_line.get("id"),
        "line_sourceid": first_line.get("sourceid"),
        "line_sourceautoid": first_line.get("sourceautoid"),
        "line_makeRuleCode": first_line.get("makeRuleCode"),
        "line_qty": first_line.get("qty"),
    }


def summarize_morphology_conversion(detail: Dict[str, Any]) -> Dict[str, Any]:
    first_line = ((detail.get("morphologyconversiondetail") or [{}]) or [{}])[0]
    mc_type = detail.get("mcType")
    if isinstance(mc_type, str) and mc_type.strip().startswith("{"):
        try:
            mc_type = (json.loads(mc_type).get("mcType") or mc_type)
        except json.JSONDecodeError:
            pass
    if mc_type in (None, ""):
        extend_attrs = detail.get("bustype_extend_attrs_json")
        if isinstance(extend_attrs, str) and extend_attrs.strip().startswith("{"):
            try:
                mc_type = json.loads(extend_attrs).get("mcType")
            except json.JSONDecodeError:
                mc_type = extend_attrs
    return {
        "id": detail.get("id"),
        "code": detail.get("code"),
        "status": detail.get("status"),
        "verifystate": detail.get("verifystate"),
        "creator": detail.get("creator"),
        "creatorId": detail.get("creatorId"),
        "auditor": detail.get("auditor"),
        "auditorId": detail.get("auditorId"),
        "isWfControlled": detail.get("isWfControlled"),
        "businesstypeId": detail.get("businesstypeId") or detail.get("bustype"),
        "businesstypeCode": detail.get("businesstypeCode"),
        "businesstypeName": detail.get("businesstypeName"),
        "conversionType": detail.get("conversionType"),
        "mcType": mc_type,
        "beforeWarehouse": detail.get("beforeWarehouse"),
        "beforeWarehouseName": detail.get("beforeWarehouseName"),
        "afterWarehouse": detail.get("afterWarehouse"),
        "afterWarehouseName": detail.get("afterWarehouseName"),
        "line_id": first_line.get("id"),
        "line_groupNumber": first_line.get("groupNumber"),
        "line_lineType": first_line.get("lineType"),
        "line_product_code": first_line.get("productCode"),
        "line_product_name": first_line.get("productName"),
        "line_qty": first_line.get("qty"),
        "line_subQty": first_line.get("subQty"),
        "line_warehouse": first_line.get("warehouse"),
        "line_warehouseName": first_line.get("warehouseName"),
    }


def summarize_transfer_order(detail: Dict[str, Any]) -> Dict[str, Any]:
    first_line = ((detail.get("transferApplys") or [{}]) or [{}])[0]
    return {
        "id": detail.get("id"),
        "code": detail.get("code"),
        "status": detail.get("status"),
        "verifystate": detail.get("verifystate"),
        "creator": detail.get("creator"),
        "creatorId": detail.get("creatorId"),
        "auditor": detail.get("auditor"),
        "auditorId": detail.get("auditorId"),
        "isWfControlled": detail.get("isWfControlled"),
        "outwarehouse": detail.get("outwarehouse"),
        "outwarehouse_name": detail.get("outwarehouse_name"),
        "inwarehouse": detail.get("inwarehouse"),
        "inwarehouse_name": detail.get("inwarehouse_name"),
        "bustype": detail.get("bustype"),
        "bustype_name": detail.get("bustype_name"),
        "line_id": first_line.get("id"),
        "line_product_code": first_line.get("product_cCode"),
        "line_product_name": first_line.get("product_cName"),
        "line_qty": first_line.get("qty"),
        "line_childoutwarehouse": first_line.get("childoutwarehouse"),
        "line_childinwarehouse": first_line.get("childinwarehouse"),
    }


def build_morphology_conversion_payload(
    *,
    org: Any,
    businesstype: str,
    conversion_type: Any,
    mc_type: Any,
    vouchdate: str,
    lines: Sequence[Dict[str, Any]],
    before_warehouse: Any = "",
    after_warehouse: Any = "",
    remark: str = "",
    creator: str = "",
    operator: Any = "",
) -> Dict[str, Any]:
    if org in (None, ""):
        raise ValueError("Morphology-conversion org is required.")
    if not str(businesstype or "").strip():
        raise ValueError("Morphology-conversion bustype is required.")
    if conversion_type in (None, ""):
        raise ValueError("Morphology-conversion conversion_type is required.")
    if mc_type in (None, ""):
        raise ValueError("Morphology-conversion mc_type is required.")
    if not str(vouchdate or "").strip():
        raise ValueError("Morphology-conversion vouchdate is required.")
    if not lines:
        raise ValueError("Morphology-conversion lines are required.")

    default_warehouse = before_warehouse or after_warehouse
    payload_lines = []
    for index, line in enumerate(lines):
        line_type = line.get("lineType")
        if line_type in (None, ""):
            raise ValueError(f"Morphology-conversion line[{index}] is missing lineType.")
        warehouse = line.get("warehouse", default_warehouse)
        if warehouse in (None, ""):
            raise ValueError(f"Morphology-conversion line[{index}] is missing warehouse.")
        product = line.get("product")
        if product in (None, ""):
            raise ValueError(f"Morphology-conversion line[{index}] is missing product.")
        main_unit = line.get("mainUnitId")
        if main_unit in (None, ""):
            raise ValueError(f"Morphology-conversion line[{index}] is missing mainUnitId.")
        stock_unit = line.get("stockUnitId")
        if stock_unit in (None, ""):
            raise ValueError(f"Morphology-conversion line[{index}] is missing stockUnitId.")
        quantity = to_decimal(line.get("qty"))
        if quantity <= 0:
            raise ValueError(f"Morphology-conversion line[{index}] has non-positive qty.")
        sub_quantity = to_decimal(line.get("subQty"), default=str(quantity))
        payload_line: Dict[str, Any] = {
            "_status": str(line.get("_status") or "Insert"),
            "groupNumber": str(line.get("groupNumber", "1")),
            "lineType": str(line_type),
            "warehouse": warehouse,
            "product": product,
            "mainUnitId": main_unit,
            "stockUnitId": stock_unit,
            "invExchRate": str(line.get("invExchRate", "1")),
            "qty": decimal_to_json_number(quantity),
            "subQty": decimal_to_json_number(sub_quantity),
        }
        for field in (
            "warehousePersonId",
            "stockStatusDoc",
            "stockType",
            "bomSelect",
            "mainBOM",
            "productsku",
            "reservation",
            "reserveid",
            "inventoryowner",
            "ownertype",
            "unitExchangeType",
            "proratadistribution",
            "scrap",
            "fixedQuantity",
            "numeratorQuantity",
            "denominatorQuantity",
            "lineno",
        ):
            value = line.get(field)
            if value not in (None, ""):
                payload_line[field] = value
        payload_lines.append(payload_line)

    payload_data: Dict[str, Any] = {
        "_status": "Insert",
        "org": org,
        "businesstypeId": str(businesstype).strip(),
        "conversionType": str(conversion_type),
        "mcType": str(mc_type),
        "vouchdate": str(vouchdate).strip(),
        "morphologyconversiondetail": payload_lines,
    }
    for field, value in (
        ("beforeWarehouse", before_warehouse),
        ("afterWarehouse", after_warehouse),
        ("remark", remark),
        ("creator", creator),
        ("operator", operator),
    ):
        if value not in (None, ""):
            payload_data[field] = value
    return {"data": payload_data}


def is_purchase_order_approved(
    detail: Dict[str, Any],
    *,
    approved_statuses: Iterable[Any],
    approved_verifystates: Iterable[Any],
) -> bool:
    status_values = normalize_state_values(approved_statuses)
    verifystate_values = normalize_state_values(approved_verifystates)
    status = str(detail.get("status")).strip()
    verifystate = str(detail.get("verifystate")).strip()
    return bool(status and status in status_values) or bool(verifystate and verifystate in verifystate_values)


def build_arrival_from_source_payload(
    detail: Dict[str, Any],
    *,
    make_rule_code: str,
    warehouse_code: str,
    purchase_department_code: str = "",
    recalculate_qty: bool = True,
    accept_qty_mode: str = "full",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("Purchase order detail is missing header id.")
    if not str(make_rule_code or "").strip():
        raise ValueError("Arrival make_rule_code is required.")
    if not str(warehouse_code or "").strip():
        raise ValueError("Arrival warehouse_code is required.")

    lines = detail.get("purchaseOrders") or []
    if not lines:
        raise ValueError("Purchase order detail does not contain any lines.")

    arrival_orders = []
    for index, line in enumerate(lines):
        line_id = line.get("id")
        if line_id in (None, ""):
            raise ValueError(f"Purchase order line[{index}] is missing id.")
        quantity = to_decimal(line.get("qty") or line.get("subQty") or line.get("priceQty"))
        if quantity <= 0:
            raise ValueError(f"Purchase order line[{index}] has non-positive qty.")
        accept_qty = quantity if accept_qty_mode == "full" else Decimal("0")
        arrival_orders.append(
            {
                "warehouse": str(warehouse_code).strip(),
                "bRecalculateQty": bool(recalculate_qty),
                "sourceautoid": line_id,
                "sourceid": header_id,
                "qty": decimal_to_json_number(quantity),
                "acceptqty": decimal_to_json_number(accept_qty),
            }
        )

    header = {
        "makeRuleCode": str(make_rule_code).strip(),
        "arrivalOrders": arrival_orders,
    }
    if str(purchase_department_code or "").strip():
        header["purchaseDepartment"] = str(purchase_department_code).strip()

    return {"data": header}


def create_arrival_from_source(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    return client.post_json(ARRIVAL_BY_SOURCE_PATH, payload)


def build_purchase_inbound_from_source_payload(
    detail: Dict[str, Any],
    *,
    make_rule_code: str,
    warehouse_code: str,
    bustype: str,
    merge_source_data: bool = True,
    vouchdate: str = "",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("Purchase order detail is missing header id.")
    if not str(make_rule_code or "").strip():
        raise ValueError("Inbound make_rule_code is required.")
    if not str(warehouse_code or "").strip():
        raise ValueError("Inbound warehouse_code is required.")
    if not str(bustype or "").strip():
        raise ValueError("Inbound bustype is required.")

    lines = detail.get("purchaseOrders") or []
    if not lines:
        raise ValueError("Purchase order detail does not contain any lines.")

    compact_vouchdate = to_compact_date(vouchdate or detail.get("vouchdate"))
    resubmit_check_key = f"po{header_id}_{int(time.time())}"
    pur_in_records = []

    for index, line in enumerate(lines):
        line_id = line.get("id")
        if line_id in (None, ""):
            raise ValueError(f"Purchase order line[{index}] is missing id.")
        quantity = to_decimal(line.get("qty") or line.get("subQty") or line.get("priceQty"))
        if quantity <= 0:
            raise ValueError(f"Purchase order line[{index}] has non-positive qty.")
        pur_in_records.append(
            {
                "makeRuleCode": str(make_rule_code).strip(),
                "sourceid": header_id,
                "sourceautoid": line_id,
                "qty": decimal_to_json_number(quantity),
                "_status": "Insert",
            }
        )

    return {
        "data": {
            "resubmitCheckKey": resubmit_check_key,
            "mergeSourceData": bool(merge_source_data),
            "vouchdate": compact_vouchdate,
            "bustype": str(bustype).strip(),
            "warehouse": str(warehouse_code).strip(),
            "_status": "Insert",
            "makeRuleCode": str(make_rule_code).strip(),
            "purInRecords": pur_in_records,
        }
    }


def create_purchase_inbound_from_source(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    return client.post_json(PURCHASE_INBOUND_BY_SOURCE_SAVE_PATH, payload)


def create_morphology_conversion(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    return client.post_json(MORPHOLOGY_CONVERSION_SAVE_PATH, payload)


def resolve_transfer_order_bustype(client: YonyouHttpClient, preferred_bustype: str = "") -> str:
    if str(preferred_bustype or "").strip():
        return str(preferred_bustype).strip()

    payload = client.post_json(
        TRANSFER_ORDER_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 1,
            "isSum": False,
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query transfer-order list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list or not str(record_list[0].get("bustype") or "").strip():
        raise YonyouRequestError("Unable to infer transfer-order bustype from tenant data.")
    return str(record_list[0]["bustype"]).strip()


def build_transfer_order_from_purchase_inbound_payload(
    detail: Dict[str, Any],
    *,
    outwarehouse_code: str,
    inwarehouse_code: str,
    bustype: str,
    memo: str = "",
    vouchdate: str = "",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("Purchase inbound detail is missing header id.")
    if not str(outwarehouse_code or "").strip():
        raise ValueError("Transfer-order outwarehouse_code is required.")
    if not str(inwarehouse_code or "").strip():
        raise ValueError("Transfer-order inwarehouse_code is required.")
    if not str(bustype or "").strip():
        raise ValueError("Transfer-order bustype is required.")

    org_id = detail.get("org") or detail.get("accountOrg") or detail.get("purchaseOrg")
    account_id = detail.get("accountOrg") or detail.get("org") or detail.get("purchaseOrg")
    if org_id in (None, "") or account_id in (None, ""):
        raise ValueError("Purchase inbound detail is missing org/account information.")

    lines = detail.get("purInRecords") or []
    if not lines:
        raise ValueError("Purchase inbound detail does not contain any lines.")

    transfer_lines = []
    for index, line in enumerate(lines):
        product_id = line.get("product")
        if product_id in (None, ""):
            raise ValueError(f"Purchase inbound line[{index}] is missing product.")
        quantity = to_decimal(line.get("qty") or line.get("subQty") or line.get("priceQty"))
        if quantity <= 0:
            raise ValueError(f"Purchase inbound line[{index}] has non-positive qty.")
        transfer_lines.append(
            {
                "_status": "Insert",
                "product": product_id,
                "qty": decimal_to_json_number(quantity),
                "subQty": decimal_to_json_number(quantity),
                "priceQty": decimal_to_json_number(to_decimal(line.get("priceQty") or quantity)),
                "unit": line.get("unit"),
                "priceUOM": line.get("priceUOM"),
                "stockUnitId": line.get("stockUnitId"),
                "taxitems": line.get("taxitems"),
                "taxitems_code": line.get("taxitems_code"),
                "stockType": line.get("stockType"),
                "invExchRate": line.get("invExchRate", 1),
                "invPriceExchRate": line.get("invPriceExchRate", 1),
                "unitExchangeType": line.get("unitExchangeType", 0),
                "unitExchangeTypePrice": line.get("unitExchangeTypePrice", 0),
                "inventoryowner": 0,
                "ownertype": 0,
                "outCustodian": 0,
                "inCustodian": 0,
                "outCustodianType": "0",
                "inCustodianType": "0",
                "childoutwarehouse": str(outwarehouse_code).strip(),
                "childinwarehouse": str(inwarehouse_code).strip(),
                "taxUnitPriceTag": bool(line.get("taxUnitPriceTag", True)),
                "lineno": int(line.get("lineno") or 10),
            }
        )

    payload = {
        "data": {
            "_status": "Insert",
            "vouchdate": str(vouchdate or detail.get("vouchdate") or "").strip(),
            "outorg": org_id,
            "outaccount": account_id,
            "inorg": org_id,
            "inaccount": account_id,
            "outwarehouse": str(outwarehouse_code).strip(),
            "inwarehouse": str(inwarehouse_code).strip(),
            "bustype": str(bustype).strip(),
            "exchRate": 1,
            "inventoryowner": 0,
            "ownertype": 0,
            "transferApplys": transfer_lines,
        }
    }
    if str(memo or "").strip():
        payload["data"]["memo"] = str(memo).strip()
    return payload


def create_transfer_order(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    return client.post_json(TRANSFER_ORDER_SAVE_PATH, payload)


def resolve_storeout_bustype(client: YonyouHttpClient, preferred_bustype: str = "") -> str:
    if str(preferred_bustype or "").strip():
        return str(preferred_bustype).strip()

    payload = client.post_json(
        STOREOUT_LIST_PATH,
        {
            "pageIndex": 1,
            "pageSize": 1,
            "isSum": False,
            "queryOrders": [{"field": "id", "order": "desc"}],
        },
    )
    if str(payload.get("code")) not in SUCCESS_CODES:
        raise YonyouRequestError(f"Failed to query transfer-out list: {payload}")
    record_list = ((payload.get("data") or {}).get("recordList") or [])
    if not record_list or not str(record_list[0].get("bustype") or "").strip():
        raise YonyouRequestError("Unable to infer transfer-out bustype from tenant data.")
    return str(record_list[0]["bustype"]).strip()


def build_storeout_from_purchase_inbound_payload(
    detail: Dict[str, Any],
    *,
    outwarehouse_code: str,
    inwarehouse_code: str,
    bustype: str,
    make_rule_code: str = "st_purinrecord",
    merge_source_data: bool = True,
    vouchdate: str = "",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("Purchase inbound detail is missing header id.")
    if not str(outwarehouse_code or "").strip():
        raise ValueError("Transfer-out outwarehouse_code is required.")
    if not str(inwarehouse_code or "").strip():
        raise ValueError("Transfer-out inwarehouse_code is required.")
    if not str(bustype or "").strip():
        raise ValueError("Transfer-out bustype is required.")
    if not str(make_rule_code or "").strip():
        raise ValueError("Transfer-out make_rule_code is required.")

    org_id = detail.get("org") or detail.get("accountOrg") or detail.get("purchaseOrg")
    account_id = detail.get("accountOrg") or detail.get("org") or detail.get("purchaseOrg")
    if org_id in (None, "") or account_id in (None, ""):
        raise ValueError("Purchase inbound detail is missing org/account information.")

    lines = detail.get("purInRecords") or []
    if not lines:
        raise ValueError("Purchase inbound detail does not contain any lines.")

    compact_vouchdate = to_compact_date(vouchdate or detail.get("vouchdate"))
    storeout_lines = []
    for index, line in enumerate(lines):
        line_id = line.get("id")
        if line_id in (None, ""):
            raise ValueError(f"Purchase inbound line[{index}] is missing id.")
        quantity = to_decimal(line.get("qty") or line.get("subQty") or line.get("priceQty"))
        if quantity <= 0:
            raise ValueError(f"Purchase inbound line[{index}] has non-positive qty.")
        storeout_lines.append(
            {
                "_status": "Insert",
                "sourceid": header_id,
                "sourceautoid": line_id,
                "qty": decimal_to_json_number(quantity),
                "makeRuleCode": str(make_rule_code).strip(),
            }
        )

    return {
        "data": {
            "mergeSourceData": bool(merge_source_data),
            "bustype": str(bustype).strip(),
            "_status": "Insert",
            "vouchdate": compact_vouchdate,
            "outorg": org_id,
            "outaccount": account_id,
            "inorg": org_id,
            "inaccount": account_id,
            "outwarehouse": str(outwarehouse_code).strip(),
            "inwarehouse": str(inwarehouse_code).strip(),
            "details": storeout_lines,
        }
    }


def build_storeout_from_transfer_order_payload(
    detail: Dict[str, Any],
    *,
    bustype: str,
    make_rule_code: str = "st_transferapply",
    merge_source_data: bool = True,
    vouchdate: str = "",
) -> Dict[str, Any]:
    header_id = detail.get("id")
    if header_id in (None, ""):
        raise ValueError("Transfer-order detail is missing header id.")
    if not str(bustype or "").strip():
        raise ValueError("Transfer-out bustype is required.")
    if not str(make_rule_code or "").strip():
        raise ValueError("Transfer-out make_rule_code is required.")

    outorg = detail.get("outorg") or detail.get("outaccount")
    outaccount = detail.get("outaccount") or detail.get("outorg")
    inorg = detail.get("inorg") or detail.get("inaccount") or outorg
    inaccount = detail.get("inaccount") or detail.get("inorg") or outaccount
    outwarehouse = detail.get("outwarehouse")
    inwarehouse = detail.get("inwarehouse")
    if outorg in (None, "") or outaccount in (None, ""):
        raise ValueError("Transfer-order detail is missing out-org/account information.")
    if inorg in (None, "") or inaccount in (None, ""):
        raise ValueError("Transfer-order detail is missing in-org/account information.")
    if outwarehouse in (None, "") or inwarehouse in (None, ""):
        raise ValueError("Transfer-order detail is missing warehouse information.")

    lines = detail.get("transferApplys") or []
    if not lines:
        raise ValueError("Transfer-order detail does not contain any lines.")

    compact_vouchdate = to_compact_date(vouchdate or detail.get("vouchdate"))
    storeout_lines = []
    for index, line in enumerate(lines):
        line_id = line.get("id")
        if line_id in (None, ""):
            raise ValueError(f"Transfer-order line[{index}] is missing id.")
        quantity = to_decimal(line.get("qty") or line.get("subQty") or line.get("priceQty"))
        if quantity <= 0:
            raise ValueError(f"Transfer-order line[{index}] has non-positive qty.")
        storeout_lines.append(
            {
                "_status": "Insert",
                "sourceid": header_id,
                "sourceautoid": line_id,
                "qty": decimal_to_json_number(quantity),
                "makeRuleCode": str(make_rule_code).strip(),
            }
        )

    return {
        "data": {
            "mergeSourceData": bool(merge_source_data),
            "bustype": str(bustype).strip(),
            "_status": "Insert",
            "vouchdate": compact_vouchdate,
            "outorg": outorg,
            "outaccount": outaccount,
            "inorg": inorg,
            "inaccount": inaccount,
            "outwarehouse": outwarehouse,
            "inwarehouse": inwarehouse,
            "details": storeout_lines,
        }
    }


def create_storeout_from_source(client: YonyouHttpClient, payload: Dict[str, Any]) -> Dict[str, Any]:
    return client.post_json(STOREOUT_BY_SOURCE_SAVE_PATH, payload)


def is_response_success(payload: Dict[str, Any]) -> bool:
    if str(payload.get("code")) not in SUCCESS_CODES:
        return False
    data = payload.get("data")
    if not isinstance(data, dict):
        return True

    fail_count = data.get("failCount")
    if fail_count not in (None, "", 0, "0"):
        try:
            return int(fail_count) == 0
        except (TypeError, ValueError):
            return False

    for key in ("successCount", "sucessCount"):
        value = data.get(key)
        if value not in (None, ""):
            try:
                return int(value) > 0
            except (TypeError, ValueError):
                return True
    return True


def merge_watch_settings(args: argparse.Namespace, config_data: Dict[str, Any]) -> Dict[str, Any]:
    watch_section = dict(config_data.get("watch") or {})
    arrival_section = dict(config_data.get("arrival") or {})
    inbound_section = dict(config_data.get("inbound") or {})

    approved_statuses = list(watch_section.get("approved_statuses") or ["1"])
    approved_verifystates = list(watch_section.get("approved_verifystates") or [])
    if args.approved_status:
        approved_statuses = list(args.approved_status)
    if args.approved_verifystate:
        approved_verifystates = list(args.approved_verifystate)

    auto_create_arrival = bool(watch_section.get("auto_create_arrival", False)) or bool(args.auto_create_arrival)
    auto_create_inbound = bool(watch_section.get("auto_create_inbound", False)) or bool(args.auto_create_inbound)
    make_rule_code = str(args.make_rule_code or arrival_section.get("make_rule_code") or "st_purchaseorder2")
    warehouse_code = str(args.warehouse_code or arrival_section.get("warehouse_code") or "")
    purchase_department_code = str(
        args.purchase_department_code or arrival_section.get("purchase_department_code") or ""
    )
    accept_qty_mode = str(args.accept_qty_mode or arrival_section.get("accept_qty_mode") or "full")
    if args.recalculate_qty is None:
        recalculate_qty = bool(arrival_section.get("recalculate_qty", True))
    else:
        recalculate_qty = bool(args.recalculate_qty)
    inbound_make_rule_code = str(
        args.inbound_make_rule_code or inbound_section.get("make_rule_code") or "st_purchaseorder"
    )
    inbound_bustype = str(args.inbound_bustype or inbound_section.get("bustype") or "")
    if args.merge_source_data is None:
        merge_source_data = bool(inbound_section.get("merge_source_data", True))
    else:
        merge_source_data = bool(args.merge_source_data)

    return {
        "purchase_order_code": str(args.code or config_data.get("purchase_order_code") or "").strip(),
        "purchase_order_id": str(args.id or config_data.get("purchase_order_id") or "").strip(),
        "poll_interval_seconds": int(watch_section.get("poll_interval_seconds") or args.poll_interval_seconds),
        "timeout_seconds": int(watch_section.get("timeout_seconds") or args.watch_timeout_seconds),
        "approved_statuses": approved_statuses,
        "approved_verifystates": approved_verifystates,
        "auto_create_arrival": auto_create_arrival,
        "auto_create_inbound": auto_create_inbound,
        "arrival": {
            "make_rule_code": make_rule_code,
            "warehouse_code": warehouse_code,
            "purchase_department_code": purchase_department_code,
            "accept_qty_mode": accept_qty_mode,
            "recalculate_qty": recalculate_qty,
        },
        "inbound": {
            "make_rule_code": inbound_make_rule_code,
            "warehouse_code": warehouse_code,
            "bustype": inbound_bustype,
            "merge_source_data": merge_source_data,
        },
    }


def print_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    args = parse_args()
    try:
        client = YonyouHttpClient(ensure_credentials(args))

        if args.command == "query":
            order_id = resolve_order_id(client, code=args.code, order_id=args.id)
            detail = fetch_purchase_order_detail(client, order_id)
            result = {
                "status": "ok",
                "summary": summarize_purchase_order(detail),
            }
            if args.print_detail:
                result["detail"] = detail
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0

        if args.command == "submit":
            order_id = resolve_order_id(client, code=args.code, order_id=args.id)
            payload = submit_purchase_order(client, order_id)
            result = {
                "status": "ok" if str(payload.get("code")) in SUCCESS_CODES else "failed",
                "order_id": order_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-arrival":
            order_id = resolve_order_id(client, code=args.code, order_id=args.id)
            detail = fetch_purchase_order_detail(client, order_id)
            arrival_payload = build_arrival_from_source_payload(
                detail,
                make_rule_code=args.make_rule_code or "st_purchaseorder2",
                warehouse_code=args.warehouse_code,
                purchase_department_code=args.purchase_department_code,
                recalculate_qty=True if args.recalculate_qty is None else args.recalculate_qty,
                accept_qty_mode=args.accept_qty_mode or "full",
            )
            response = create_arrival_from_source(client, arrival_payload)
            result = {
                "status": "ok" if str(response.get("code")) in SUCCESS_CODES else "failed",
                "order_id": order_id,
                "purchase_order": summarize_purchase_order(detail),
                "arrival_payload": arrival_payload,
                "response": response,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-inbound":
            order_id = resolve_order_id(client, code=args.code, order_id=args.id)
            detail = fetch_purchase_order_detail(client, order_id)
            inbound_payload = build_purchase_inbound_from_source_payload(
                detail,
                make_rule_code=args.inbound_make_rule_code or "st_purchaseorder",
                warehouse_code=args.warehouse_code,
                bustype=args.inbound_bustype,
                merge_source_data=True if args.merge_source_data is None else args.merge_source_data,
            )
            response = create_purchase_inbound_from_source(client, inbound_payload)
            result = {
                "status": "ok" if str(response.get("code")) in SUCCESS_CODES else "failed",
                "order_id": order_id,
                "purchase_order": summarize_purchase_order(detail),
                "inbound_payload": inbound_payload,
                "response": response,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "query-inbound":
            inbound_id = resolve_purchase_inbound_id(client, code=args.code, inbound_id=args.id)
            detail = fetch_purchase_inbound_detail(client, inbound_id)
            result = {
                "status": "ok",
                "summary": summarize_purchase_inbound(detail),
            }
            if args.print_detail:
                result["detail"] = detail
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0

        if args.command == "submit-inbound":
            inbound_id = resolve_purchase_inbound_id(client, code=args.code, inbound_id=args.id)
            payload = submit_purchase_inbound(client, inbound_id)
            result = {
                "status": "ok" if is_response_success(payload) else "failed",
                "inbound_id": inbound_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-morphologyconversion":
            if args.morphology_request_file:
                payload = load_json_file(args.morphology_request_file)
            else:
                lines_raw = load_json_file(args.morphology_lines_file)
                lines = lines_raw.get("lines") if isinstance(lines_raw, dict) else lines_raw
                if not isinstance(lines, list):
                    raise ValueError("Morphology-conversion lines file must contain an array or an object with a lines array.")
                payload = build_morphology_conversion_payload(
                    org=args.morphology_org,
                    businesstype=args.morphology_bustype,
                    conversion_type=args.morphology_conversion_type,
                    mc_type=args.morphology_mc_type,
                    vouchdate=args.morphology_vouchdate,
                    before_warehouse=args.morphology_before_warehouse,
                    after_warehouse=args.morphology_after_warehouse,
                    lines=lines,
                    remark=args.morphology_remark,
                    creator=args.morphology_creator,
                    operator=args.morphology_operator,
                )
            response = create_morphology_conversion(client, payload)
            result = {
                "status": "ok" if is_response_success(response) else "failed",
                "morphology_conversion_payload": payload,
                "response": response,
            }
            if result["status"] == "ok":
                info = ((response.get("data") or {}).get("infos") or [{}])[0]
                result["morphology_conversion_id"] = info.get("id")
                result["morphology_conversion_code"] = info.get("code")
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "query-morphologyconversion":
            morphology_conversion_id = resolve_morphology_conversion_id(
                client,
                code=args.code,
                morphology_conversion_id=args.id,
            )
            detail = fetch_morphology_conversion_detail(client, morphology_conversion_id)
            result = {
                "status": "ok",
                "summary": summarize_morphology_conversion(detail),
            }
            if args.print_detail:
                result["detail"] = detail
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0

        if args.command == "submit-morphologyconversion":
            morphology_conversion_id = resolve_morphology_conversion_id(
                client,
                code=args.code,
                morphology_conversion_id=args.id,
            )
            payload = submit_morphology_conversion(client, morphology_conversion_id)
            result = {
                "status": "ok" if is_response_success(payload) else "failed",
                "morphology_conversion_id": morphology_conversion_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "review-morphologyconversion":
            morphology_conversion_id = resolve_morphology_conversion_id(
                client,
                code=args.code,
                morphology_conversion_id=args.id,
            )
            payload = review_morphology_conversion(client, morphology_conversion_id)
            result = {
                "status": "ok" if is_response_success(payload) else "failed",
                "morphology_conversion_id": morphology_conversion_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-transfer-order":
            inbound_id = resolve_purchase_inbound_id(client, code=args.code, inbound_id=args.id)
            detail = fetch_purchase_inbound_detail(client, inbound_id)
            transfer_payload = build_transfer_order_from_purchase_inbound_payload(
                detail,
                outwarehouse_code=args.transfer_outwarehouse_code,
                inwarehouse_code=args.transfer_inwarehouse_code,
                bustype=resolve_transfer_order_bustype(client, args.transfer_bustype),
                memo=args.transfer_memo,
            )
            response = create_transfer_order(client, transfer_payload)
            result = {
                "status": "ok" if is_response_success(response) else "failed",
                "inbound_id": inbound_id,
                "purchase_inbound": summarize_purchase_inbound(detail),
                "transfer_order_payload": transfer_payload,
                "response": response,
            }
            if result["status"] == "ok":
                info = ((response.get("data") or {}).get("infos") or [{}])[0]
                result["transfer_order_id"] = info.get("id")
                result["transfer_order_code"] = info.get("code")
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "query-transfer-order":
            transfer_order_id = resolve_transfer_order_id(client, code=args.code, transfer_order_id=args.id)
            detail = fetch_transfer_order_detail(client, transfer_order_id)
            result = {
                "status": "ok",
                "summary": summarize_transfer_order(detail),
            }
            if args.print_detail:
                result["detail"] = detail
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0

        if args.command == "submit-transfer-order":
            transfer_order_id = resolve_transfer_order_id(client, code=args.code, transfer_order_id=args.id)
            payload = submit_transfer_order(client, transfer_order_id)
            result = {
                "status": "ok" if is_response_success(payload) else "failed",
                "transfer_order_id": transfer_order_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "review-transfer-order":
            transfer_order_id = resolve_transfer_order_id(client, code=args.code, transfer_order_id=args.id)
            payload = review_transfer_order(client, transfer_order_id)
            result = {
                "status": "ok" if is_response_success(payload) else "failed",
                "transfer_order_id": transfer_order_id,
                "response": payload,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-storeout":
            inbound_id = resolve_purchase_inbound_id(client, code=args.code, inbound_id=args.id)
            detail = fetch_purchase_inbound_detail(client, inbound_id)
            storeout_payload = build_storeout_from_purchase_inbound_payload(
                detail,
                outwarehouse_code=args.outwarehouse_code,
                inwarehouse_code=args.inwarehouse_code,
                bustype=resolve_storeout_bustype(client, args.storeout_bustype),
                make_rule_code=args.storeout_make_rule_code,
                merge_source_data=True if args.storeout_merge_source_data is None else args.storeout_merge_source_data,
            )
            response = create_storeout_from_source(client, storeout_payload)
            result = {
                "status": "ok" if is_response_success(response) else "failed",
                "inbound_id": inbound_id,
                "purchase_inbound": summarize_purchase_inbound(detail),
                "storeout_payload": storeout_payload,
                "response": response,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "create-storeout-from-transfer-order":
            transfer_order_id = resolve_transfer_order_id(client, code=args.code, transfer_order_id=args.id)
            detail = fetch_transfer_order_detail(client, transfer_order_id)
            storeout_payload = build_storeout_from_transfer_order_payload(
                detail,
                bustype=resolve_storeout_bustype(client, args.storeout_bustype),
                make_rule_code=args.storeout_make_rule_code,
                merge_source_data=True if args.storeout_merge_source_data is None else args.storeout_merge_source_data,
            )
            response = create_storeout_from_source(client, storeout_payload)
            result = {
                "status": "ok" if is_response_success(response) else "failed",
                "transfer_order_id": transfer_order_id,
                "transfer_order": summarize_transfer_order(detail),
                "storeout_payload": storeout_payload,
                "response": response,
            }
            if args.save_file:
                save_json(args.save_file, result)
            print_json(result)
            return 0 if result["status"] == "ok" else 2

        if args.command == "watch-inbound":
            inbound_id = resolve_purchase_inbound_id(client, code=args.code, inbound_id=args.id)
            approved_statuses = list(args.approved_status or ["1"])
            approved_verifystates = list(args.approved_verifystate or ["2"])
            start_time = time.time()
            last_summary: Dict[str, Any] | None = None

            while True:
                try:
                    detail = fetch_purchase_inbound_detail(client, inbound_id)
                except YonyouRequestError as exc:
                    print_json({"watch_event": "request_error", "message": str(exc)})
                    if time.time() - start_time >= args.watch_timeout_seconds:
                        result = {
                            "status": "timeout",
                            "message": str(exc),
                            "approved_statuses": approved_statuses,
                            "approved_verifystates": approved_verifystates,
                        }
                        if args.save_file:
                            save_json(args.save_file, result)
                        print_json(result)
                        return 3
                    time.sleep(args.poll_interval_seconds)
                    continue

                summary = summarize_purchase_inbound(detail)
                if summary != last_summary:
                    print_json({"watch_event": "state_changed", "summary": summary})
                    last_summary = summary

                if is_purchase_order_approved(
                    detail,
                    approved_statuses=approved_statuses,
                    approved_verifystates=approved_verifystates,
                ):
                    result: Dict[str, Any] = {
                        "status": "approved",
                        "summary": summary,
                    }
                    if args.auto_create_storeout:
                        storeout_payload = build_storeout_from_purchase_inbound_payload(
                            detail,
                            outwarehouse_code=args.outwarehouse_code,
                            inwarehouse_code=args.inwarehouse_code,
                            bustype=resolve_storeout_bustype(client, args.storeout_bustype),
                            make_rule_code=args.storeout_make_rule_code,
                            merge_source_data=True if args.storeout_merge_source_data is None else args.storeout_merge_source_data,
                        )
                        storeout_response = create_storeout_from_source(client, storeout_payload)
                        result["storeout_payload"] = storeout_payload
                        result["storeout_response"] = storeout_response
                        if not is_response_success(storeout_response):
                            result["status"] = "storeout_failed"
                    if args.auto_create_transfer_order:
                        transfer_payload = build_transfer_order_from_purchase_inbound_payload(
                            detail,
                            outwarehouse_code=args.transfer_outwarehouse_code,
                            inwarehouse_code=args.transfer_inwarehouse_code,
                            bustype=resolve_transfer_order_bustype(client, args.transfer_bustype),
                            memo=args.transfer_memo,
                        )
                        transfer_response = create_transfer_order(client, transfer_payload)
                        result["transfer_order_payload"] = transfer_payload
                        result["transfer_order_response"] = transfer_response
                        if not is_response_success(transfer_response):
                            result["status"] = "transfer_order_failed"
                        else:
                            info = ((transfer_response.get("data") or {}).get("infos") or [{}])[0]
                            transfer_order_id = str(info.get("id") or "")
                            transfer_detail = fetch_transfer_order_detail(client, transfer_order_id)
                            result["transfer_order_summary"] = summarize_transfer_order(transfer_detail)

                            if args.auto_submit_transfer_order:
                                if transfer_detail.get("isWfControlled"):
                                    submit_response = submit_transfer_order(client, transfer_order_id)
                                    result["transfer_order_submit_response"] = submit_response
                                    if not is_response_success(submit_response):
                                        result["status"] = "transfer_order_submit_failed"
                                else:
                                    result["transfer_order_submit_skipped"] = "workflow_not_enabled"

                            if (
                                result["status"] == "approved"
                                and args.auto_review_transfer_order
                                and not is_purchase_order_approved(
                                    transfer_detail,
                                    approved_statuses=approved_statuses,
                                    approved_verifystates=approved_verifystates,
                                )
                            ):
                                review_response = review_transfer_order(client, transfer_order_id)
                                result["transfer_order_review_response"] = review_response
                                if not is_response_success(review_response):
                                    result["status"] = "transfer_order_review_failed"
                                transfer_detail = fetch_transfer_order_detail(client, transfer_order_id)
                                result["transfer_order_summary"] = summarize_transfer_order(transfer_detail)

                            if result["status"] == "approved" and args.auto_create_storeout_from_transfer_order:
                                transfer_is_approved = is_purchase_order_approved(
                                    transfer_detail,
                                    approved_statuses=approved_statuses,
                                    approved_verifystates=approved_verifystates,
                                )
                                if transfer_is_approved:
                                    transfer_storeout_payload = build_storeout_from_transfer_order_payload(
                                        transfer_detail,
                                        bustype=resolve_storeout_bustype(client, args.storeout_bustype),
                                        make_rule_code=args.storeout_make_rule_code,
                                        merge_source_data=True
                                        if args.storeout_merge_source_data is None
                                        else args.storeout_merge_source_data,
                                    )
                                    transfer_storeout_response = create_storeout_from_source(
                                        client,
                                        transfer_storeout_payload,
                                    )
                                    result["storeout_from_transfer_order_payload"] = transfer_storeout_payload
                                    result["storeout_from_transfer_order_response"] = transfer_storeout_response
                                    if not is_response_success(transfer_storeout_response):
                                        result["status"] = "storeout_from_transfer_order_failed"
                                else:
                                    result["status"] = "transfer_order_pending"
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 0 if result["status"] == "approved" else 2

                if time.time() - start_time >= args.watch_timeout_seconds:
                    result = {
                        "status": "timeout",
                        "summary": summary,
                        "approved_statuses": approved_statuses,
                        "approved_verifystates": approved_verifystates,
                    }
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 3

                time.sleep(args.poll_interval_seconds)

        if args.command == "watch-transfer-order":
            transfer_order_id = resolve_transfer_order_id(client, code=args.code, transfer_order_id=args.id)
            approved_statuses = list(args.approved_status or ["1"])
            approved_verifystates = list(args.approved_verifystate or ["2"])
            start_time = time.time()
            last_summary: Dict[str, Any] | None = None

            while True:
                try:
                    detail = fetch_transfer_order_detail(client, transfer_order_id)
                except YonyouRequestError as exc:
                    print_json({"watch_event": "request_error", "message": str(exc)})
                    if time.time() - start_time >= args.watch_timeout_seconds:
                        result = {
                            "status": "timeout",
                            "message": str(exc),
                            "approved_statuses": approved_statuses,
                            "approved_verifystates": approved_verifystates,
                        }
                        if args.save_file:
                            save_json(args.save_file, result)
                        print_json(result)
                        return 3
                    time.sleep(args.poll_interval_seconds)
                    continue

                summary = summarize_transfer_order(detail)
                if summary != last_summary:
                    print_json({"watch_event": "state_changed", "summary": summary})
                    last_summary = summary

                if is_purchase_order_approved(
                    detail,
                    approved_statuses=approved_statuses,
                    approved_verifystates=approved_verifystates,
                ):
                    result: Dict[str, Any] = {
                        "status": "approved",
                        "summary": summary,
                    }
                    if args.auto_create_storeout:
                        storeout_payload = build_storeout_from_transfer_order_payload(
                            detail,
                            bustype=resolve_storeout_bustype(client, args.storeout_bustype),
                            make_rule_code=args.storeout_make_rule_code,
                            merge_source_data=True if args.storeout_merge_source_data is None else args.storeout_merge_source_data,
                        )
                        storeout_response = create_storeout_from_source(client, storeout_payload)
                        result["storeout_payload"] = storeout_payload
                        result["storeout_response"] = storeout_response
                        if not is_response_success(storeout_response):
                            result["status"] = "storeout_failed"
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 0 if result["status"] == "approved" else 2

                if time.time() - start_time >= args.watch_timeout_seconds:
                    result = {
                        "status": "timeout",
                        "summary": summary,
                        "approved_statuses": approved_statuses,
                        "approved_verifystates": approved_verifystates,
                    }
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 3

                time.sleep(args.poll_interval_seconds)

        if args.command == "watch":
            config_data = load_watch_config(args.config_file)
            settings = merge_watch_settings(args, config_data)
            order_id = resolve_order_id(
                client,
                code=settings["purchase_order_code"],
                order_id=settings["purchase_order_id"],
            )
            start_time = time.time()
            last_summary: Dict[str, Any] | None = None
            while True:
                try:
                    detail = fetch_purchase_order_detail(client, order_id)
                except YonyouRequestError as exc:
                    print_json({"watch_event": "request_error", "message": str(exc)})
                    if time.time() - start_time >= settings["timeout_seconds"]:
                        result = {
                            "status": "timeout",
                            "message": str(exc),
                            "approved_statuses": settings["approved_statuses"],
                            "approved_verifystates": settings["approved_verifystates"],
                        }
                        if args.save_file:
                            save_json(args.save_file, result)
                        print_json(result)
                        return 3
                    time.sleep(settings["poll_interval_seconds"])
                    continue
                summary = summarize_purchase_order(detail)
                if summary != last_summary:
                    print_json({"watch_event": "state_changed", "summary": summary})
                    last_summary = summary

                if is_purchase_order_approved(
                    detail,
                    approved_statuses=settings["approved_statuses"],
                    approved_verifystates=settings["approved_verifystates"],
                ):
                    result: Dict[str, Any] = {
                        "status": "approved",
                        "summary": summary,
                    }
                    if settings["auto_create_arrival"]:
                        arrival_payload = build_arrival_from_source_payload(
                            detail,
                            make_rule_code=settings["arrival"]["make_rule_code"],
                            warehouse_code=settings["arrival"]["warehouse_code"],
                            purchase_department_code=settings["arrival"]["purchase_department_code"],
                            recalculate_qty=settings["arrival"]["recalculate_qty"],
                            accept_qty_mode=settings["arrival"]["accept_qty_mode"],
                        )
                        arrival_response = create_arrival_from_source(client, arrival_payload)
                        result["arrival_payload"] = arrival_payload
                        result["arrival_response"] = arrival_response
                        if str(arrival_response.get("code")) not in SUCCESS_CODES:
                            result["status"] = "arrival_failed"
                    elif settings["auto_create_inbound"]:
                        inbound_payload = build_purchase_inbound_from_source_payload(
                            detail,
                            make_rule_code=settings["inbound"]["make_rule_code"],
                            warehouse_code=settings["inbound"]["warehouse_code"],
                            bustype=settings["inbound"]["bustype"],
                            merge_source_data=settings["inbound"]["merge_source_data"],
                        )
                        inbound_response = create_purchase_inbound_from_source(client, inbound_payload)
                        result["inbound_payload"] = inbound_payload
                        result["inbound_response"] = inbound_response
                        if str(inbound_response.get("code")) not in SUCCESS_CODES:
                            result["status"] = "inbound_failed"
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 0 if result["status"] == "approved" else 2

                if time.time() - start_time >= settings["timeout_seconds"]:
                    result = {
                        "status": "timeout",
                        "summary": summary,
                        "approved_statuses": settings["approved_statuses"],
                        "approved_verifystates": settings["approved_verifystates"],
                    }
                    if args.save_file:
                        save_json(args.save_file, result)
                    print_json(result)
                    return 3

                time.sleep(settings["poll_interval_seconds"])

        raise YonyouRequestError(f"Unsupported command: {args.command}")
    except (ValueError, YonyouRequestError) as exc:
        print_json({"status": "error", "message": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
