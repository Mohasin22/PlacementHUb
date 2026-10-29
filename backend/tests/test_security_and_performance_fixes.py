import pytest
from fastapi import HTTPException
from app.db.utils import sanitize_student_record, sanitize_user_record
from app.db.init_indexes import initialize_database_indexes
from app.db.connection import db, connect_to_mongo
from app.routes.student import sanitize_student_record as student_sanitize, submit_academic_correction_request, CorrectionRequestPayload
from app.routes.auth import get_otp_debug, verify_otp
from app.models.schemas import OTPVerify
from app.routes.resume import is_safe_external_url
from starlette.requests import Request
import os

@pytest.mark.anyio
async def test_sanitize_student_record():
    doc = {
        "_id": "60c72b2f9b1d8b2bad000001",
        "student_id": "21CS001",
        "name": "Alice Doe",
        "password_hash": "$2b$12$securehashvaluehere",
        "password_plain": "PlainSecret123!",
        "authentication": {
            "account_status": "ACTIVE",
            "password_hash": "$2b$12$securehashvaluehere",
            "password_plain": "PlainSecret123!"
        }
    }
    sanitized = sanitize_student_record(doc)
    assert "password_hash" not in sanitized
    assert "password_plain" not in sanitized
    assert "password_hash" not in sanitized["authentication"]
    assert "password_plain" not in sanitized["authentication"]
    assert sanitized["name"] == "Alice Doe"

@pytest.mark.anyio
async def test_sanitize_user_record():
    user = {
        "_id": "60c72b2f9b1d8b2bad000002",
        "email": "tpo@example.com",
        "password_hash": "hash_val",
        "password_plain": "plaintext"
    }
    sanitized = sanitize_user_record(user)
    assert "password_hash" not in sanitized
    assert "password_plain" not in sanitized
    assert sanitized["email"] == "tpo@example.com"

@pytest.mark.anyio
async def test_otp_debug_endpoint_disabled_by_default():
    # When DEBUG_MODE is not set, must raise 403
    os.environ["DEBUG_MODE"] = "false"
    with pytest.raises(HTTPException) as exc_info:
        await get_otp_debug(email="test@example.com")
    assert exc_info.value.status_code == 403
    assert "Debug endpoint disabled" in exc_info.value.detail

@pytest.mark.anyio
async def test_index_initialization_runs_cleanly():
    await connect_to_mongo()
    # Ensure initialize_database_indexes executes without crashing
    await initialize_database_indexes(db.db)

def test_ssrf_protection_rejects_internal_and_metadata_ips():
    assert is_safe_external_url("http://127.0.0.1:8000/secret") is False
    assert is_safe_external_url("http://localhost:8000/admin") is False
    assert is_safe_external_url("http://169.254.169.254/latest/meta-data/") is False
    assert is_safe_external_url("javascript:alert(1)") is False
    assert is_safe_external_url("file:///etc/passwd") is False

@pytest.mark.anyio
async def test_idor_blocked_on_correction_request():
    await connect_to_mongo()
    # Student A tries to submit correction for Student B
    current_user_a = {"user_id": "student_a_id", "email": "a@example.com", "role": "Student"}
    payload = CorrectionRequestPayload(field_name="cgpa", current_value="8.0", requested_value="9.5", reason="typo")
    with pytest.raises(HTTPException) as exc:
        await submit_academic_correction_request(
            student_id="student_b_id",
            payload=payload,
            current_user=current_user_a,
            institution_id="inst_1"
        )
    assert exc.value.status_code == 403
    assert "Access denied" in exc.value.detail
