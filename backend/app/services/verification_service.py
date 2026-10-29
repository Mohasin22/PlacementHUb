"""
Professional Account Verification Service for PlacementHub.
Implements OAuth 2.0 verification for GitHub & LinkedIn (OIDC)
and enforces Placement Drive access locks until both accounts are verified.
"""

import os
import secrets
import logging
import httpx
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException, status, Depends
from app.config import settings
from app.db.connection import db
from app.db.utils import id_query
from app.db.tenant import get_current_user
from app.services.audit import log_audit_event

logger = logging.getLogger("app.services.verification")


def get_default_verification_state() -> Dict[str, Any]:
    return {
        "github": {
            "connected": False,
            "provider_user_id": None,
            "username": None,
            "profile_url": None,
            "verified_at": None,
        },
        "linkedin": {
            "connected": False,
            "provider_user_id": None,
            "profile_url": None,
            "verified_at": None,
        },
    }


async def get_student_for_user(user_id: str, email: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Robustly resolves student record by user_id (ObjectId, string ID, or user account reference).
    """
    if not user_id:
        return None

    # 1. Direct match on students collection
    student = await db.db.students.find_one(id_query(user_id))
    if student:
        return student

    # 2. Check if user_id points to a record in users collection
    user_doc = await db.db.users.find_one(id_query(user_id))
    if user_doc:
        uid = user_doc.get("id")
        uemail = user_doc.get("email")
        query_parts = []
        if uid:
            query_parts.append({"user_id": uid})
        if uemail:
            query_parts.extend([
                {"emails.institute": uemail},
                {"emails.personal": uemail},
                {"contact.institutional_email": uemail},
                {"contact.personal_email": uemail},
                {"institute_email": uemail},
                {"personal_email": uemail},
            ])
        if query_parts:
            student = await db.db.students.find_one({"$or": query_parts})
            if student:
                return student

    # 3. Fallback to email match
    if email:
        clean_email = email.strip().lower()
        student = await db.db.students.find_one({
            "$or": [
                {"emails.institute": clean_email},
                {"emails.personal": clean_email},
                {"contact.institutional_email": clean_email},
                {"contact.personal_email": clean_email},
                {"institute_email": clean_email},
                {"personal_email": clean_email},
            ]
        })
        if student:
            return student

    return None


def get_verification_status(student: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates professional verification status. Missing or incomplete
    records default securely to unverified.
    """
    if not student:
        default_state = get_default_verification_state()
        return {
            "github": default_state["github"],
            "linkedin": default_state["linkedin"],
            "drives_unlocked": False,
            "missing_verifications": ["github", "linkedin"],
        }

    raw = student.get("professional_verification") or {}
    github_raw = raw.get("github") or {}
    linkedin_raw = raw.get("linkedin") or {}

    github_connected = bool(github_raw.get("connected") and github_raw.get("provider_user_id"))
    linkedin_connected = bool(linkedin_raw.get("connected") and linkedin_raw.get("provider_user_id"))

    missing: List[str] = []
    if not github_connected:
        missing.append("github")
    if not linkedin_connected:
        missing.append("linkedin")

    drives_unlocked = (github_connected and linkedin_connected)

    return {
        "github": {
            "connected": github_connected,
            "provider_user_id": github_raw.get("provider_user_id") if github_connected else None,
            "username": github_raw.get("username") if github_connected else None,
            "profile_url": github_raw.get("profile_url") if github_connected else None,
            "verified_at": github_raw.get("verified_at") if github_connected else None,
        },
        "linkedin": {
            "connected": linkedin_connected,
            "provider_user_id": linkedin_raw.get("provider_user_id") if linkedin_connected else None,
            "profile_url": linkedin_raw.get("profile_url") if linkedin_connected else (
                student.get("links", {}).get("linkedin") or student.get("portfolio_links", {}).get("linkedin")
            ),
            "verified_at": linkedin_raw.get("verified_at") if linkedin_connected else None,
        },
        "drives_unlocked": drives_unlocked,
        "missing_verifications": missing,
        "config": {
            "github_configured": bool(settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET),
            "linkedin_configured": bool(settings.LINKEDIN_CLIENT_ID and settings.LINKEDIN_CLIENT_SECRET),
        }
    }


async def create_oauth_state(provider: str, user_id: str, student_id: str, institution_id: str) -> str:
    """
    Generates a secure, cryptographically random, single-use OAuth state.
    Binds the state to the initiating user and institution.
    """
    state = secrets.token_urlsafe(32)
    state_doc = {
        "state": state,
        "provider": provider,
        "user_id": user_id,
        "student_id": student_id,
        "institution_id": institution_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    await db.db.oauth_states.insert_one(state_doc)
    return state


async def consume_oauth_state(state: str, expected_provider: str) -> Dict[str, Any]:
    """
    Validates and atomically consumes a single-use OAuth state.
    """
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter."
        )

    state_doc = await db.db.oauth_states.find_one_and_delete({"state": state})
    if not state_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state. Please restart verification."
        )

    # Check expiration
    now = datetime.now(timezone.utc)
    expires_at = state_doc.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth state expired. Please restart verification."
        )

    if state_doc.get("provider") != expected_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth state provider mismatch. Expected '{expected_provider}'."
        )

    return state_doc


