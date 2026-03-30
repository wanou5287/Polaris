from __future__ import annotations

import io
import unittest

from openpyxl import Workbook
from starlette.datastructures import UploadFile

from app.routes.bi_dashboard import (
    parse_procurement_serial_preview,
    procurement_supply_document_modules,
    procurement_supply_material_lookup,
    procurement_supply_workflow_templates,
    summarize_procurement_supply_document_rows,
)


def build_xlsx_upload(rows: list[list[object]], filename: str = "serials.xlsx") -> UploadFile:
    workbook = Workbook()
    worksheet = workbook.active
    for row in rows:
        worksheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return UploadFile(filename=filename, file=buffer)


def build_csv_upload(text: str, filename: str = "serials.csv") -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(text.encode("utf-8")))


class ProcurementSupplyConsoleTests(unittest.TestCase):
    def test_material_profiles_cover_serial_and_non_serial_cases(self) -> None:
        lookup = procurement_supply_material_lookup()
        self.assertTrue(lookup["yscs061601"]["serial_managed"])
        self.assertFalse(lookup["003000013"]["serial_managed"])

    def test_workflow_templates_cover_multiple_lifecycle_statuses(self) -> None:
        templates = procurement_supply_workflow_templates()

        status_set = {item["status"] for item in templates}

        self.assertIn("published", status_set)
        self.assertIn("unpublished", status_set)
        self.assertIn("draft", status_set)
        self.assertIn("disabled", status_set)
        self.assertTrue(all(item["workflow_code"].startswith("WF-") for item in templates))
        self.assertTrue(all(item["bom_code"].startswith("BOM") for item in templates))

    def test_document_modules_include_new_procurement_entries(self) -> None:
        modules = procurement_supply_document_modules()
        module_lookup = {item["key"]: item for item in modules}

        self.assertIn("purchase_return", module_lookup)
        self.assertIn("purchase_invoice", module_lookup)
        self.assertIn("required_fields", module_lookup["purchase_return"])
        self.assertIn("required_fields", module_lookup["purchase_invoice"])

    def test_document_status_summary_is_counted_from_rows(self) -> None:
        summary = summarize_procurement_supply_document_rows(
            [
                {"status": "draft"},
                {"status": "pending"},
                {"status": "pending"},
                {"status": "completed"},
            ]
        )

        self.assertEqual(summary["draft"], 1)
        self.assertEqual(summary["pending"], 2)
        self.assertEqual(summary["approved"], 0)
        self.assertEqual(summary["completed"], 1)

    def test_parse_xlsx_serial_preview_reports_duplicates_and_missing_rows(self) -> None:
        upload = build_xlsx_upload(
            [
                ["序列号", "备注"],
                ["SN001", "ok"],
                ["SN002", "ok"],
                ["SN001", "dup"],
                ["", "missing"],
            ]
        )

        preview = parse_procurement_serial_preview(upload, upload.file.getvalue())

        self.assertEqual(preview["total_rows"], 3)
        self.assertEqual(preview["accepted_count"], 2)
        self.assertEqual(preview["duplicate_count"], 1)
        self.assertEqual(preview["missing_count"], 1)
        self.assertEqual(preview["duplicates"], ["SN001"])
        self.assertEqual(preview["missing_rows"], [5])

    def test_parse_csv_serial_preview_supports_sn_header(self) -> None:
        upload = build_csv_upload("SN,备注\nA100,first\nA101,second\n")

        preview = parse_procurement_serial_preview(upload, upload.file.getvalue())

        self.assertEqual(preview["accepted_count"], 2)
        self.assertEqual(preview["duplicate_count"], 0)
        self.assertEqual(preview["missing_count"], 0)
        self.assertEqual(preview["sample_serials"], ["A100", "A101"])


if __name__ == "__main__":
    unittest.main()
