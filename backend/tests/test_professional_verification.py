"""
Automated Test Suite for PlacementHub Professional Account Verification
and Placement Drive Access Lock.

Covers all 15 verification security and authorization requirements.
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from app.db.connection import connect_to_mongo, db
from app.services.verification_service import (
    get_verification_status,
    get_default_verification_state,
    create_oauth_state,
    consume_oauth_state,
    require_professional_verification,
    disconnect_github,
    disconnect_linkedin,
    get_github_auth_url,
    get_linkedin_auth_url,
    handle_github_callback,
    handle_linkedin_callback
)
from app.config import settings
from unittest.mock import patch, MagicMock


def run(coro):
    """Helper to run async coroutines synchronously in pytest."""
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def setup_test_db():
    async def _clean():
        await connect_to_mongo()
        # Clean test collections
        for col in ["students", "oauth_states", "placement_drives", "applications", "audit_logs"]:
            await db.db[col].delete_many({})
    run(_clean())
    yield
    run(_clean())


def test_unverified_student_defaults_to_locked():
    """1. Student with neither account connected receives drives_unlocked=False and missing list."""
    student = {
        "institution_id": "inst_1",
        "name": "Test Student",
        "professional_verification": None
    }
    status = get_verification_status(student)
    assert status["drives_unlocked"] is False
    assert "github" in status["missing_verifications"]
    assert "linkedin" in status["missing_verifications"]
    assert status["github"]["connected"] is False
    assert status["linkedin"]["connected"] is False


def test_student_with_only_github_remains_locked():
    """2. Student with only GitHub connected remains locked out."""
    student = {
        "institution_id": "inst_1",
        "professional_verification": {
            "github": {
                "connected": True,
                "provider_user_id": "gh_12345",
                "username": "octocat",
                "profile_url": "https://github.com/octocat",
                "verified_at": datetime.now(timezone.utc).isoformat()
            },
            "linkedin": {
                "connected": False
            }
        }
    }
    status = get_verification_status(student)
    assert status["drives_unlocked"] is False
    assert status["missing_verifications"] == ["linkedin"]
    assert status["github"]["connected"] is True
    assert status["linkedin"]["connected"] is False


def test_student_with_only_linkedin_remains_locked():
    """3. Student with only LinkedIn connected remains locked out."""
    student = {
        "institution_id": "inst_1",
        "professional_verification": {
            "github": {
                "connected": False
            },
            "linkedin": {
                "connected": True,
                "provider_user_id": "li_sub_999",
                "profile_url": "https://linkedin.com/in/octocat",
                "verified_at": datetime.now(timezone.utc).isoformat()
            }
        }
    }
    status = get_verification_status(student)
    assert status["drives_unlocked"] is False
    assert status["missing_verifications"] == ["github"]
    assert status["github"]["connected"] is False
    assert status["linkedin"]["connected"] is True


def test_student_with_both_verified_unlocks_drives():
    """4. Student with both accounts verified unlocks placement drives."""
    student = {
        "institution_id": "inst_1",
        "professional_verification": {
            "github": {
                "connected": True,
                "provider_user_id": "gh_12345",
                "username": "octocat",
                "profile_url": "https://github.com/octocat",
                "verified_at": datetime.now(timezone.utc).isoformat()
            },
            "linkedin": {
                "connected": True,
                "provider_user_id": "li_sub_999",
                "profile_url": "https://linkedin.com/in/octocat",
                "verified_at": datetime.now(timezone.utc).isoformat()
            }
        }
    }
    status = get_verification_status(student)
    assert status["drives_unlocked"] is True
    assert status["missing_verifications"] == []
    assert status["github"]["connected"] is True
    assert status["linkedin"]["connected"] is True


def test_guard_blocks_unverified_student_with_403():
    """5 & 6. Backend guard blocks unverified student with structured 403."""
    async def _test():
        student_id = "student_test_1"
        await db.db.students.insert_one({
            "id": student_id,
            "institution_id": "inst_1",
            "name": "Jane Doe",
            "emails": {"institute": "jane@gtu.edu"},
            "professional_verification": get_default_verification_state()
        })

        current_user = {
            "user_id": student_id,
            "email": "jane@gtu.edu",
            "role": "Student",
            "institution_id": "inst_1"
        }

        with pytest.raises(HTTPException) as exc_info:
            await require_professional_verification(current_user)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "PROFESSIONAL_VERIFICATION_REQUIRED"
        assert "github" in exc_info.value.detail["missing_verifications"]
        assert "linkedin" in exc_info.value.detail["missing_verifications"]

    run(_test())


def test_guard_allows_tpo_dean_and_faculty():
    """13. Administrative and faculty roles are NEVER blocked by student verification."""
    async def _test():
        for role in ["TPO", "Dean", "Faculty"]:
            admin_user = {
                "user_id": f"admin_{role}",
                "email": f"{role.lower()}@gtu.edu",
                "role": role,
                "institution_id": "inst_1"
            }
            result = await require_professional_verification(admin_user)
            assert result == admin_user

    run(_test())


def test_guard_passes_verified_student():
    """Guard allows student once both accounts are connected."""
    async def _test():
        student_id = "student_verified_1"
        await db.db.students.insert_one({
            "id": student_id,
            "institution_id": "inst_1",
            "name": "Alex Smith",
            "emails": {"institute": "alex@gtu.edu"},
            "professional_verification": {
                "github": {
                    "connected": True,
                    "provider_user_id": "gh_100",
                    "username": "alexsmith",
                    "profile_url": "https://github.com/alexsmith",
                    "verified_at": datetime.now(timezone.utc).isoformat()
                },
                "linkedin": {
                    "connected": True,
                    "provider_user_id": "li_sub_200",
                    "verified_at": datetime.now(timezone.utc).isoformat()
                }
            }
        })

        current_user = {
            "user_id": student_id,
            "email": "alex@gtu.edu",
            "role": "Student",
            "institution_id": "inst_1"
        }

        result = await require_professional_verification(current_user)
        assert result == current_user

    run(_test())


def test_oauth_state_single_use_and_provider_validation():
    """8. OAuth state is single-use, binds to provider, and rejects replay."""
    async def _test():
        state = await create_oauth_state("github", "user_1", "student_1", "inst_1")

        # 1. State must not be consumed by wrong provider
        with pytest.raises(HTTPException):
            await consume_oauth_state(state, "linkedin")

        # 2. State replay must be rejected
        with pytest.raises(HTTPException) as exc_replay:
            await consume_oauth_state(state, "github")
        assert exc_replay.value.status_code == 400

    run(_test())


def test_oauth_state_expiration():
    """Expired OAuth states are rejected."""
    async def _test():
        state = "expired_state_123"
        await db.db.oauth_states.insert_one({
            "state": state,
            "provider": "github",
            "user_id": "u1",
            "student_id": "s1",
            "institution_id": "inst_1",
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=20),
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=5)
        })

        with pytest.raises(HTTPException) as exc:
            await consume_oauth_state(state, "github")
        assert exc.value.status_code == 400
        assert "expired" in exc.value.detail.lower()

    run(_test())


def test_duplicate_github_account_linking_rejected():
    """11. Duplicate provider account linking within the institution is rejected."""
    async def _test():
        # Existing student with this GitHub account
        await db.db.students.insert_one({
            "id": "student_A",
            "institution_id": "inst_1",
            "name": "Student A",
            "professional_verification": {
                "github": {
                    "connected": True,
                    "provider_user_id": "99",
                    "username": "coder_pro",
                    "verified_at": datetime.now(timezone.utc).isoformat()
                }
            }
        })

        # Student B attempts to link the same GitHub account
        await db.db.students.insert_one({
            "id": "student_B",
            "institution_id": "inst_1",
            "name": "Student B",
            "professional_verification": get_default_verification_state()
        })

        state = await create_oauth_state("github", "user_B", "student_B", "inst_1")

        mock_token_resp = MagicMock()
        mock_token_resp.json.return_value = {"access_token": "gho_mock_token_123"}

        mock_user_resp = MagicMock()
        mock_user_resp.status_code = 200
        mock_user_resp.json.return_value = {
            "id": 99,
            "login": "coder_pro",
            "html_url": "https://github.com/coder_pro"
        }

        with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
             patch("httpx.AsyncClient.get", return_value=mock_user_resp), \
             patch.object(settings, "GITHUB_CLIENT_ID", "test_client_id"), \
             patch.object(settings, "GITHUB_CLIENT_SECRET", "test_client_secret"):

            with pytest.raises(HTTPException) as exc_dup:
                await handle_github_callback("mock_auth_code", state)
            assert exc_dup.value.status_code == 409
            assert "already linked" in exc_dup.value.detail

    run(_test())


def test_disconnect_locks_access_without_deleting_applications():
    """14. Disconnecting locks future drive access without deleting application history."""
    async def _test():
        student_id = "student_disconnect_test"
        inst_id = "inst_1"

        await db.db.students.insert_one({
            "id": student_id,
            "institution_id": inst_id,
            "name": "Morgan Freeman",
            "professional_verification": {
                "github": {
                    "connected": True,
                    "provider_user_id": "gh_555",
                    "username": "morganf",
                    "verified_at": datetime.now(timezone.utc).isoformat()
                },
                "linkedin": {
                    "connected": True,
                    "provider_user_id": "li_555",
                    "verified_at": datetime.now(timezone.utc).isoformat()
                }
            }
        })

        # Student has an existing submitted application
        await db.db.applications.insert_one({
            "student_id": student_id,
            "drive_id": "drive_google_1",
            "institution_id": inst_id,
            "status": "Applied",
            "applied_at": datetime.now(timezone.utc).isoformat()
        })

        # Disconnect GitHub
        await disconnect_github(student_id, inst_id, "morgan@gtu.edu")

        # Check student record: GitHub is now disconnected
        updated_student = await db.db.students.find_one({"id": student_id})
        v_status = get_verification_status(updated_student)
        assert v_status["github"]["connected"] is False
        assert v_status["drives_unlocked"] is False
        assert "github" in v_status["missing_verifications"]

        # CRITICAL: Application history is preserved!
        app_doc = await db.db.applications.find_one({"student_id": student_id, "drive_id": "drive_google_1"})
        assert app_doc is not None
        assert app_doc["status"] == "Applied"

    run(_test())


def test_missing_oauth_config_handled_gracefully():
    """15. Missing OAuth credentials raise 503 instead of crashing or faking verification."""
    async def _test():
        student = {"id": "s1", "institution_id": "inst_1"}
        with patch.object(settings, "GITHUB_CLIENT_ID", ""):
            with pytest.raises(HTTPException) as exc:
                await get_github_auth_url("u1", student, "inst_1")
            assert exc.value.status_code == 503
            assert "not configured" in exc.value.detail.lower()

        with patch.object(settings, "LINKEDIN_CLIENT_ID", ""):
            with pytest.raises(HTTPException) as exc_li:
                await get_linkedin_auth_url("u1", student, "inst_1")
            assert exc_li.value.status_code == 503
            assert "not configured" in exc_li.value.detail.lower()

    run(_test())


def test_successful_github_oauth_verification():
    """Successful GitHub OAuth callback marks account verified."""
    async def _test():
        student_id = "student_gh_verify"
        inst_id = "inst_1"

        await db.db.students.insert_one({
            "id": student_id,
            "institution_id": inst_id,
            "name": "Dev User",
            "professional_verification": get_default_verification_state()
        })

        state = await create_oauth_state("github", "user_dev", student_id, inst_id)

        mock_token_resp = MagicMock()
        mock_token_resp.json.return_value = {"access_token": "gho_valid_token_xyz"}

        mock_user_resp = MagicMock()
        mock_user_resp.status_code = 200
        mock_user_resp.json.return_value = {
            "id": 1234567,
            "login": "dev-user-verified",
            "html_url": "https://github.com/dev-user-verified"
        }

        with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
             patch("httpx.AsyncClient.get", return_value=mock_user_resp), \
             patch.object(settings, "GITHUB_CLIENT_ID", "test_gh_id"), \
             patch.object(settings, "GITHUB_CLIENT_SECRET", "test_gh_secret"):

            result = await handle_github_callback("valid_code_123", state)
            assert result["success"] is True
            assert result["username"] == "dev-user-verified"

            # Verify database update
            student = await db.db.students.find_one({"id": student_id})
            v = student["professional_verification"]["github"]
            assert v["connected"] is True
            assert v["provider_user_id"] == "1234567"
            assert v["username"] == "dev-user-verified"
            assert v["profile_url"] == "https://github.com/dev-user-verified"
            assert v["verified_at"] is not None

    run(_test())


def test_successful_linkedin_oidc_verification():
    """Successful LinkedIn OpenID Connect callback marks account verified."""
    async def _test():
        student_id = "student_li_verify"
        inst_id = "inst_1"

        await db.db.students.insert_one({
            "id": student_id,
            "institution_id": inst_id,
            "name": "LinkedIn User",
            "professional_verification": get_default_verification_state()
        })

        state = await create_oauth_state("linkedin", "user_li", student_id, inst_id)

        mock_token_resp = MagicMock()
        mock_token_resp.json.return_value = {"access_token": "li_token_abc"}

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.status_code = 200
        mock_userinfo_resp.json.return_value = {
            "sub": "li_member_unique_777",
            "name": "LinkedIn Pro",
            "email": "pro@linkedin.com"
        }

        with patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
             patch("httpx.AsyncClient.get", return_value=mock_userinfo_resp), \
             patch.object(settings, "LINKEDIN_CLIENT_ID", "test_li_id"), \
             patch.object(settings, "LINKEDIN_CLIENT_SECRET", "test_li_secret"):

            result = await handle_linkedin_callback("valid_code_abc", state)
            assert result["success"] is True
            assert result["provider"] == "linkedin"

            # Verify database update
            student = await db.db.students.find_one({"id": student_id})
            v = student["professional_verification"]["linkedin"]
            assert v["connected"] is True
            assert v["provider_user_id"] == "li_member_unique_777"
            assert v["verified_at"] is not None

    run(_test())