# ─────────────────────────────────────────────────────────────────────────────
# GITHUB OAUTH IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────────────────

async def get_github_auth_url(user_id: str, student: Dict[str, Any], institution_id: str) -> str:
    """
    Builds the GitHub OAuth 2.0 authorization URL.
    """
    client_id = settings.GITHUB_CLIENT_ID
    if not client_id or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured on this server. Please contact your administrator."
        )

    student_id = str(student.get("_id", student.get("id")))
    state = await create_oauth_state("github", user_id, student_id, institution_id)
    redirect_uri = settings.GITHUB_REDIRECT_URI

    return (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=read:user%20user:email"
        f"&state={state}"
    )


async def handle_github_callback(code: str, state: str) -> Dict[str, Any]:
    """
    Exchanges code for GitHub access token, fetches profile, and links student account.
    """
    state_doc = await consume_oauth_state(state, "github")
    student_id = state_doc["student_id"]
    institution_id = state_doc["institution_id"]

    client_id = settings.GITHUB_CLIENT_ID
    client_secret = settings.GITHUB_CLIENT_SECRET
    redirect_uri = settings.GITHUB_REDIRECT_URI

    # Exchange authorization code for token
    token_url = "https://github.com/login/oauth/access_token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    headers = {"Accept": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            token_resp = await client.post(token_url, json=payload, headers=headers)
            token_data = token_resp.json()
        except Exception as e:
            logger.error(f"GitHub token exchange network error: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to communicate with GitHub token endpoint."
            )

    if "error" in token_data or "access_token" not in token_data:
        err_msg = token_data.get("error_description", token_data.get("error", "Failed to obtain access token"))
        logger.warning(f"GitHub OAuth error response: {token_data}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub authorization failed: {err_msg}"
        )

    access_token = token_data["access_token"]

    # Fetch authenticated GitHub user details
    user_url = "https://api.github.com/user"
    user_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "PlacementHub-Verification-App"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            user_resp = await client.get(user_url, headers=user_headers)
            if user_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"GitHub API returned error: {user_resp.status_code}"
                )
            user_data = user_resp.json()
        except Exception as e:
            logger.error(f"GitHub user identity retrieval error: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to retrieve authenticated GitHub profile."
            )

    provider_user_id = str(user_data.get("id"))
    username = user_data.get("login")
    profile_url = user_data.get("html_url")

    if not provider_user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Incomplete identity data returned from GitHub."
        )

    # Multi-tenant Duplicate Guard:
    # Ensure this GitHub account is not already linked to another student in the same institution
    student = await get_student_for_user(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    curr_student_oid = student.get("_id")
    dup_filter = {
        "institution_id": institution_id,
        "professional_verification.github.connected": True,
        "professional_verification.github.provider_user_id": provider_user_id,
    }
    if curr_student_oid:
        dup_filter["_id"] = {"$ne": curr_student_oid}

    duplicate = await db.db.students.find_one(dup_filter)
    if duplicate:
        await log_audit_event(
            action="duplicate_account_link_attempt",
            actor=state_doc["user_id"],
            actor_role="Student",
            entity_type="Student",
            entity_id=student_id,
            institution_id=institution_id,
            details={"provider": "github", "provider_user_id": provider_user_id, "username": username}
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The GitHub account '@{username}' is already linked to another student in this institution."
        )

    # Atomically save verified GitHub association
    now_iso = datetime.now(timezone.utc).isoformat()
    update_doc = {
        "professional_verification.github": {
            "connected": True,
            "provider_user_id": provider_user_id,
            "username": username,
            "profile_url": profile_url,
            "verified_at": now_iso,
        },
        "links.github": profile_url,
        "portfolio_links.github": profile_url,
        "updated_at": now_iso
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})

    await log_audit_event(
        action="github_connected",
        actor=state_doc["user_id"],
        actor_role="Student",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"username": username, "provider_user_id": provider_user_id}
    )

    return {
        "success": True,
        "provider": "github",
        "username": username,
        "profile_url": profile_url,
        "verified_at": now_iso
    }


