"""
Tests for DuplicateDetectionService.
Tests: roll number duplicates, institute/personal email duplicates, mobile duplicates, resolution actions.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.duplicate_detection_service import DuplicateDetectionService


def make_student(**kwargs):
    defaults = {
        "_id": "stu1", "id": "stu1",
        "roll_number": "CS001",
        "emails": {"institute": "cs001@college.edu", "personal": "cs001@gmail.com"},
        "mobile": "9876543210",
        "institution_id": "inst1",
        "name": "Test Student",
        "status": "verified",
    }
    defaults.update(kwargs)
    return defaults


def make_pending(**kwargs):
    defaults = {
        "_id": "pend1", "id": "pend1",
        "roll_number": "CS002",
        "institute_email": "cs002@college.edu",
        "personal_email": "cs002@gmail.com",
        "mobile": "9000000000",
        "institution_id": "inst1",
        "name": "Pending Student",
    }
    defaults.update(kwargs)
    return defaults


@pytest.mark.anyio
async def test_no_duplicates_returns_unique():
    """No existing records → status should be UNIQUE."""
    svc = DuplicateDetectionService(db=None)
    students_coll = AsyncMock()
    pending_coll = AsyncMock()

    students_coll.find.return_value.to_list = AsyncMock(return_value=[])
    pending_coll.find.return_value.to_list = AsyncMock(return_value=[])

    candidate = make_pending()
    result = await svc.check_candidate(candidate, students_coll, pending_coll)
    assert result["status"] == "UNIQUE"
    assert result["matches"] == []


@pytest.mark.anyio
async def test_roll_number_duplicate_detected():
    """Same roll number → POSSIBLE_DUPLICATE detected."""
    svc = DuplicateDetectionService(db=None)
    students_coll = AsyncMock()
    pending_coll = AsyncMock()

    existing = make_student(roll_number="CS001")
    students_coll.find.return_value.to_list = AsyncMock(return_value=[existing])
    pending_coll.find.return_value.to_list = AsyncMock(return_value=[])

    candidate = make_pending(roll_number="CS001")
    result = await svc.check_candidate(candidate, students_coll, pending_coll)
    assert result["status"] in ("POSSIBLE_DUPLICATE", "DUPLICATE_CONFIRMED")
    matched_fields = [m.get("field") for m in result.get("matches", [])]
    assert "roll_number" in matched_fields or result["status"] != "UNIQUE"


@pytest.mark.anyio
async def test_institute_email_duplicate_detected():
    """Same institute email → duplicate detected."""
    svc = DuplicateDetectionService(db=None)
    students_coll = AsyncMock()
    pending_coll = AsyncMock()

    existing = make_student(emails={"institute": "same@college.edu", "personal": "other@gmail.com"})
    students_coll.find.return_value.to_list = AsyncMock(return_value=[existing])
    pending_coll.find.return_value.to_list = AsyncMock(return_value=[])

    candidate = make_pending(institute_email="same@college.edu", roll_number="CS999")
    result = await svc.check_candidate(candidate, students_coll, pending_coll)
    assert result["status"] != "UNIQUE"


@pytest.mark.anyio
async def test_mobile_duplicate_detected():
    """Same mobile number → duplicate detected."""
    svc = DuplicateDetectionService(db=None)
    students_coll = AsyncMock()
    pending_coll = AsyncMock()

    existing = make_student(mobile="9111111111")
    students_coll.find.return_value.to_list = AsyncMock(return_value=[existing])
    pending_coll.find.return_value.to_list = AsyncMock(return_value=[])

    candidate = make_pending(mobile="9111111111", roll_number="CS999")
    result = await svc.check_candidate(candidate, students_coll, pending_coll)
    assert result["status"] != "UNIQUE"


@pytest.mark.anyio
async def test_resolution_confirm_duplicate():
    """CONFIRM_DUPLICATE action returns expected resolution payload."""
    svc = DuplicateDetectionService(db=None)
    resolution = svc.build_resolution("dup123", "CONFIRM_DUPLICATE", actor_id="tpo1")
    assert resolution["action"] == "CONFIRM_DUPLICATE"
    assert resolution["duplicate_id"] == "dup123"
    assert "resolved_by" in resolution
    assert resolution["resolved_by"] == "tpo1"


@pytest.mark.anyio
async def test_resolution_keep_existing():
    """KEEP_EXISTING action marks the duplicate as resolved without merging."""
    svc = DuplicateDetectionService(db=None)
    resolution = svc.build_resolution("dup456", "KEEP_EXISTING", actor_id="faculty1")
    assert resolution["action"] == "KEEP_EXISTING"


@pytest.mark.anyio
async def test_personal_email_duplicate():
    """Same personal email across students → duplicate."""
    svc = DuplicateDetectionService(db=None)
    students_coll = AsyncMock()
    pending_coll = AsyncMock()

    existing = make_student(emails={"institute": "stu1@college.edu", "personal": "shared@gmail.com"})
    students_coll.find.return_value.to_list = AsyncMock(return_value=[existing])
    pending_coll.find.return_value.to_list = AsyncMock(return_value=[])

    candidate = make_pending(personal_email="shared@gmail.com", roll_number="CS888")
    result = await svc.check_candidate(candidate, students_coll, pending_coll)
    assert result["status"] != "UNIQUE"
