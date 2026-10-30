"""
Professional Verification Routes for PlacementHub.
Provides student verification status, OAuth connect/callback endpoints,
and disconnect actions.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.config import settings
from app.services.verification_service import (
    get_student_for_user,
    get_verification_status,
    get_github_auth_url,
    handle_github_callback,
    disconnect_github,
    get_linkedin_auth_url,
    handle_linkedin_callback,
    disconnect_linkedin,
    update_linkedin_profile_url,
)
import logging

logger = logging.getLogger("app.routes.verification")

student_verification_router = APIRouter()
auth_callback_router = APIRouter()


class LinkedInProfileUrlPayload(BaseModel):
    profile_url: str


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT VERIFICATION ENDPOINTS (/api/student/verification)
# ─────────────────────────────────────────────────────────────────────────────

@student_verification_router.get("", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_my_verification_status(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Returns the authenticated student's GitHub and LinkedIn verification status,
    including connected usernames, profile URLs, verification dates, and unlock state.
    """
    student_id = current_user["user_id"]
    student = await get_student_for_user(student_id, current_user.get("email"))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    return get_verification_status(student)


@student_verification_router.get("/drive-access", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_my_drive_access_status(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Returns whether the student has unlocked placement drive access and which
    verifications remain pending.
    """
    student_id = current_user["user_id"]
    student = await get_student_for_user(student_id, current_user.get("email"))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    status_info = get_verification_status(student)
    return {
        "access_granted": status_info["drives_unlocked"],
        "missing_verifications": status_info["missing_verifications"],
        "github_connected": status_info["github"]["connected"],
        "linkedin_connected": status_info["linkedin"]["connected"],
    }


@student_verification_router.get("/github/connect", dependencies=[Depends(RoleChecker(["Student"]))])
async def initiate_github_connect(
    redirect: bool = False,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Starts GitHub OAuth 2.0 flow: generates single-use state and authorization URL.
    Returns JSON authorization_url by default, or redirects browser if redirect=true.
    """
    student_id = current_user["user_id"]
    student = await get_student_for_user(student_id, current_user.get("email"))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    auth_url = await get_github_auth_url(student_id, student, institution_id)

    if redirect:
        return RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    return {"authorization_url": auth_url, "provider": "github"}


@student_verification_router.delete("/github", dependencies=[Depends(RoleChecker(["Student"]))])
async def disconnect_github_account(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Disconnects verified GitHub account from the student profile.
    Future drive access will be locked until re-verified.
    """
    student_id = current_user["user_id"]
    return await disconnect_github(student_id, institution_id, current_user["email"])


@student_verification_router.get("/linkedin/connect", dependencies=[Depends(RoleChecker(["Student"]))])
async def initiate_linkedin_connect(
    redirect: bool = False,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Starts LinkedIn OAuth 2.0 / OpenID Connect flow: generates single-use state and authorization URL.
    """
    student_id = current_user["user_id"]
    student = await get_student_for_user(student_id, current_user.get("email"))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    auth_url = await get_linkedin_auth_url(student_id, student, institution_id)

    if redirect:
        return RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    return {"authorization_url": auth_url, "provider": "linkedin"}


@student_verification_router.delete("/linkedin", dependencies=[Depends(RoleChecker(["Student"]))])
async def disconnect_linkedin_account(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Disconnects verified LinkedIn account from the student profile.
    Future drive access will be locked until re-verified.
    """
    student_id = current_user["user_id"]
    return await disconnect_linkedin(student_id, institution_id, current_user["email"])


@student_verification_router.put("/linkedin/profile-url", dependencies=[Depends(RoleChecker(["Student"]))])
async def update_linkedin_link(
    payload: LinkedInProfileUrlPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Updates the student's public LinkedIn vanity profile URL.
    """
    student_id = current_user["user_id"]
    return await update_linkedin_profile_url(student_id, payload.profile_url, current_user["email"])


# ─────────────────────────────────────────────────────────────────────────────
# OAUTH CALLBACK HANDLERS (/api/auth/github/callback & /api/auth/linkedin/callback)
# ─────────────────────────────────────────────────────────────────────────────

@auth_callback_router.get("/github/callback")
async def github_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None)
):
    """
    Callback handler for GitHub OAuth.
    Validates state, retrieves authenticated user identity, links account,
    and redirects the browser back to the frontend verification dashboard.
    """
    frontend_base = settings.FRONTEND_URL

    if error:
        err_msg = error_description or error
        logger.warning(f"GitHub returned OAuth error callback: {err_msg}")
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=github&message={err_msg}",
            status_code=status.HTTP_303_SEE_OTHER
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=github&message=Missing+code+or+state+parameter",
            status_code=status.HTTP_303_SEE_OTHER
        )

    try:
        result = await handle_github_callback(code, state)
        username = result.get("username", "account")
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=success&provider=github&username={username}",
            status_code=status.HTTP_303_SEE_OTHER
        )
    except HTTPException as he:
        detail_msg = he.detail if isinstance(he.detail, str) else str(he.detail)
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=github&message={detail_msg}",
            status_code=status.HTTP_303_SEE_OTHER
        )
    except Exception as ex:
        logger.error(f"Unexpected error in GitHub callback: {ex}")
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=github&message=Unexpected+internal+error",
            status_code=status.HTTP_303_SEE_OTHER
        )


@auth_callback_router.get("/linkedin/callback")
async def linkedin_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None)
):
    """
    Callback handler for LinkedIn OpenID Connect OAuth.
    Validates state, retrieves member sub, links account, and redirects to frontend.
    """
    frontend_base = settings.FRONTEND_URL

    if error:
        err_msg = error_description or error
        logger.warning(f"LinkedIn returned OAuth error callback: {err_msg}")
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=linkedin&message={err_msg}",
            status_code=status.HTTP_303_SEE_OTHER
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=linkedin&message=Missing+code+or+state+parameter",
            status_code=status.HTTP_303_SEE_OTHER
        )

    try:
        result = await handle_linkedin_callback(code, state)
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=success&provider=linkedin",
            status_code=status.HTTP_303_SEE_OTHER
        )
    except HTTPException as he:
        detail_msg = he.detail if isinstance(he.detail, str) else str(he.detail)
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=linkedin&message={detail_msg}",
            status_code=status.HTTP_303_SEE_OTHER
        )
    except Exception as ex:
        logger.error(f"Unexpected error in LinkedIn callback: {ex}")
        return RedirectResponse(
            url=f"{frontend_base}/#verification?status=error&provider=linkedin&message=Unexpected+internal+error",
            status_code=status.HTTP_303_SEE_OTHER
        )