async def disconnect_github(student_id: str, institution_id: str, actor_id: str) -> Dict[str, Any]:
    """
    Disconnects the verified GitHub account from the student profile.
    """
    student = await get_student_for_user(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    update_doc = {
        "professional_verification.github": {
            "connected": False,
            "provider_user_id": None,
            "username": None,
            "profile_url": None,
            "verified_at": None,
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})

    await log_audit_event(
        action="github_disconnected",
        actor=actor_id,
        actor_role="Student",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"provider": "github"}
    )

    return {"message": "GitHub account successfully disconnected."}


# ─────────────────────────────────────────────────────────────────────────────
# LINKEDIN OAUTH (OpenID Connect) IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────────────────

async def get_linkedin_auth_url(user_id: str, student: Dict[str, Any], institution_id: str) -> str:
    """
    Builds the LinkedIn OAuth 2.0 / OpenID Connect authorization URL.
    """
    client_id = settings.LINKEDIN_CLIENT_ID
    if not client_id or not settings.LINKEDIN_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LinkedIn OAuth is not configured on this server. Please contact your administrator."
        )

    student_id = str(student.get("_id", student.get("id")))
    state = await create_oauth_state("linkedin", user_id, student_id, institution_id)
    redirect_uri = settings.LINKEDIN_REDIRECT_URI

    return (
        f"https://www.linkedin.com/oauth/v2/authorization"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=openid%20profile%20email"
        f"&state={state}"
    )


async def handle_linkedin_callback(code: str, state: str) -> Dict[str, Any]:
    """
    Exchanges code for LinkedIn access token, fetches member identity via OIDC userinfo,
    and links student account.
    """
    state_doc = await consume_oauth_state(state, "linkedin")
    student_id = state_doc["student_id"]
    institution_id = state_doc["institution_id"]

    client_id = settings.LINKEDIN_CLIENT_ID
    client_secret = settings.LINKEDIN_CLIENT_SECRET
    redirect_uri = settings.LINKEDIN_REDIRECT_URI

    token_url = "https://www.linkedin.com/oauth/v2/accessToken"
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            token_resp = await client.post(token_url, data=payload, headers=headers)
            token_data = token_resp.json()
        except Exception as e:
            logger.error(f"LinkedIn token exchange network error: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to communicate with LinkedIn token endpoint."
            )

    if "error" in token_data or "access_token" not in token_data:
        err_msg = token_data.get("error_description", token_data.get("error", "Failed to obtain access token"))
        logger.warning(f"LinkedIn OAuth error: {token_data}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"LinkedIn authorization failed: {err_msg}"
        )

    access_token = token_data["access_token"]

    # Fetch authenticated user profile using OpenID Connect userinfo endpoint
    userinfo_url = "https://api.linkedin.com/v2/userinfo"
    userinfo_headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            user_resp = await client.get(userinfo_url, headers=userinfo_headers)
            if user_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"LinkedIn API returned error: {user_resp.status_code}"
                )
            user_data = user_resp.json()
        except Exception as e:
            logger.error(f"LinkedIn userinfo retrieval error: {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to retrieve authenticated LinkedIn profile."
            )

    provider_user_id = str(user_data.get("sub"))
    if not provider_user_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Incomplete identity data returned from LinkedIn (missing 'sub')."
        )

    student = await get_student_for_user(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    # Duplicate Guard: Ensure this LinkedIn account is not already linked to another student
    curr_student_oid = student.get("_id")
    dup_filter = {
        "institution_id": institution_id,
        "professional_verification.linkedin.connected": True,
        "professional_verification.linkedin.provider_user_id": provider_user_id,
    }
    if curr_student_oid:
        dup_filter["_id"] = {"$ne": curr_student_oid}

    duplicate = await db.db.students.find_one(dup_filter)
    if duplicate:
        await log_audit_event(
            action="duplicate_account_link_attempt",
            actor=state_doc["user_id"],
            actor_role="Student",
            entity_type="Student",
            entity_id=student_id,
            institution_id=institution_id,
            details={"provider": "linkedin", "provider_user_id": provider_user_id}
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This LinkedIn account is already linked to another student in your institution."
        )

    existing_url = (
        student.get("professional_verification", {}).get("linkedin", {}).get("profile_url")
        or student.get("links", {}).get("linkedin")
        or student.get("portfolio_links", {}).get("linkedin")
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    update_doc = {
        "professional_verification.linkedin": {
            "connected": True,
            "provider_user_id": provider_user_id,
            "profile_url": existing_url,
            "verified_at": now_iso,
        },
        "updated_at": now_iso
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})

    await log_audit_event(
        action="linkedin_connected",
        actor=state_doc["user_id"],
        actor_role="Student",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"provider_user_id": provider_user_id}
    )

    return {
        "success": True,
        "provider": "linkedin",
        "provider_user_id": provider_user_id,
        "profile_url": existing_url,
        "verified_at": now_iso
    }


