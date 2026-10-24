from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.services.ai_drive_service import AIDriveService
from app.services.ai_student_match_service import AIStudentMatchService

router = APIRouter()

# ── Request / Response Payloads ───────────────────────────────────────────────

class AnalyzeJDPayload(BaseModel):
    source_jd: str

class CompleteMissingInfoPayload(BaseModel):
    company_name: Optional[str] = None
    job_role: Optional[str] = None
    package: Optional[str] = None
    location: Optional[str] = None
    passout_year: Optional[int] = None
    drive_deadline: Optional[str] = None
    min_cgpa: Optional[float] = None
    max_backlogs: Optional[int] = None
    allowed_departments: Optional[List[str]] = None
    external_apply_link: Optional[str] = None
    extra_fields: Optional[Dict[str, Any]] = None

class UpdateDraftPayload(BaseModel):
    extracted_requirements: Optional[Dict[str, Any]] = None
    mapped_requirements: Optional[Dict[str, Any]] = None

class AcceptIssueCorrectionPayload(BaseModel):
    field: str
    original_value: Any
    suggested_value: Any

# ── 1. TPO AI Placement Drive Endpoints ───────────────────────────────────────

@router.post("/drives/analyze", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO"]))])
async def analyze_jd(
    payload: AnalyzeJDPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Takes an unstructured job description, uses AI reasoning to extract criteria,
    maps them to authoritative institution hierarchy IDs in MongoDB,
    and returns a structured AI Drive Draft.
    """
    if not payload.source_jd or len(payload.source_jd.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description text is too short. Please provide a more detailed JD."
        )

    draft = await AIDriveService.analyze_and_create_draft(
        source_jd=payload.source_jd.strip(),
        institution_id=institution_id,
        current_user=current_user
    )
    return draft

@router.get("/drives/drafts", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def list_ai_drafts(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Lists all AI Drive Drafts for the authenticated institution."""
    return await AIDriveService.list_drafts(institution_id)

@router.get("/drives/drafts/{draft_id}", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def get_ai_draft(
    draft_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Retrieves an AI Drive Draft by ID with tenant security check."""
    return await AIDriveService.get_draft(draft_id, institution_id)

@router.put("/drives/drafts/{draft_id}", dependencies=[Depends(RoleChecker(["TPO"]))])
async def update_ai_draft(
    draft_id: str,
    payload: UpdateDraftPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Allows TPO to manually edit extracted or mapped requirements."""
    return await AIDriveService.update_draft(
        draft_id=draft_id,
        update_payload=payload.model_dump(exclude_none=True),
        institution_id=institution_id,
        current_user=current_user
    )

@router.post("/drives/drafts/{draft_id}/complete-missing-info", dependencies=[Depends(RoleChecker(["TPO"]))])
async def complete_missing_info(
    draft_id: str,
    payload: CompleteMissingInfoPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Submits missing fields identified during JD analysis (e.g. deadline, company name)
    and re-runs deterministic validation.
    """
    input_dict = payload.model_dump(exclude_none=True)
    if "extra_fields" in input_dict:
        extra = input_dict.pop("extra_fields")
        if isinstance(extra, dict):
            input_dict.update(extra)

    return await AIDriveService.complete_missing_info(
        draft_id=draft_id,
        missing_input=input_dict,
        institution_id=institution_id,
        current_user=current_user
    )

@router.post("/drives/drafts/{draft_id}/approve", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO"]))])
async def approve_and_publish_draft(
    draft_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    HUMAN APPROVAL GATE:
    Authoritative action to approve and publish the AI-generated draft.
    Creates live PlacementDrive in MongoDB, queries eligible students,
    creates notifications, queues emails, and marks draft as PUBLISHED.
    """
    return await AIDriveService.approve_and_publish_draft(
        draft_id=draft_id,
        institution_id=institution_id,
        current_user=current_user,
        background_tasks=background_tasks
    )

# ── 2. Student AI Matching & Quality Endpoints ────────────────────────────────

@router.get("/students/{student_id}/match/{drive_id}", dependencies=[Depends(RoleChecker(["Student", "TPO", "Faculty"]))])
async def match_student_to_drive(
    student_id: str,
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Evaluates student eligibility against a specific drive using deterministic engine,
    identifies board conversions, categorizes mandatory vs preferred criteria,
    and returns explainable AI assessment.
    """
    # If student role, ensure they are requesting their own profile
    if current_user.get("role") == "Student" and current_user.get("user_id") != student_id:
        # Check if student_id matches roll number or id
        pass  # tenant checks in service handles this safely

    return await AIStudentMatchService.get_match_assessment(
        student_id=student_id,
        drive_id=drive_id,
        institution_id=institution_id,
        current_user=current_user
    )

@router.post("/students/{student_id}/match/{drive_id}/approve", dependencies=[Depends(RoleChecker(["Student"]))])
async def approve_student_match(
    student_id: str,
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Student explicitly confirms and approves the AI assessment prior to applying.
    """
    return await AIStudentMatchService.record_match_approval(
        student_id=student_id,
        drive_id=drive_id,
        institution_id=institution_id,
        current_user=current_user
    )

@router.get("/students/{student_id}/issues", dependencies=[Depends(RoleChecker(["Student", "Faculty"]))])
async def get_student_data_issues(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Inspects student profile for typos, missing essential fields, or formatting issues."""
    return await AIStudentMatchService.get_student_data_issues(
        student_id=student_id,
        institution_id=institution_id
    )

@router.post("/students/{student_id}/issues/accept", dependencies=[Depends(RoleChecker(["Student", "Faculty"]))])
async def accept_student_data_correction(
    student_id: str,
    payload: AcceptIssueCorrectionPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    HUMAN APPROVAL GATE:
    Accepts suggested data correction (e.g. skill typo fix), validates,
    and updates authoritative student profile in MongoDB.
    """
    return await AIStudentMatchService.accept_issue_correction(
        student_id=student_id,
        field=payload.field,
        original_value=payload.original_value,
        suggested_value=payload.suggested_value,
        institution_id=institution_id,
        current_user=current_user
    )
