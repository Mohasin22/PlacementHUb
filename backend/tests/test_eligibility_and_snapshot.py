import pytest
from app.services.eligibility_engine import evaluate_student_eligibility

def test_eligibility_evaluation_pass():
    student = {
        "academic_identity": {"graduation_year": 2027, "program_id": "prog-1", "department_id": "dept-cse"},
        "education": {
            "undergraduate": {"normalized_cgpa": 8.5},
            "secondary": {"normalized_percentage": 90.0},
            "higher_secondary_or_diploma": {"normalized_percentage": 88.0}
        },
        "eligibility_data": {
            "current_backlogs": 0,
            "education_gap": "No",
            "first_attempt_status": "Yes"
        },
        "identity": {"gender": "Male"}
    }

    drive = {
        "passout_year": 2027,
        "allowed_programs": ["prog-1"],
        "allowed_departments": ["dept-cse"],
        "min_cgpa": 7.5,
        "max_backlogs": 0,
        "education_gap_allowed": False,
        "first_attempt_required": True,
        "gender_filter": "All"
    }

    is_eligible, reasons = evaluate_student_eligibility(student, drive)
    assert is_eligible is True
    assert len(reasons) == 0

def test_eligibility_evaluation_cgpa_and_backlogs_failure():
    student = {
        "academic_identity": {"graduation_year": 2027, "program_id": "prog-1", "department_id": "dept-cse"},
        "education": {"undergraduate": {"normalized_cgpa": 6.8}},
        "eligibility_data": {"current_backlogs": 2, "education_gap": "Yes", "first_attempt_status": "No"},
        "identity": {"gender": "Male"}
    }

    drive = {
        "passout_year": 2027,
        "allowed_programs": ["prog-1"],
        "allowed_departments": ["dept-cse"],
        "min_cgpa": 7.5,
        "max_backlogs": 0,
        "education_gap_allowed": False,
        "first_attempt_required": True,
        "gender_filter": "All"
    }

    is_eligible, reasons = evaluate_student_eligibility(student, drive)
    assert is_eligible is False
    assert any("CGPA" in r for r in reasons)
    assert any("backlogs" in r for r in reasons)
    assert any("Education gap" in r for r in reasons)
    assert any("first attempt" in r for r in reasons)
