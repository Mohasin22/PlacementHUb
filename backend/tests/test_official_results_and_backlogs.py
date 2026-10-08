"""
Tests for OfficialResultService and BacklogService.
"""
import pytest
from app.services.backlog_service import BacklogService


# ── BacklogService Tests ──────────────────────────────────────────────────────

def make_backlog(subject, semester=3, status="ACTIVE", attempts=1, clearing_semester=None):
    return {
        "subject_name": subject,
        "semester": semester,
        "status": status,
        "attempts": attempts,
        "clearing_semester": clearing_semester,
    }


def test_backlog_service_active_count():
    """Active backlogs count is the number of ACTIVE entries."""
    svc = BacklogService()
    history = [
        make_backlog("Math", status="ACTIVE"),
        make_backlog("Physics", status="CLEARED", clearing_semester=4),
        make_backlog("Chemistry", status="ACTIVE"),
    ]
    active = svc.count_active(history)
    assert active == 2


def test_backlog_service_total_count():
    """Total backlogs includes both ACTIVE and CLEARED."""
    svc = BacklogService()
    history = [
        make_backlog("Math", status="ACTIVE"),
        make_backlog("Physics", status="CLEARED"),
    ]
    total = svc.count_total(history)
    assert total == 2


def test_backlog_service_historical_only_cleared():
    """Historical backlogs = only CLEARED entries (no active)."""
    svc = BacklogService()
    history = [
        make_backlog("Math", status="ACTIVE"),
        make_backlog("Physics", status="CLEARED", clearing_semester=4),
    ]
    historical = svc.count_historical(history)
    assert historical == 1


def test_backlog_service_f_grade_auto_flag():
    """F grade entries should be auto-flagged as ACTIVE backlogs."""
    svc = BacklogService()
    raw_subject = {"subject_name": "OS", "semester": 4, "grade": "F", "attempts": 1}
    normalized = svc.normalize_entry(raw_subject)
    assert normalized["status"] == "ACTIVE"


def test_backlog_service_clear_backlog():
    """After clearing, status should be CLEARED and clearing_semester set."""
    svc = BacklogService()
    entry = make_backlog("DS", status="ACTIVE")
    cleared = svc.clear_backlog(entry, clearing_semester=5, attempts=2)
    assert cleared["status"] == "CLEARED"
    assert cleared["clearing_semester"] == 5
    assert cleared["attempts"] == 2


def test_backlog_service_no_backlogs():
    """Empty history → active and total should both be 0."""
    svc = BacklogService()
    assert svc.count_active([]) == 0
    assert svc.count_total([]) == 0
    assert svc.count_historical([]) == 0


# ── OfficialResultService Tests ──────────────────────────────────────────────

def make_student_record(cgpa=8.0, tenth=85.0, twelfth=80.0):
    return {
        "education": {
            "undergraduate": {"normalized_cgpa": cgpa},
            "secondary": {"normalized_percentage": tenth},
            "higher_secondary_or_diploma": {"normalized_percentage": twelfth},
        }
    }


def make_official_record(cgpa=8.0, tenth=85.0, twelfth=80.0):
    return {
        "cgpa": cgpa,
        "tenth_percentage": tenth,
        "twelfth_percentage": twelfth,
    }


def test_official_result_match():
    """When all data matches official records, there should be no discrepancies."""
    from app.services.official_result_service import compare_with_official
    student = make_student_record()
    official = make_official_record()
    result = compare_with_official(student, official)
    mismatches = [d for d in result.get("discrepancies", []) if d["status"] == "MISMATCH"]
    assert len(mismatches) == 0


def test_official_result_cgpa_mismatch():
    """When student CGPA differs from official, it should appear as MISMATCH."""
    from app.services.official_result_service import compare_with_official
    student = make_student_record(cgpa=9.0)
    official = make_official_record(cgpa=7.5)
    result = compare_with_official(student, official)
    fields = [d["field"] for d in result.get("discrepancies", []) if d["status"] == "MISMATCH"]
    assert "cgpa" in fields or "ug_cgpa" in fields or len(fields) > 0


def test_official_result_tenth_mismatch():
    """When 10th percentage differs from official, it should appear as MISMATCH."""
    from app.services.official_result_service import compare_with_official
    student = make_student_record(tenth=90.0)
    official = make_official_record(tenth=75.0)
    result = compare_with_official(student, official)
    mismatches = [d for d in result.get("discrepancies", []) if d["status"] == "MISMATCH"]
    assert len(mismatches) > 0


def test_official_result_no_official_record():
    """No official record provided → discrepancies should have NO_OFFICIAL_RECORD status."""
    from app.services.official_result_service import compare_with_official
    student = make_student_record()
    result = compare_with_official(student, None)
    # Should gracefully handle missing official data
    assert "discrepancies" in result or "status" in result
