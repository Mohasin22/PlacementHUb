import pytest
from app.services.score_normalizer import normalize_academic_score, parse_words_to_number

def test_words_to_number():
    assert parse_words_to_number("Eight point two") == 8.2
    assert parse_words_to_number("Nine point five") == 9.5
    assert parse_words_to_number("Invalid string") is None

def test_normalize_percentage_variants():
    cases = ["95", "95%", "95 percentage", "95 percent", "95 %", "95.0%"]
    for c in cases:
        res = normalize_academic_score(c, expected_type="Percentage")
        assert res["normalized_percentage"] == 95.0
        assert res["score_type"] == "Percentage"
        assert res["verification_status"] == "VERIFIED"

def test_normalize_decimal_percentage():
    res = normalize_academic_score("0.71")
    assert res["normalized_percentage"] == 71.0
    assert res["score_type"] == "Percentage"
    assert res["verification_status"] == "VERIFIED"

    res2 = normalize_academic_score("0.95")
    assert res2["normalized_percentage"] == 95.0

def test_normalize_cgpa_variants():
    res1 = normalize_academic_score("8.7")
    assert res1["normalized_cgpa"] == 8.7
    assert res1["score_type"] == "CGPA"

    res2 = normalize_academic_score("8.7 CGPA")
    assert res2["normalized_cgpa"] == 8.7
    assert res2["score_type"] == "CGPA"

    res3 = normalize_academic_score("CGPA - 8.7")
    assert res3["normalized_cgpa"] == 8.7

def test_normalize_cgpa_with_coverage():
    res = normalize_academic_score("8.38(till II-II)")
    assert res["normalized_cgpa"] == 8.38
    assert res["coverage"] == "till II-II"
    assert res["verification_status"] == "VERIFIED"

def test_normalize_marks_fraction():
    res = normalize_academic_score("355/500")
    assert res["normalized_percentage"] == 71.0
    assert res["score_type"] == "Marks"
    assert res["verification_status"] == "VERIFIED"

    res2 = normalize_academic_score("8.20/10")
    assert res2["normalized_cgpa"] == 8.20
    assert res2["normalized_percentage"] == 82.0

def test_normalize_invalid_and_ambiguous():
    res_dont_know = normalize_academic_score("Don't know")
    assert res_dont_know["normalized_value"] is None
    assert res_dont_know["verification_status"] == "REQUIRES_REVIEW"

    res_no = normalize_academic_score("No")
    assert res_no["normalized_value"] is None
    assert res_no["verification_status"] == "REQUIRES_REVIEW"

    res_marks_only = normalize_academic_score("550")
    assert res_marks_only["normalized_percentage"] is None
    assert res_marks_only["verification_status"] == "REQUIRES_REVIEW"