async def disconnect_linkedin(student_id: str, institution_id: str, actor_id: str) -> Dict[str, Any]:
    """
    Disconnects the verified LinkedIn account from the student profile.
    """
    student = await get_student_for_user(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    update_doc = {
        "professional_verification.linkedin": {
            "connected": False,
            "provider_user_id": None,
            "profile_url": None,
            "verified_at": None,
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})

    await log_audit_event(
        action="linkedin_disconnected",
        actor=actor_id,
        actor_role="Student",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"provider": "linkedin"}
    )

    return {"message": "LinkedIn account successfully disconnected."}


async def update_linkedin_profile_url(student_id: str, profile_url: str, actor_id: str) -> Dict[str, Any]:
    """
    Allows a student to supply their public LinkedIn profile URL.
    """
    student = await get_student_for_user(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    clean_url = profile_url.strip()
    if clean_url and not (clean_url.startswith("http://") or clean_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid profile URL. Must start with http:// or https://")

    update_doc = {
        "professional_verification.linkedin.profile_url": clean_url,
        "links.linkedin": clean_url,
        "portfolio_links.linkedin": clean_url,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})
    return {"message": "LinkedIn profile link updated successfully.", "profile_url": clean_url}


# ─────────────────────────────────────────────────────────────────────────────
# CENTRALIZED DRIVE ACCESS VERIFICATION GUARD
# ─────────────────────────────────────────────────────────────────────────────

async def require_professional_verification(
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    FastAPI dependency guard enforcing that students MUST have both GitHub
    and LinkedIn verified before accessing placement drives.

    CRITICAL: Does NOT block administrative roles (Dean, TPO, Faculty).
    """
    user_role = current_user.get("role")

    # Administrative roles bypass this student-only requirement
    if user_role in ["Dean", "TPO", "Faculty"]:
        return current_user

    if user_role == "Student":
        student_id = current_user["user_id"]
        student = await get_student_for_user(student_id, current_user.get("email"))

        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student profile not found."
            )

        status_info = get_verification_status(student)

        if not status_info["drives_unlocked"]:
            institution_id = current_user.get("institution_id")
            await log_audit_event(
                action="drive_access_denied_unverified",
                actor=current_user.get("email", student_id),
                actor_role="Student",
                entity_type="Student",
                entity_id=student_id,
                institution_id=institution_id or "unknown",
                details={"missing": status_info["missing_verifications"]}
            )

            missing_names = [m.title() for m in status_info["missing_verifications"]]
            message = (
                f"Professional Account Verification Required: Connect both GitHub and LinkedIn "
                f"to access placement drives. Missing: {', '.join(missing_names)}."
            )

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "PROFESSIONAL_VERIFICATION_REQUIRED",
                    "message": message,
                    "missing_verifications": status_info["missing_verifications"],
                    "verification_status": {
                        "github": status_info["github"],
                        "linkedin": status_info["linkedin"],
                    }
                }
            )

        return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Access denied for role: {user_role}"
    )
