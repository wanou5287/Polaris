import sys
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.yonyou_inventory_sync import (
    build_inventory_cleaning_rows,
    build_sales_cleaning_rows,
    quote_mysql_url,
    transform_inventory_rows,
    transform_sales_raw_rows,
)


class YonyouInventorySyncTests(unittest.TestCase):
    def test_transform_sales_raw_rows_keeps_negative_quantity(self) -> None:
        rows = [
            {
                "vouchdate": "2026-03-08 09:00:00",
                "org": "ORG-1",
                "org_name": "Main Org",
                "salesOrg": "SALE-1",
                "salesOrg_name": "Sale Org",
                "warehouse": "WH-1",
                "warehouse_name": "Main Warehouse",
                "details_product": "MAT-1",
                "product_cCode": "M-001",
                "product_cName": "Material 1",
                "details_productsku": "SKU-1",
                "productsku_cCode": "SKU001",
                "productsku_cName": "SKU 1",
                "unitName": "PCS",
                "qty": "12",
                "code": "SO-001",
                "details_id": "LINE-1",
                "pubts": "100",
            },
            {
                "vouchdate": "2026-03-08 10:00:00",
                "org": "ORG-1",
                "org_name": "Main Org",
                "salesOrg": "SALE-1",
                "salesOrg_name": "Sale Org",
                "warehouse": "WH-1",
                "warehouse_name": "Main Warehouse",
                "details_product": "MAT-1",
                "product_cCode": "M-001",
                "product_cName": "Material 1",
                "details_productsku": "SKU-1",
                "productsku_cCode": "SKU001",
                "productsku_cName": "SKU 1",
                "unitName": "PCS",
                "qty": "-2",
                "code": "SO-002",
                "details_id": "LINE-2",
                "pubts": "101",
            },
        ]

        transformed = transform_sales_raw_rows(rows)

        self.assertEqual(len(transformed), 2)
        positive, negative = transformed
        self.assertEqual(positive["biz_date"], date(2026, 3, 8))
        self.assertEqual(positive["qty"], Decimal("12"))
        self.assertEqual(positive["source_row_key"], "LINE-1")
        self.assertIn('"qty": "12"', positive["raw_json"])
        self.assertEqual(negative["qty"], Decimal("-2"))
        self.assertEqual(negative["source_row_key"], "LINE-2")
        self.assertIn('"qty": "-2"', negative["raw_json"])

    def test_transform_inventory_rows_preserves_snapshot_dimensions(self) -> None:
        rows = [
            {
                "org": "ORG-1",
                "org_name": "Main Org",
                "warehouse": "WH-1",
                "warehouse_name": "Main Warehouse",
                "product": "MAT-1",
                "product_code": "M-001",
                "product_name": "Material 1",
                "productsku": "SKU-1",
                "productsku_code": "SKU001",
                "productsku_name": "SKU 1",
                "unit": "PCS",
                "currentqty": "15.5",
                "availableqty": "12.1",
                "planavailableqty": "11.0",
                "innoticeqty": "2",
                "batchno": "BATCH-1",
                "stockStatusDoc": "STS-1",
                "store": "STORE-1",
                "pubts": "123",
            }
        ]

        snapshot_date = date(2026, 3, 9)
        captured_at = datetime(2026, 3, 9, 8, 0, 0)
        transformed = transform_inventory_rows(rows, snapshot_date=snapshot_date, captured_at=captured_at)

        self.assertEqual(len(transformed), 1)
        record = transformed[0]
        self.assertEqual(record["snapshot_date"], snapshot_date)
        self.assertEqual(record["captured_at"], captured_at)
        self.assertEqual(record["material_code"], "M-001")
        self.assertEqual(record["current_qty"], Decimal("15.5"))
        self.assertEqual(record["available_qty"], Decimal("12.1"))
        self.assertEqual(record["batch_no"], "BATCH-1")

    def test_build_sales_cleaning_rows_uses_expected_business_rules(self) -> None:
        raw_rows = [
            {
                "biz_date": date(2026, 3, 11),
                "material_code": "M-001",
                "material_name": "蓝莓",
                "warehouse_name": "精准学乾盛萧山云仓",
                "qty": Decimal("10"),
            },
            {
                "biz_date": date(2026, 3, 11),
                "material_code": "M-001",
                "material_name": "蓝莓",
                "warehouse_name": "精准学乾盛萧山云仓",
                "qty": Decimal("-2"),
            },
            {
                "biz_date": date(2026, 3, 11),
                "material_code": "M-001",
                "material_name": "蓝莓",
                "warehouse_name": "精准学余杭速豪盒马云仓",
                "qty": Decimal("6"),
            },
            {
                "biz_date": date(2026, 3, 11),
                "material_code": "M-001",
                "material_name": "蓝莓",
                "warehouse_name": "精准学余杭速豪盒马云仓",
                "qty": Decimal("-1"),
            },
            {
                "biz_date": date(2026, 3, 11),
                "material_code": "M-001",
                "material_name": "蓝莓",
                "warehouse_name": "精准学销退仓",
                "qty": Decimal("-3"),
            },
        ]

        result = build_sales_cleaning_rows(
            raw_rows,
            attendance_by_date={date(2026, 3, 11): Decimal("2")},
        )

        self.assertEqual(len(result), 1)
        row = result[0]
        self.assertEqual(row["biz_date"], date(2026, 3, 11))
        self.assertEqual(row["material_code"], "M-001")
        self.assertEqual(row["sales_out_xiaoshan"], Decimal("10"))
        self.assertEqual(row["sales_out_yuhang"], Decimal("6"))
        self.assertEqual(row["transit_intercept_xiaoshan"], Decimal("2"))
        self.assertEqual(row["transit_intercept_yuhang"], Decimal("1"))
        self.assertEqual(row["sales_return_warehouse"], Decimal("3"))
        self.assertEqual(row["return_unpack_attendance"], Decimal("2"))
        self.assertEqual(row["return_unpack_efficiency"], Decimal("1.5"))
        self.assertEqual(row["total_return_qty"], Decimal("6"))
        self.assertEqual(row["total_sales_qty"], Decimal("16"))

    def test_build_inventory_cleaning_rows_filters_and_aggregates_expected_dimensions(self) -> None:
        raw_rows = [
            {
                "snapshot_date": date(2026, 3, 13),
                "warehouse_name": "精准学良品仓",
                "material_code": "M-001",
                "material_name": "整机A",
                "stock_status_id": "2180202022719455294",
                "current_qty": Decimal("10"),
            },
            {
                "snapshot_date": date(2026, 3, 13),
                "warehouse_name": "精准学良品仓",
                "material_code": "M-001",
                "material_name": "整机A",
                "stock_status_id": "2180202022719455294",
                "current_qty": Decimal("5"),
            },
            {
                "snapshot_date": date(2026, 3, 13),
                "warehouse_name": "精准学良品仓",
                "material_code": "M-001",
                "material_name": "整机A",
                "stock_status_id": "0",
                "current_qty": Decimal("8"),
            },
            {
                "snapshot_date": date(2026, 3, 13),
                "warehouse_name": "行政资产仓",
                "material_code": "M-001",
                "material_name": "整机A",
                "stock_status_id": "2180202022719455294",
                "current_qty": Decimal("7"),
            },
            {
                "snapshot_date": date(2026, 3, 13),
                "warehouse_name": "精准学销退仓",
                "material_code": "M-002",
                "material_name": "整机B",
                "stock_status_id": "2180202022719455297",
                "current_qty": Decimal("0"),
            },
        ]

        result = build_inventory_cleaning_rows(
            raw_rows,
            warehouse_map={
                "精准学良品仓": "良品仓",
                "精准学销退仓": "销退仓",
            },
            status_map={
                "2180202022719455294": "采购良品",
                "2180202022719455297": "不良品",
            },
        )

        self.assertEqual(len(result), 1)
        row = result[0]
        self.assertEqual(row["snapshot_date"], date(2026, 3, 13))
        self.assertEqual(row["warehouse_name_clean"], "良品仓")
        self.assertEqual(row["material_code"], "M-001")
        self.assertEqual(row["material_name"], "整机A")
        self.assertEqual(row["stock_status_name"], "采购良品")
        self.assertEqual(row["qty"], Decimal("15"))
        self.assertEqual(row["source_row_count"], 2)

    def test_quote_mysql_url_handles_at_symbol_in_password(self) -> None:
        raw_url = "mysql+pymysql://finvis_etl:LocalDb@Pass!@127.0.0.1:3306/bi_center?charset=utf8mb4"
        quoted = quote_mysql_url(raw_url)
        self.assertEqual(
            quoted,
            "mysql+pymysql://finvis_etl:LocalDb%40Pass%21@127.0.0.1:3306/bi_center?charset=utf8mb4",
        )


if __name__ == "__main__":
    unittest.main()
