import pytest
from datetime import datetime, timezone
from app.routes.tpo import SelectStudentsForDrivePayload

def test_select_students_payload():
    payload = SelectStudentsForDrivePayload(student_ids=["student_1", "student_2"])
    assert payload.student_ids == ["student_1", "student_2"]
    assert payload.status == "Selected"

    payload2 = SelectStudentsForDrivePayload(student_ids=["s3"], status="Shortlisted")
    assert payload2.status == "Shortlisted"
