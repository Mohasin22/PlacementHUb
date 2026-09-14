import asyncio
from datetime import datetime, timezone
from app.services.academic_timeline_service import (
    get_student_academic_status, parse_academic_year_start, get_ordinal_label
)
from app.services.eligibility_engine import evaluate_student_eligibility

def test_academic_year_start_parsing():
    assert parse_academic_year_start("2026-27") == 2026
    assert parse_academic_year_start("2025-2026") == 2025
    assert parse_academic_year_start("2024") == 2024

def test_ordinal_label():
    assert get_ordinal_label(1) == "1st"
    assert get_ordinal_label(2) == "2nd"
    assert get_ordinal_label(3) == "3rd"
    assert get_ordinal_label(4) == "4th"
    assert get_ordinal_label(7) == "7th"
    assert get_ordinal_label(8) == "8th"

def test_btech_4yr_timeline_derivation():
    student = {
        "admission_year": 2023,
        "expected_graduation_year": 2027,
        "academic_identity": {
            "program_name": "B.Tech Computer Science",
            "admission_year": 2023,
            "expected_graduation_year": 2027
        }
    }
    # In August 2026 (Odd Semester of Academic Year 2026-27)
    test_date_odd = datetime(2026, 8, 15, tzinfo=timezone.utc)
    status_odd = asyncio.run(get_student_academic_status(student, current_date=test_date_odd))
    
    assert status_odd["current_study_year"] == 4
    assert status_odd["current_semester"] == 7
    assert status_odd["study_year_label"] == "4th Year"
    assert status_odd["semester_label"] == "7th Semester"
    assert status_odd["batch_label"] == "2023-2027"

    # In February 2027 (Even Semester of Academic Year 2026-27)
    test_date_even = datetime(2027, 2, 15, tzinfo=timezone.utc)
    status_even = asyncio.run(get_student_academic_status(student, current_date=test_date_even))
    
    assert status_even["current_study_year"] == 4
    assert status_even["current_semester"] == 8
    assert status_even["study_year_label"] == "4th Year"
    assert status_even["semester_label"] == "8th Semester"

def test_mba_2yr_timeline_derivation():
    student = {
        "admission_year": 2025,
        "expected_graduation_year": 2027,
        "academic_identity": {
            "program_name": "MBA",
            "admission_year": 2025,
            "expected_graduation_year": 2027
        }
    }
    test_date = datetime(2026, 9, 10, tzinfo=timezone.utc)
    status = asyncio.run(get_student_academic_status(student, current_date=test_date))
    
    assert status["duration_years"] == 2
    assert status["total_semesters"] == 4
    assert status["current_study_year"] == 2
    assert status["current_semester"] == 3
    assert status["study_year_label"] == "2nd Year"
    assert status["semester_label"] == "3rd Semester"

def test_mca_3yr_timeline_derivation():
    student = {
        "admission_year": 2024,
        "expected_graduation_year": 2027,
        "academic_identity": {
            "program_name": "MCA",
            "admission_year": 2024,
            "expected_graduation_year": 2027
        }
    }
    test_date = datetime(2026, 10, 1, tzinfo=timezone.utc)
    status = asyncio.run(get_student_academic_status(student, current_date=test_date))
    
    assert status["current_study_year"] == 3
    assert status["current_semester"] == 5

def test_administrative_override():
    student = {
        "admission_year": 2023,
        "expected_graduation_year": 2027,
        "academic_identity": {
            "program_name": "B.Tech",
            "admission_year": 2023,
            "expected_graduation_year": 2027,
            "academic_status_override": {
                "is_active": True,
                "study_year": 3,
                "semester": 5,
                "reason": "Year gap medical leave",
                "approved_by": "dean@institution.edu"
            }
        }
    }
    test_date = datetime(2026, 10, 1, tzinfo=timezone.utc)
    status = asyncio.run(get_student_academic_status(student, current_date=test_date))
    
    assert status["is_overridden"] is True
    assert status["current_study_year"] == 3
    assert status["current_semester"] == 5
    assert status["override_reason"] == "Year gap medical leave"

def test_placement_eligibility_by_academic_batch():
    student = {
        "name": "Jane Doe",
        "cgpa": 8.5,
        "active_backlogs": 0,
        "batch_label": "2023-2027",
        "academic_identity": {
            "batch_label": "2023-2027",
            "current_study_year": 4,
            "current_semester": 7,
            "program_name": "B.Tech",
            "department_name": "CSE"
        }
    }

    # 1. Matching target batch
    drive_matching = {
        "target_batches": ["2023-2027"],
        "min_study_year": 4,
        "min_cgpa": 7.0
    }
    is_el, reasons = evaluate_student_eligibility(student, drive_matching)
    assert is_el is True
    assert len(reasons) == 0

    # 2. Non-matching target batch
    drive_other_batch = {
        "target_batches": ["2024-2028"],
        "min_study_year": 3,
        "min_cgpa": 7.0
    }
    is_el, reasons = evaluate_student_eligibility(student, drive_other_batch)
    assert is_el is False
    assert any("Academic Batch '2023-2027' is not targeted" in r for r in reasons)

    # 3. Target study year minimum failure
    drive_higher_study_year = {
        "min_study_year": 5,
        "min_cgpa": 7.0
    }
    is_el, reasons = evaluate_student_eligibility(student, drive_higher_study_year)
    assert is_el is False
    assert any("below required minimum" in r for r in reasons)
