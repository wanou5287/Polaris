import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.yonyou_purchase_order import build_purchase_order_payload, validate_purchase_order_payload


class YonyouPurchaseOrderTests(unittest.TestCase):
    def test_build_purchase_order_payload_applies_fallbacks_and_totals(self) -> None:
        payload = build_purchase_order_payload(
            {
                "header": {
                    "bustype_code": "PURCHASE_BUSTYPE_CODE",
                    "vendor_code": "VENDOR_CODE",
                    "org_code": "ORG_CODE",
                    "creator": "TEST_CREATOR",
                    "creator_id": "CREATOR_ID",
                    "currency_code": "CNY",
                    "exch_rate": 1,
                    "exch_rate_type": "EXCHANGE_RATE_TYPE",
                    "vouchdate": "2026-03-25",
                },
                "lines": [
                    {
                        "material_code": "MATERIAL_CODE",
                        "quantity": 1,
                        "unit_price": 0,
                        "tax_rate": 0,
                        "taxitems_code": "TAXITEMS_CODE",
                        "main_unit_code": "UNIT_CODE",
                    }
                ],
            }
        )

        header = payload["data"]
        line = header["purchaseOrders"][0]

        self.assertEqual(header["invoiceVendor_code"], "VENDOR_CODE")
        self.assertEqual(header["creator"], "TEST_CREATOR")
        self.assertEqual(header["creatorId"], "CREATOR_ID")
        self.assertEqual(header["vouchdate"], "2026-03-25 00:00:00")
        self.assertEqual(header["oriMoney"], 0)
        self.assertEqual(header["oriSum"], 0)
        self.assertEqual(header["natMoney"], 0)
        self.assertEqual(header["natSum"], 0)

        self.assertEqual(line["product_cCode"], "MATERIAL_CODE")
        self.assertEqual(line["qty"], 1)
        self.assertEqual(line["subQty"], 1)
        self.assertEqual(line["priceQty"], 1)
        self.assertEqual(line["unit_code"], "UNIT_CODE")
        self.assertEqual(line["purUOM_Code"], "UNIT_CODE")
        self.assertEqual(line["priceUOM_Code"], "UNIT_CODE")
        self.assertEqual(line["inOrg_code"], "ORG_CODE")
        self.assertEqual(line["inInvoiceOrg_code"], "ORG_CODE")
        self.assertEqual(line["oriUnitPrice"], 0)
        self.assertEqual(line["oriTaxUnitPrice"], 0)
        self.assertEqual(line["natUnitPrice"], 0)
        self.assertEqual(line["natTaxUnitPrice"], 0)
        self.assertEqual(line["taxitems_code"], "TAXITEMS_CODE")

    def test_validate_purchase_order_payload_reports_missing_business_fields(self) -> None:
        payload = build_purchase_order_payload(
            {
                "header": {
                    "currency_code": "CNY",
                    "exch_rate": 1,
                    "vouchdate": "2026-03-25",
                },
                "lines": [
                    {
                        "material_code": "MATERIAL_CODE",
                        "quantity": 1,
                        "unit_price": 0,
                    }
                ],
            }
        )

        missing = validate_purchase_order_payload(payload)

        self.assertIn("data.bustype_code", missing)
        self.assertIn("data.vendor_code", missing)
        self.assertIn("data.invoiceVendor_code", missing)
        self.assertIn("data.org_code", missing)
        self.assertIn("data.exchRateType", missing)
        self.assertIn("data.purchaseOrders[0].taxitems_code", missing)
        self.assertIn("data.purchaseOrders[0].unit_code", missing)
        self.assertIn("data.purchaseOrders[0].inOrg_code", missing)


if __name__ == "__main__":
    unittest.main()
