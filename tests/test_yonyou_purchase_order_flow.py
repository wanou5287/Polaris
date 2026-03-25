import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.yonyou_purchase_order_flow import (
    build_arrival_from_source_payload,
    build_morphology_conversion_payload,
    build_purchase_inbound_from_source_payload,
    build_storeout_from_transfer_order_payload,
    build_storeout_from_purchase_inbound_payload,
    build_transfer_order_from_purchase_inbound_payload,
    is_purchase_order_approved,
    merge_watch_settings,
    summarize_morphology_conversion,
    summarize_purchase_order,
    summarize_transfer_order,
)


class YonyouPurchaseOrderFlowTests(unittest.TestCase):
    def test_build_arrival_from_source_payload_uses_source_ids_and_full_qty(self) -> None:
        detail = {
            "id": 101,
            "code": "PURCHASE_ORDER_CODE",
            "purchaseOrders": [
                {
                    "id": 102,
                    "qty": 5,
                }
            ],
        }

        payload = build_arrival_from_source_payload(
            detail,
            make_rule_code="st_purchaseorder2",
            warehouse_code="WAREHOUSE_CODE",
            purchase_department_code="DEPARTMENT_CODE",
            recalculate_qty=True,
            accept_qty_mode="full",
        )

        self.assertEqual(payload["data"]["makeRuleCode"], "st_purchaseorder2")
        self.assertEqual(payload["data"]["purchaseDepartment"], "DEPARTMENT_CODE")
        self.assertEqual(payload["data"]["arrivalOrders"][0]["warehouse"], "WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["arrivalOrders"][0]["sourceid"], 101)
        self.assertEqual(payload["data"]["arrivalOrders"][0]["sourceautoid"], 102)
        self.assertEqual(payload["data"]["arrivalOrders"][0]["qty"], 5)
        self.assertEqual(payload["data"]["arrivalOrders"][0]["acceptqty"], 5)

    def test_build_arrival_from_source_payload_requires_warehouse(self) -> None:
        with self.assertRaisesRegex(ValueError, "warehouse_code"):
            build_arrival_from_source_payload(
                {"id": 1, "purchaseOrders": [{"id": 2, "qty": 1}]},
                make_rule_code="st_purchaseorder2",
                warehouse_code="",
            )

    def test_build_purchase_inbound_from_source_payload_uses_bustype_and_source_ids(self) -> None:
        detail = {
            "id": 201,
            "vouchdate": "2026-03-25 00:00:00",
            "purchaseOrders": [
                {
                    "id": 202,
                    "qty": 5,
                }
            ],
        }

        payload = build_purchase_inbound_from_source_payload(
            detail,
            make_rule_code="st_purchaseorder",
            warehouse_code="INBOUND_WAREHOUSE_CODE",
            bustype="PURIN_BUSTYPE_ID",
            merge_source_data=True,
        )

        self.assertEqual(payload["data"]["makeRuleCode"], "st_purchaseorder")
        self.assertEqual(payload["data"]["warehouse"], "INBOUND_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["bustype"], "PURIN_BUSTYPE_ID")
        self.assertEqual(payload["data"]["vouchdate"], "20260325")
        self.assertTrue(payload["data"]["mergeSourceData"])
        self.assertEqual(payload["data"]["purInRecords"][0]["sourceid"], 201)
        self.assertEqual(payload["data"]["purInRecords"][0]["sourceautoid"], 202)
        self.assertEqual(payload["data"]["purInRecords"][0]["qty"], 5)

    def test_build_purchase_inbound_from_source_payload_requires_bustype(self) -> None:
        with self.assertRaisesRegex(ValueError, "bustype"):
            build_purchase_inbound_from_source_payload(
                {"id": 1, "vouchdate": "2026-03-25", "purchaseOrders": [{"id": 2, "qty": 1}]},
                make_rule_code="st_purchaseorder",
                warehouse_code="INBOUND_WAREHOUSE_CODE",
                bustype="",
            )

    def test_build_storeout_from_purchase_inbound_payload_uses_inbound_source_ids(self) -> None:
        detail = {
            "id": 301,
            "vouchdate": "2026-03-25 00:00:00",
            "org": "ORG_ID",
            "accountOrg": "ACCOUNT_ORG_ID",
            "purInRecords": [
                {
                    "id": 302,
                    "qty": 5,
                }
            ],
        }

        payload = build_storeout_from_purchase_inbound_payload(
            detail,
            outwarehouse_code="OUT_WAREHOUSE_CODE",
            inwarehouse_code="IN_WAREHOUSE_CODE",
            bustype="STOREOUT_BUSTYPE_ID",
            make_rule_code="st_purinrecord",
            merge_source_data=True,
        )

        self.assertEqual(payload["data"]["bustype"], "STOREOUT_BUSTYPE_ID")
        self.assertEqual(payload["data"]["outwarehouse"], "OUT_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["inwarehouse"], "IN_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["vouchdate"], "20260325")
        self.assertEqual(payload["data"]["outorg"], "ORG_ID")
        self.assertEqual(payload["data"]["details"][0]["sourceid"], 301)
        self.assertEqual(payload["data"]["details"][0]["sourceautoid"], 302)
        self.assertEqual(payload["data"]["details"][0]["makeRuleCode"], "st_purinrecord")
        self.assertEqual(payload["data"]["details"][0]["qty"], 5)

    def test_build_storeout_from_purchase_inbound_payload_requires_warehouses(self) -> None:
        with self.assertRaisesRegex(ValueError, "outwarehouse_code"):
            build_storeout_from_purchase_inbound_payload(
                {
                    "id": 1,
                    "vouchdate": "2026-03-25",
                    "org": "ORG_ID",
                    "accountOrg": "ACCOUNT_ORG_ID",
                    "purInRecords": [{"id": 2, "qty": 1}],
                },
                outwarehouse_code="",
                inwarehouse_code="IN_WAREHOUSE_CODE",
                bustype="STOREOUT_BUSTYPE_ID",
            )

    def test_build_morphology_conversion_payload_assembly_uses_defaults_and_optional_fields(self) -> None:
        payload = build_morphology_conversion_payload(
            org="ORG_ID",
            businesstype="A70003",
            conversion_type="3",
            mc_type="3",
            vouchdate="2026-03-25 00:00:00",
            before_warehouse="SOURCE_WAREHOUSE_ID",
            after_warehouse="TARGET_WAREHOUSE_ID",
            remark="BOM",
            lines=[
                {
                    "lineType": "3",
                    "product": "FINISHED_PRODUCT_ID",
                    "mainUnitId": "UNIT_ID",
                    "stockUnitId": "UNIT_ID",
                    "qty": 5,
                    "subQty": 5,
                    "warehousePersonId": "WAREHOUSE_PERSON_ID",
                    "bomSelect": "1",
                    "proratadistribution": 100,
                },
                {
                    "groupNumber": "1",
                    "lineType": "4",
                    "warehouse": "SOURCE_WAREHOUSE_ID",
                    "product": "COMPONENT_PRODUCT_ID",
                    "mainUnitId": "UNIT_ID",
                    "stockUnitId": "UNIT_ID",
                    "qty": 2,
                    "subQty": 2,
                    "scrap": 0,
                },
            ],
        )

        self.assertEqual(payload["data"]["org"], "ORG_ID")
        self.assertEqual(payload["data"]["businesstypeId"], "A70003")
        self.assertEqual(payload["data"]["conversionType"], "3")
        self.assertEqual(payload["data"]["mcType"], "3")
        self.assertEqual(payload["data"]["beforeWarehouse"], "SOURCE_WAREHOUSE_ID")
        self.assertEqual(payload["data"]["afterWarehouse"], "TARGET_WAREHOUSE_ID")
        self.assertEqual(payload["data"]["morphologyconversiondetail"][0]["warehouse"], "SOURCE_WAREHOUSE_ID")
        self.assertEqual(payload["data"]["morphologyconversiondetail"][0]["warehousePersonId"], "WAREHOUSE_PERSON_ID")
        self.assertEqual(payload["data"]["morphologyconversiondetail"][1]["qty"], 2)
        self.assertEqual(payload["data"]["morphologyconversiondetail"][1]["invExchRate"], "1")

    def test_build_morphology_conversion_payload_requires_lines(self) -> None:
        with self.assertRaisesRegex(ValueError, "lines"):
            build_morphology_conversion_payload(
                org="ORG_ID",
                businesstype="A70003",
                conversion_type="3",
                mc_type="3",
                vouchdate="2026-03-25 00:00:00",
                before_warehouse="SOURCE_WAREHOUSE_ID",
                after_warehouse="TARGET_WAREHOUSE_ID",
                lines=[],
            )

    def test_build_transfer_order_from_purchase_inbound_payload_uses_codes_and_line_fields(self) -> None:
        detail = {
            "id": 401,
            "vouchdate": "2026-03-25 00:00:00",
            "org": "ORG_ID",
            "accountOrg": "ACCOUNT_ORG_ID",
            "purInRecords": [
                {
                    "id": 402,
                    "product": 501,
                    "qty": 5,
                    "subQty": 5,
                    "priceQty": 5,
                    "unit": 601,
                    "priceUOM": 601,
                    "stockUnitId": 601,
                    "taxitems": "TAXITEM_ID",
                    "taxitems_code": "TAXITEMS_CODE",
                    "stockType": 701,
                    "invExchRate": 1,
                    "invPriceExchRate": 1,
                    "unitExchangeType": 0,
                    "unitExchangeTypePrice": 0,
                    "lineno": 10,
                }
            ],
        }

        payload = build_transfer_order_from_purchase_inbound_payload(
            detail,
            outwarehouse_code="OUT_WAREHOUSE_CODE",
            inwarehouse_code="IN_WAREHOUSE_CODE",
            bustype="TRANSFER_BUSTYPE_ID",
            memo="auto",
        )

        self.assertEqual(payload["data"]["outwarehouse"], "OUT_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["inwarehouse"], "IN_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["bustype"], "TRANSFER_BUSTYPE_ID")
        self.assertEqual(payload["data"]["memo"], "auto")
        self.assertEqual(payload["data"]["transferApplys"][0]["product"], 501)
        self.assertEqual(payload["data"]["transferApplys"][0]["taxitems_code"], "TAXITEMS_CODE")
        self.assertEqual(payload["data"]["transferApplys"][0]["childoutwarehouse"], "OUT_WAREHOUSE_CODE")
        self.assertEqual(payload["data"]["transferApplys"][0]["childinwarehouse"], "IN_WAREHOUSE_CODE")

    def test_build_transfer_order_from_purchase_inbound_payload_requires_warehouses(self) -> None:
        with self.assertRaisesRegex(ValueError, "outwarehouse_code"):
            build_transfer_order_from_purchase_inbound_payload(
                {
                    "id": 1,
                    "org": "ORG_ID",
                    "accountOrg": "ACCOUNT_ORG_ID",
                    "purInRecords": [{"product": 1, "qty": 1}],
                },
                outwarehouse_code="",
                inwarehouse_code="IN_WAREHOUSE_CODE",
                bustype="TRANSFER_BUSTYPE_ID",
            )

    def test_build_storeout_from_transfer_order_payload_uses_transfer_source_ids(self) -> None:
        detail = {
            "id": 501,
            "vouchdate": "2026-03-25 00:00:00",
            "outorg": "OUT_ORG_ID",
            "outaccount": "OUT_ACCOUNT_ID",
            "inorg": "IN_ORG_ID",
            "inaccount": "IN_ACCOUNT_ID",
            "outwarehouse": 801,
            "inwarehouse": 802,
            "transferApplys": [
                {
                    "id": 502,
                    "qty": 5,
                }
            ],
        }

        payload = build_storeout_from_transfer_order_payload(
            detail,
            bustype="STOREOUT_BUSTYPE_ID",
            make_rule_code="st_transferapply",
        )

        self.assertEqual(payload["data"]["bustype"], "STOREOUT_BUSTYPE_ID")
        self.assertEqual(payload["data"]["outwarehouse"], 801)
        self.assertEqual(payload["data"]["inwarehouse"], 802)
        self.assertEqual(payload["data"]["details"][0]["sourceid"], 501)
        self.assertEqual(payload["data"]["details"][0]["sourceautoid"], 502)
        self.assertEqual(payload["data"]["details"][0]["makeRuleCode"], "st_transferapply")
        self.assertEqual(payload["data"]["details"][0]["qty"], 5)

    def test_is_purchase_order_approved_checks_status_and_verifystate(self) -> None:
        self.assertTrue(
            is_purchase_order_approved(
                {"status": 1, "verifystate": 0},
                approved_statuses=["1"],
                approved_verifystates=[],
            )
        )
        self.assertTrue(
            is_purchase_order_approved(
                {"status": 3, "verifystate": 2},
                approved_statuses=["1"],
                approved_verifystates=["2"],
            )
        )
        self.assertFalse(
            is_purchase_order_approved(
                {"status": 3, "verifystate": 1},
                approved_statuses=["1"],
                approved_verifystates=["2"],
            )
        )

    def test_merge_watch_settings_prefers_cli_over_config(self) -> None:
        class Args:
            code = "PURCHASE_ORDER_CODE"
            id = ""
            poll_interval_seconds = 30
            watch_timeout_seconds = 600
            approved_status = ["9"]
            approved_verifystate = []
            auto_create_arrival = True
            make_rule_code = "manual_rule"
            warehouse_code = "WAREHOUSE_CODE"
            purchase_department_code = "DEPARTMENT_CODE"
            accept_qty_mode = "full"
            recalculate_qty = True
            auto_create_inbound = False
            inbound_make_rule_code = ""
            inbound_bustype = ""
            merge_source_data = None

        merged = merge_watch_settings(
            Args(),
            {
                "purchase_order_code": "OLD_CODE",
                "watch": {
                    "poll_interval_seconds": 120,
                    "timeout_seconds": 7200,
                    "approved_statuses": ["1"],
                },
                "arrival": {
                    "make_rule_code": "cfg_rule",
                    "warehouse_code": "CFG_WAREHOUSE",
                },
                "inbound": {
                    "make_rule_code": "cfg_inbound_rule",
                    "bustype": "cfg_bustype",
                },
            },
        )

        self.assertEqual(merged["purchase_order_code"], "PURCHASE_ORDER_CODE")
        self.assertEqual(merged["poll_interval_seconds"], 120)
        self.assertEqual(merged["timeout_seconds"], 7200)
        self.assertEqual(merged["approved_statuses"], ["9"])
        self.assertTrue(merged["auto_create_arrival"])
        self.assertEqual(merged["arrival"]["make_rule_code"], "manual_rule")
        self.assertEqual(merged["arrival"]["warehouse_code"], "WAREHOUSE_CODE")
        self.assertEqual(merged["arrival"]["purchase_department_code"], "DEPARTMENT_CODE")
        self.assertEqual(merged["inbound"]["make_rule_code"], "cfg_inbound_rule")
        self.assertEqual(merged["inbound"]["bustype"], "cfg_bustype")

    def test_summarize_purchase_order_reads_first_line(self) -> None:
        summary = summarize_purchase_order(
            {
                "id": 1,
                "code": "PO001",
                "status": 3,
                "verifystate": 1,
                "submitTime": "2026-03-25 15:40:08",
                "purchaseOrders": [
                    {
                        "id": 2,
                        "arrivedStatus": 2,
                        "inWHStatus": 2,
                        "invoiceStatus": 2,
                        "payStatus": 4,
                    }
                ],
            }
        )

        self.assertEqual(summary["id"], 1)
        self.assertEqual(summary["code"], "PO001")
        self.assertEqual(summary["line_id"], 2)
        self.assertEqual(summary["line_arrivedStatus"], 2)

    def test_summarize_transfer_order_reads_first_line(self) -> None:
        summary = summarize_transfer_order(
            {
                "id": 1,
                "code": "TO001",
                "status": 1,
                "verifystate": 2,
                "outwarehouse_name": "OUT_WAREHOUSE",
                "inwarehouse_name": "IN_WAREHOUSE",
                "transferApplys": [
                    {
                        "id": 2,
                        "product_cCode": "MATERIAL_CODE",
                        "qty": 5,
                    }
                ],
            }
        )

        self.assertEqual(summary["id"], 1)
        self.assertEqual(summary["code"], "TO001")
        self.assertEqual(summary["line_id"], 2)
        self.assertEqual(summary["line_product_code"], "MATERIAL_CODE")

    def test_summarize_morphology_conversion_reads_first_line(self) -> None:
        summary = summarize_morphology_conversion(
            {
                "id": 1,
                "code": "XTZH001",
                "status": 0,
                "verifystate": 0,
                "businesstypeCode": "A70003",
                "conversionType": 3,
                "mcType": "{\"mcType\":\"3\",\"sendtowms\":\"false\"}",
                "morphologyconversiondetail": [
                    {
                        "id": 2,
                        "groupNumber": 1,
                        "lineType": 3,
                        "productCode": "FINISHED_PRODUCT_CODE",
                        "productName": "TEST_PRODUCT",
                        "qty": 5,
                        "warehouse": "WAREHOUSE_CODE",
                    }
                ],
            }
        )

        self.assertEqual(summary["id"], 1)
        self.assertEqual(summary["code"], "XTZH001")
        self.assertEqual(summary["line_id"], 2)
        self.assertEqual(summary["line_product_code"], "FINISHED_PRODUCT_CODE")
        self.assertEqual(summary["line_lineType"], 3)
        self.assertEqual(summary["mcType"], "3")


if __name__ == "__main__":
    unittest.main()
