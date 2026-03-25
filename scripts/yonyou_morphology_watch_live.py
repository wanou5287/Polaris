from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from yonyou_purchase_order_flow import (
    YonyouHttpClient,
    YonyouRequestError,
    YonyouRuntimeConfig,
    build_transfer_order_from_purchase_inbound_payload,
    create_transfer_order,
    fetch_morphology_conversion_detail,
    fetch_purchase_inbound_detail,
    fetch_transfer_order_detail,
    resolve_transfer_order_bustype,
    review_transfer_order,
    summarize_morphology_conversion,
    summarize_transfer_order,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Watch a Yonyou morphology-conversion document and create the next transfer order after approval.",
    )
    parser.add_argument("--base-url", default="https://c3.yonyoucloud.com")
    parser.add_argument("--app-key", required=True)
    parser.add_argument("--app-secret", required=True)
    parser.add_argument("--morphology-id", required=True)
    parser.add_argument("--inbound-id", required=True)
    parser.add_argument("--outwarehouse-code", required=True)
    parser.add_argument("--inwarehouse-code", required=True)
    parser.add_argument("--poll-interval-seconds", type=int, default=5)
    parser.add_argument("--timeout-seconds", type=int, default=4 * 60 * 60)
    parser.add_argument("--transfer-bustype", default="")
    parser.add_argument("--transfer-memo", default="形态转换审批通过后自动创建调拨订单")
    parser.add_argument("--result-file", required=True)
    return parser.parse_args()


def save_json(path_text: str, payload: dict) -> None:
    path = Path(path_text)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    client = YonyouHttpClient(
        YonyouRuntimeConfig(
            base_url=args.base_url,
            app_key=args.app_key,
            app_secret=args.app_secret,
        )
    )

    start_time = time.time()
    last_summary: dict | None = None

    while True:
        try:
            detail = fetch_morphology_conversion_detail(client, args.morphology_id)
        except YonyouRequestError as exc:
            print(json.dumps({"watch_event": "request_error", "message": str(exc)}, ensure_ascii=False), flush=True)
            if time.time() - start_time >= args.timeout_seconds:
                result = {"status": "timeout", "message": str(exc)}
                save_json(args.result_file, result)
                print(json.dumps(result, ensure_ascii=False), flush=True)
                return 3
            time.sleep(args.poll_interval_seconds)
            continue

        summary = summarize_morphology_conversion(detail)
        if summary != last_summary:
            print(json.dumps({"watch_event": "state_changed", "summary": summary}, ensure_ascii=False), flush=True)
            last_summary = summary

        if str(detail.get("status")).strip() == "1" or str(detail.get("verifystate")).strip() == "2":
            result: dict = {"status": "approved", "summary": summary}

            inbound_detail = fetch_purchase_inbound_detail(client, args.inbound_id)
            transfer_payload = build_transfer_order_from_purchase_inbound_payload(
                inbound_detail,
                outwarehouse_code=args.outwarehouse_code,
                inwarehouse_code=args.inwarehouse_code,
                bustype=resolve_transfer_order_bustype(client, args.transfer_bustype),
                memo=args.transfer_memo,
            )
            transfer_response = create_transfer_order(client, transfer_payload)
            result["transfer_order_payload"] = transfer_payload
            result["transfer_order_response"] = transfer_response

            info = ((transfer_response.get("data") or {}).get("infos") or [{}])[0]
            transfer_id = str(info.get("id") or "")
            result["transfer_order_id"] = transfer_id
            result["transfer_order_code"] = info.get("code")

            if transfer_id:
                transfer_detail = fetch_transfer_order_detail(client, transfer_id)
                result["transfer_order_summary"] = summarize_transfer_order(transfer_detail)
                if str(transfer_detail.get("status")).strip() != "1" and str(transfer_detail.get("verifystate")).strip() != "2":
                    review_response = review_transfer_order(client, transfer_id)
                    result["transfer_order_review_response"] = review_response
                    transfer_detail = fetch_transfer_order_detail(client, transfer_id)
                    result["transfer_order_summary"] = summarize_transfer_order(transfer_detail)

            save_json(args.result_file, result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            return 0

        if time.time() - start_time >= args.timeout_seconds:
            result = {"status": "timeout", "summary": summary}
            save_json(args.result_file, result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            return 3

        time.sleep(args.poll_interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
