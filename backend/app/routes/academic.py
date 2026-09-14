from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.db.utils import id_query, parse_id
from app.models.schemas import (
    AcademicBatchCreate, AcademicCalendarCreate, AcademicStatusOverridePayload,
    ProgramStructureUpdate, ClassSectionCreate
)
from app.services.academic_timeline_service import (
    get_student_academic_status, get_or_create_academic_batch,
    get_or_create_class_section, ensure_default_academic_calendar
)
from app.services.audit import log_audit_event

router = APIRouter()

# ── 1. Academic Batches ───────────────────────────────────────────────────────

@router.get("/batches", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def list_academic_batches(
    program_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    query: Dict[str, Any] = {"institution_id": institution_id}
    if program_id:
        query["$or"] = [{"program_id": program_id}, {"program_id": parse_id(program_id)}]

    batches_cursor = db.db.academic_batches.find(query).sort("admission_year", -1)
    batches = await batches_cursor.to_list(length=100)
    for b in batches:
        b["id"] = str(b["_id"])
        del b["_id"]
    return batches

@router.post("/batches", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def create_academic_batch(
    payload: AcademicBatchCreate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    prog = await db.db.programs.find_one(id_query(payload.program_id))
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found under institution.")

    batch = await get_or_create_academic_batch(
        institution_id=institution_id,
        program_id=payload.program_id,
        admission_year=payload.admission_year,
        expected_graduation_year=payload.expected_graduation_year
    )

    await log_audit_event(
        action="academic_batch_created",
        actor=current_user["email"],
        actor_role=current_user.get("role", "TPO"),
        entity_type="AcademicBatch",
        entity_id=batch["id"],
        institution_id=institution_id,
        details={"batch_label": batch["batch_label"]}
    )

    return {"message": "Academic batch created / resolved successfully.", "batch": batch}

# ── 2. Academic Calendars ─────────────────────────────────────────────────────

@router.get("/calendars", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def list_academic_calendars(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    await ensure_default_academic_calendar(institution_id)
    cals_cursor = db.db.academic_calendars.find({"institution_id": institution_id}).sort("academic_year_label", -1)
    cals = await cals_cursor.to_list(length=50)
    for c in cals:
        c["id"] = str(c["_id"])
        del c["_id"]
    return cals

@router.post("/calendars", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def create_academic_calendar(
    payload: AcademicCalendarCreate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    # If active, deactivate others
    if payload.active:
        await db.db.academic_calendars.update_many({"institution_id": institution_id}, {"$set": {"active": False}})

    cal_doc = {
        "institution_id": institution_id,
        "academic_year_label": payload.academic_year_label.strip(),
        "start_date": payload.start_date.strip(),
        "end_date": payload.end_date.strip(),
        "active": payload.active,
        "semester_periods": [p.dict() for p in payload.semester_periods],
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    res = await db.db.academic_calendars.insert_one(cal_doc)
    cal_id = str(res.inserted_id)

    await log_audit_event(
        action="academic_calendar_created",
        actor=current_user["email"],
        actor_role=current_user.get("role", "Dean"),
        entity_type="AcademicCalendar",
        entity_id=cal_id,
        institution_id=institution_id,
        details={"year_label": payload.academic_year_label}
    )

    return {"message": "Academic calendar created successfully.", "calendar_id": cal_id}

@router.put("/calendars/{calendar_id}/activate", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def activate_academic_calendar(
    calendar_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    await db.db.academic_calendars.update_many({"institution_id": institution_id}, {"$set": {"active": False}})
    res = await db.db.academic_calendars.update_one(id_query(calendar_id), {"$set": {"active": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Academic calendar not found.")

    return {"message": "Academic calendar activated."}

# ── 3. Program Structure & Duration ───────────────────────────────────────────

@router.put("/programs/{program_id}/structure", dependencies=[Depends(RoleChecker(["Dean", "TPO"]))])
async def update_program_structure(
    program_id: str,
    payload: ProgramStructureUpdate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    update_data = {
        "duration_years": payload.duration_years,
        "total_semesters": payload.total_semesters,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if payload.code:
        update_data["code"] = payload.code.strip()

    res = await db.db.programs.update_one(id_query(program_id), {"$set": update_data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Program not found.")

    await log_audit_event(
        action="program_structure_updated",
        actor=current_user["email"],
        actor_role=current_user.get("role", "Dean"),
        entity_type="Program",
        entity_id=program_id,
        institution_id=institution_id,
        details=payload.dict()
    )

    return {"message": "Program structure updated successfully."}

# ── 4. Batch-Specific Class Sections ──────────────────────────────────────────

@router.get("/classes", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def list_class_sections(
    program_id: Optional[str] = None,
    department_id: Optional[str] = None,
    academic_batch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    query: Dict[str, Any] = {"institution_id": institution_id}
    if program_id:
        query["$or"] = [{"program_id": program_id}, {"program_id": parse_id(program_id)}]
    if department_id:
        query["$and"] = query.get("$and", []) + [{"$or": [{"department_id": department_id}, {"department_id": parse_id(department_id)}]}]
    if academic_batch_id:
        query["$and"] = query.get("$and", []) + [{"$or": [{"academic_batch_id": academic_batch_id}, {"academic_batch_id": parse_id(academic_batch_id)}]}]

    classes_cursor = db.db.classes.find(query).sort("section_name", 1)
    classes = await classes_cursor.to_list(length=200)
    for c in classes:
        c["id"] = str(c["_id"])
        del c["_id"]
    return classes

@router.post("/classes", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def create_class_section_endpoint(
    payload: ClassSectionCreate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    cls = await get_or_create_class_section(
        institute_id=institution_id,
        program_id=payload.program_id,
        department_id=payload.department_id,
        academic_batch_id=payload.academic_batch_id,
        section_name=payload.section_name,
        faculty_coordinator_id=payload.faculty_coordinator_id
    )

    return {"message": "Class section created / resolved successfully.", "class": cls}

# ── 5. System-Derived Academic Status & Overrides ─────────────────────────────

@router.get("/students/{student_id}/status", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty", "Student"]))])
async def get_student_academic_status_endpoint(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    status_data = await get_student_academic_status(student, current_date=datetime.now(timezone.utc), institute_id=institution_id)
    return status_data

@router.post("/students/{student_id}/override", dependencies=[Depends(RoleChecker(["Dean", "TPO"]))])
async def set_academic_status_override(
    student_id: str,
    payload: AcademicStatusOverridePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Allows authorized admin to set study year or semester override (e.g. for year gaps or repeating semester)."""
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    override_doc = {
        "is_active": True,
        "study_year": payload.study_year,
        "semester": payload.semester,
        "academic_year_label": payload.academic_year_label or "Administrative Override",
        "reason": payload.reason.strip(),
        "approved_by": current_user["email"],
        "approved_at": datetime.now(timezone.utc).isoformat()
    }

    update_doc = {
        "academic_identity.academic_status_override": override_doc,
        "academic_identity.current_study_year": payload.study_year,
        "academic_identity.current_semester": payload.semester,
        "current_study_year": payload.study_year,
        "current_semester": payload.semester,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_doc})

    await log_audit_event(
        action="academic_status_overridden",
        actor=current_user["email"],
        actor_role=current_user.get("role", "Dean"),
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details=payload.dict()
    )

    return {"message": "Academic status override applied successfully.", "override": override_doc}

@router.delete("/students/{student_id}/override", dependencies=[Depends(RoleChecker(["Dean", "TPO"]))])
async def clear_academic_status_override(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    await db.db.students.update_one(
        id_query(student_id),
        {
            "$unset": {"academic_identity.academic_status_override": ""},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )

    # Re-derive standard status
    re_status = await get_student_academic_status(student, current_date=datetime.now(timezone.utc), institute_id=institution_id)
    await db.db.students.update_one(
        id_query(student_id),
        {"$set": {
            "academic_identity.current_study_year": re_status["current_study_year"],
            "academic_identity.current_semester": re_status["current_semester"],
            "current_study_year": re_status["current_study_year"],
            "current_semester": re_status["current_semester"]
        }}
    )

    await log_audit_event(
        action="academic_status_override_cleared",
        actor=current_user["email"],
        actor_role=current_user.get("role", "Dean"),
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id
    )

    return {"message": "Academic status override removed. Student status restored to system derivation."}
