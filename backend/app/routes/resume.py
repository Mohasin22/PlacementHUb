from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import os

from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.db.utils import id_query, parse_id
from app.services.resume_parser import (
    extract_text_from_resume_bytes, parse_resume_content, generate_profile_diff
)
from app.services.audit import log_audit_event

router = APIRouter()

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ConfirmSuggestionsPayload(BaseModel):
    accepted_skills: List[str] = []
    accepted_projects: List[str] = []
    accepted_certifications: List[str] = []
    accepted_links: Dict[str, Optional[str]] = {}

@router.post("/upload", dependencies=[Depends(RoleChecker(["Student"]))])
async def upload_and_scan_resume(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".docx"]:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX resume formats are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Resume file size exceeds 10MB limit.")

    # Save to uploads directory
    scan_id = str(uuid.uuid4())
    stored_filename = f"resume_{scan_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)
    with open(filepath, "wb") as buffer:
        buffer.write(file_bytes)

    resume_url = f"http://localhost:8000/api/files/download/{stored_filename}"

    # Extract text and parse structured data
    raw_text = extract_text_from_resume_bytes(file_bytes, file.filename)
    extracted_data = parse_resume_content(raw_text)

    # Generate diff vs current profile
    profile_diff = generate_profile_diff(student, extracted_data)

    # Store scan record
    scan_doc = {
        "_id": parse_id(scan_id),
        "scan_id": scan_id,
        "student_id": student_id,
        "institution_id": institution_id,
        "filename": file.filename,
        "resume_url": resume_url,
        "extracted_data": extracted_data,
        "profile_diff": profile_diff,
        "status": "PENDING_CONFIRMATION",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.db.resume_scans.insert_one(scan_doc)

    # Centralized audit log
    await log_audit_event(
        action="resume_scanned",
        actor=current_user["email"],
        actor_role="Student",
        entity_type="ResumeScan",
        entity_id=scan_id,
        institution_id=institution_id,
        details={"filename": file.filename, "skills_found": len(extracted_data["skills"])}
    )

    return {
        "scan_id": scan_id,
        "resume_url": resume_url,
        "extracted_data": extracted_data,
        "profile_diff": profile_diff,
        "message": "Resume scanned successfully. Review detected items before applying to profile."
    }

@router.get("/{scan_id}/suggestions", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_resume_suggestions(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    scan = await db.db.resume_scans.find_one(id_query(scan_id))
    if not scan:
        raise HTTPException(status_code=404, detail="Resume scan record not found.")

    student = await db.db.students.find_one(id_query(current_user["user_id"]))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    # Re-generate diff against latest student profile
    diff = generate_profile_diff(student, scan.get("extracted_data", {}))
    return {
        "scan_id": scan_id,
        "resume_url": scan.get("resume_url"),
        "extracted_data": scan.get("extracted_data"),
        "profile_diff": diff
    }

@router.post("/{scan_id}/confirm", dependencies=[Depends(RoleChecker(["Student"]))])
async def confirm_resume_suggestions(
    scan_id: str,
    payload: ConfirmSuggestionsPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    scan = await db.db.resume_scans.find_one(id_query(scan_id))
    if not scan:
        raise HTTPException(status_code=404, detail="Resume scan record not found.")

    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    # Merge non-conflicting dynamic fields
    existing_skills = student.get("skills", [])
    merged_skills = list(dict.fromkeys(existing_skills + payload.accepted_skills))

    existing_projects = student.get("projects", [])
    merged_projects = list(dict.fromkeys(existing_projects + payload.accepted_projects))

    existing_certs = student.get("certifications", [])
    merged_certs = list(dict.fromkeys(existing_certs + payload.accepted_certifications))

    existing_links = student.get("links", {})
    for k, v in payload.accepted_links.items():
        if v:
            existing_links[k] = v

    update_fields = {
        "skills": merged_skills,
        "projects": merged_projects,
        "certifications": merged_certs,
        "links": existing_links,
        "documents.resume": scan.get("resume_url") or student.get("documents", {}).get("resume"),
        "resume_url": scan.get("resume_url") or student.get("resume_url"),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_fields})
    await db.db.resume_scans.update_one(id_query(scan_id), {"$set": {"status": "CONFIRMED"}})

    # Centralized audit log
    await log_audit_event(
        action="resume_suggestions_confirmed",
        actor=current_user["email"],
        actor_role="Student",
        entity_type="StudentProfile",
        entity_id=student_id,
        institution_id=institution_id,
        details={
            "scan_id": scan_id,
            "skills_added": len(payload.accepted_skills),
            "projects_added": len(payload.accepted_projects)
        }
    )

    return {
        "message": "Resume information successfully merged into your profile.",
        "updated_skills": merged_skills,
        "updated_projects": merged_projects
    }
