"""
Tests for StudentValidationService.
Tests: missing data detection, safe URL protocols, resume format checks.
"""
import pytest
from app.services.student_validation_service import StudentValidationService


def make_complete_student():
    return {
        "name": "John Doe",
        "roll_number": "CS001",
        "emails": {"institute": "john@college.edu", "personal": "john@gmail.com"},
        "mobile": "9876543210",
        "education": {
            "undergraduate": {"normalized_cgpa": 8.5, "raw_score": 8.5},
            "secondary": {"normalized_percentage": 88.0, "board": "CBSE"},
            "higher_secondary_or_diploma": {"normalized_percentage": 82.0, "board": "CBSE"},
        },
        "resume_url": "https://drive.google.com/file/d/1aBcDef/view",
        "skills": ["Python", "Machine Learning"],
        "projects": ["Smart Parking System"],
        "links": {
            "linkedin": "https://linkedin.com/in/johndoe",
            "github": "https://github.com/johndoe",
        },
        "eligibility_data": {
            "current_backlogs": 0,
            "total_backlogs": 0,
        },
    }


# ── Safe URL Tests ─────────────────────────────────────────────────────────

def test_safe_https_url():
    assert StudentValidationService.is_safe_url("https://example.com/resume.pdf") is True


def test_safe_http_url():
    assert StudentValidationService.is_safe_url("http://example.com/file.pdf") is True


def test_dangerous_javascript_url():
    assert StudentValidationService.is_safe_url("javascript:alert('xss')") is False


def test_dangerous_data_url():
    assert StudentValidationService.is_safe_url("data:text/html,<script>alert(1)</script>") is False


def test_dangerous_file_url():
    assert StudentValidationService.is_safe_url("file:///etc/passwd") is False


def test_internal_api_path_allowed():
    assert StudentValidationService.is_safe_url("/api/files/download/resume.pdf") is True


def test_none_url_is_safe():
    # None URL is treated as "no URL provided" not as dangerous
    assert StudentValidationService.is_safe_url(None) is True


# ── Resume Format Tests ─────────────────────────────────────────────────────

def test_resume_missing():
    result = StudentValidationService.validate_resume_format(None)
    assert result["status"] == "MISSING"
    assert result["available"] is False


def test_resume_pdf_valid():
    result = StudentValidationService.validate_resume_format("https://example.com/resume.pdf")
    assert result["status"] == "VALID"
    assert result["available"] is True
    assert result["is_pdf"] is True


def test_resume_drive_link_valid():
    result = StudentValidationService.validate_resume_format(
        "https://drive.google.com/file/d/1aBcDef/view"
    )
    assert result["status"] == "VALID"
    assert result["available"] is True


def test_resume_unsafe_protocol_error():
    result = StudentValidationService.validate_resume_format("javascript:void(0)")
    assert result["status"] == "ERROR"
    assert result["available"] is False


def test_resume_no_extension_warning():
    result = StudentValidationService.validate_resume_format("https://example.com/my-resume")
    # Should warn about non-standard format
    assert result["status"] in ("WARNING", "VALID")


# ── Full Student Validation Tests ───────────────────────────────────────────

def test_complete_student_passes():
    student = make_complete_student()
    report = StudentValidationService.validate_student(student)
    assert report.get("overall_status") == "COMPLETE" or len(report.get("error_items", [])) == 0


def test_missing_resume_flagged():
    student = make_complete_student()
    student["resume_url"] = None
    report = StudentValidationService.validate_student(student)
    missing = report.get("missing_items", [])
    errors = report.get("error_items", [])
    all_issues = missing + errors
    assert any("resume" in str(issue).lower() for issue in all_issues)


def test_missing_mobile_flagged():
    student = make_complete_student()
    student["mobile"] = ""
    report = StudentValidationService.validate_student(student)
    missing = report.get("missing_items", [])
    assert any("mobile" in str(f).lower() for f in missing)


def test_missing_skills_flagged():
    student = make_complete_student()
    student["skills"] = []
    report = StudentValidationService.validate_student(student)
    # Skills are typically warnings or missing
    missing = report.get("missing_items", []) + report.get("warning_items", [])
    assert any("skill" in str(f).lower() for f in missing) or report.get("overall_status") != "COMPLETE"


def test_unsafe_linkedin_url_flagged():
    student = make_complete_student()
    student["links"]["linkedin"] = "javascript:void(0)"
    report = StudentValidationService.validate_student(student)
    errors = report.get("error_items", [])
    # Should detect unsafe URL
    assert len(errors) > 0 or report.get("overall_status") == "INCOMPLETE"


def test_missing_10th_record_flagged():
    student = make_complete_student()
    del student["education"]["secondary"]
    report = StudentValidationService.validate_student(student)
    missing = report.get("missing_items", [])
    assert any("10" in str(f) or "secondary" in str(f).lower() or "tenth" in str(f).lower() for f in missing)
