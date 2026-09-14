import pytest
from app.services.board_conversion_service import (
    DEFAULT_BOARD_RULES, apply_conversion_rule
)

def test_cbse_cgpa_conversion():
    cbse_rule = next(r for r in DEFAULT_BOARD_RULES if r["board"] == "CBSE")
    res = apply_conversion_rule(cbse_rule, "8.0", normalized_cgpa=8.0, normalized_percentage=None)
    assert res["normalized_percentage"] == 76.0  # 8.0 * 9.5
    assert res["verification_status"] == "VERIFIED"

def test_ap_ssc_gpa_conversion():
    ap_rule = next(r for r in DEFAULT_BOARD_RULES if "Andhra" in r["board"])
    res = apply_conversion_rule(ap_rule, "9.2", normalized_cgpa=9.2, normalized_percentage=None)
    assert res["normalized_percentage"] == 92.0  # 9.2 * 10
    assert res["verification_status"] == "VERIFIED"

def test_unsupported_board_conversion():
    res = apply_conversion_rule(None, "Unknown Score", normalized_cgpa=None, normalized_percentage=None)
    assert res["normalized_percentage"] is None
    assert res["verification_status"] == "REQUIRES_REVIEW"
