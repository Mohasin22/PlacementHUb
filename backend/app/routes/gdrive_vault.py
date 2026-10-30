from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.db.utils import id_query
from app.services.gdrive_vault_service import GDriveVaultService

router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class ConnectFolderPayload(BaseModel):
    folder_url: str
    folder_name: Optional[str] = "PLACEMENT"

class AddFilePayload(BaseModel):
    name: str
    doc_type: str = "other"  # 10th_marksheet, 12th_marksheet, ug_marksheet, internship_cert, technical_cert, resume, other
    drive_url: Optional[str] = ""
    file_size: Optional[str] = "1.0 MB"
    mime_type: Optional[str] = "application/pdf"
    extracted_text_snippet: Optional[str] = ""

class UpdateChecklistItemPayload(BaseModel):
    item_key: str
    is_checked: bool
    status_override: Optional[str] = None  # VERIFIED_MATCH, MISMATCH, MISSING, PENDING_REVIEW
    note: Optional[str] = None

# ── Student Endpoints (For Authenticated Student) ────────────────────────────

@router.get("", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_my_gdrive_vault(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    vault = await GDriveVaultService.get_or_initialize_vault(student_id)
    return vault

@router.post("/connect", dependencies=[Depends(RoleChecker(["Student"]))])
async def connect_my_gdrive_vault(
    payload: ConnectFolderPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    try:
        vault = await GDriveVaultService.connect_vault(
            student_id=student_id,
            folder_url=payload.folder_url,
            institution_id=institution_id,
            actor_email=current_user.get("email", ""),
            folder_name=payload.folder_name or "PLACEMENT"
        )
        return {"message": "Google Drive 'PLACEMENT' folder connected successfully!", "vault": vault}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/add-file", dependencies=[Depends(RoleChecker(["Student"]))])
async def add_file_to_vault(
    payload: AddFilePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    vault = await GDriveVaultService.add_or_update_file(
        student_id=student_id,
        file_payload=payload.dict(),
        institution_id=institution_id,
        actor_email=current_user.get("email", "")
    )
    return {"message": "Document added to PLACEMENT folder vault.", "vault": vault}

@router.delete("/files/{file_id}", dependencies=[Depends(RoleChecker(["Student"]))])
async def remove_file_from_vault(
    file_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    vault = await GDriveVaultService.remove_file(student_id=student_id, file_id=file_id)
    return {"message": "Document removed from vault.", "vault": vault}

@router.post("/demo-populate", dependencies=[Depends(RoleChecker(["Student"]))])
async def populate_demo_placement_folder(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Convenience endpoint for testing: Populates realistic demo certificates
    into the student's Google Drive PLACEMENT folder and runs AI cross-verification.
    """
    student_id = current_user["user_id"]
    try:
        vault = await GDriveVaultService.populate_demo_vault(
            student_id=student_id,
            institution_id=institution_id,
            actor_email=current_user.get("email", "")
        )
        return {
            "message": "Demo 'PLACEMENT' folder loaded and cross-verified with AI!",
            "vault": vault
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-ai", dependencies=[Depends(RoleChecker(["Student"]))])
async def run_ai_cross_verification(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    try:
        vault = await GDriveVaultService.verify_vault_with_ai(
            student_id=student_id,
            institution_id=institution_id,
            actor_email=current_user.get("email", "")
        )
        return {
            "message": "AI cross-verification completed successfully!",
            "vault": vault,
            "report": vault.get("verification_report")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@router.put("/checklist-item", dependencies=[Depends(RoleChecker(["Student"]))])
async def update_my_checklist_item(
    payload: UpdateChecklistItemPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    try:
        vault = await GDriveVaultService.update_checkbox_item(
            student_id=student_id,
            item_key=payload.item_key,
            is_checked=payload.is_checked,
            status_override=payload.status_override,
            note=payload.note,
            actor_email=current_user.get("email", ""),
            actor_role="Student"
        )
        return {"message": "Checklist status updated.", "vault": vault}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ── Staff / Coordinator Endpoints (For Faculty, TPO, Dean) ─────────────────

@router.get("/{student_id}", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def get_student_gdrive_vault(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    vault = await GDriveVaultService.get_or_initialize_vault(student_id)
    return vault

@router.post("/{student_id}/verify-ai", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_run_ai_verification(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    try:
        vault = await GDriveVaultService.verify_vault_with_ai(
            student_id=student_id,
            institution_id=institution_id,
            actor_email=current_user.get("email", "")
        )
        return {
            "message": "AI cross-verification completed for student!",
            "vault": vault,
            "report": vault.get("verification_report")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@router.put("/{student_id}/checklist-item", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_update_checklist_item(
    student_id: str,
    payload: UpdateChecklistItemPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    try:
        vault = await GDriveVaultService.update_checkbox_item(
            student_id=student_id,
            item_key=payload.item_key,
            is_checked=payload.is_checked,
            status_override=payload.status_override,
            note=payload.note,
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", "Faculty")
        )
        return {"message": f"Verification sign-off updated by {current_user.get('role', 'Faculty')}.", "vault": vault}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
