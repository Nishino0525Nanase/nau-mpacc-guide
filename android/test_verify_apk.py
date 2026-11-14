"""Exercise offline data validation without building or publishing an APK."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_apk", ROOT / "android/verify-apk.py")
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)
DATA = json.loads((ROOT / "dist/data/site-data.json").read_text())


class InternshipValidationTests(unittest.TestCase):
    def test_current_expanded_resources_remain_valid(self):
        VERIFY.verify_internships(DATA)

    def test_missing_firm_is_detected_against_declared_counts(self):
        data = deepcopy(DATA)
        data["internships"]["firms"].pop()
        with self.assertRaisesRegex(AssertionError, "firm count"):
            VERIFY.verify_internships(data)

    def test_duplicate_firm_id_is_rejected_without_changing_total(self):
        data = deepcopy(DATA)
        firms = data["internships"]["firms"]
        firms[-1]["id"] = firms[0]["id"]
        with self.assertRaisesRegex(AssertionError, "Duplicate internship firm"):
            VERIFY.verify_internships(data)

    def test_missing_resource_is_detected_against_declared_counts(self):
        data = deepcopy(DATA)
        data["internships"]["firms"][0]["resources"].pop()
        with self.assertRaisesRegex(AssertionError, "resource count"):
            VERIFY.verify_internships(data)

    def test_enterprises_cannot_be_mislabeled_as_domestic_firms(self):
        data = deepcopy(DATA)
        firms = data["internships"]["firms"]
        next(firm for firm in firms if firm["group"] == "enterprise")["group"] = "domestic"
        with self.assertRaisesRegex(AssertionError, "Domestic firm count"):
            VERIFY.verify_internships(data)

    def test_unknown_deadline_stays_null_instead_of_a_free_text_placeholder(self):
        data = deepcopy(DATA)
        data["internships"]["firms"][0]["resources"][0]["deadline"] = "待定"
        with self.assertRaisesRegex(AssertionError, "Unknown deadline"):
            VERIFY.verify_internships(data)

    def test_invalid_calendar_deadline_is_rejected(self):
        data = deepcopy(DATA)
        data["internships"]["firms"][0]["resources"][0]["deadline"] = "2026-02-30"
        with self.assertRaisesRegex(AssertionError, "Invalid internship deadline date"):
            VERIFY.verify_internships(data)


if __name__ == "__main__":
    unittest.main()
