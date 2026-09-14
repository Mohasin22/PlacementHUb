from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.services.email import send_drive_notification_email
from app.services.eligibility_engine import evaluate_student_eligibility, get_eligible_students_for_drive
from app.services.audit import log_audit_event
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from app.db.utils import id_query, parse_id

router = APIRouter()

class DriveCreatePayload(BaseModel):
    company_name: str
    job_role: str
    package: str  # e.g. "12 LPA"
    location: str
    mode: str  # "On-campus", "Remote", "Hybrid"
    min_cgpa: float = 0.0
    min_ug_percentage: Optional[float] = None
    min_tenth_percentage: Optional[float] = None
    min_twelfth_percentage: Optional[float] = None
    max_backlogs: int = 99
    max_total_backlogs: Optional[int] = None
    allowed_departments: List[str] = []  # List of department ID strings or names
    allowed_programs: List[str] = []     # List of program ID strings or names
    education_gap_allowed: bool = True
    first_attempt_required: bool = False
    gender_filter: str = "All"      # "All", "Male", "Female"
    passout_year: int
    external_apply_link: Optional[str] = None
    drive_deadline: datetime

@router.post("/create", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO"]))])
async def create_drive(
    payload: DriveCreatePayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    deadline = payload.drive_deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
        
    drive_doc = {
        "institution_id": institution_id,
        "company_name": payload.company_name.strip(),
        "job_role": payload.job_role.strip(),
        "package": payload.package.strip(),
        "location": payload.location.strip(),
        "mode": payload.mode,
        "min_cgpa": payload.min_cgpa,
        "min_ug_percentage": payload.min_ug_percentage,
        "min_tenth_percentage": payload.min_tenth_percentage,
        "min_twelfth_percentage": payload.min_twelfth_percentage,
        "max_backlogs": payload.max_backlogs,
        "max_total_backlogs": payload.max_total_backlogs,
        "allowed_departments": payload.allowed_departments,
        "allowed_programs": payload.allowed_programs,
        "education_gap_allowed": payload.education_gap_allowed,
        "first_attempt_required": payload.first_attempt_required,
        "gender_filter": payload.gender_filter,
        "passout_year": payload.passout_year,
        "external_apply_link": payload.external_apply_link,
        "drive_deadline": deadline,
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.db.placement_drives.insert_one(drive_doc)
    drive_id = str(result.inserted_id)
    
    # Evaluate eligible students using structured engine
    eligible_students = await get_eligible_students_for_drive(drive_id, institution_id)
    
    notifications = []
    for student in eligible_students:
        student_id = str(student["_id"])
        notifications.append({
            "student_id": student_id,
            "drive_id": drive_id,
            "institution_id": institution_id,
            "message": f"New Placement Drive: {payload.company_name} is hiring for {payload.job_role} ({payload.package})!",
            "status": "unread",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
    if notifications:
        await db.db.notifications.insert_many(notifications)
        
    async def send_emails():
        for student in eligible_students:
            student_email = student.get("contact", {}).get("institutional_email") or student.get("emails", {}).get("institute") or student.get("contact", {}).get("personal_email")
            if student_email:
                await send_drive_notification_email(
                    email=student_email,
                    student_name=student.get("name") or student.get("identity", {}).get("full_name", "Student"),
                    company_name=payload.company_name,
                    job_role=payload.job_role,
                    package=payload.package,
                    deadline=deadline.strftime("%d %b %Y, %I:%M %p UTC"),
                    apply_url="http://localhost:5173/dashboard",
                )
    
    background_tasks.add_task(send_emails)
        
    await log_audit_event(
        action="placement_drive_created",
        actor=current_user["email"],
        actor_role="TPO",
        entity_type="PlacementDrive",
        entity_id=drive_id,
        institution_id=institution_id,
        details={"company": payload.company_name, "eligible_count": len(eligible_students)}
    )
    
    return {
        "message": "Placement drive created successfully with structured requirements.",
        "drive_id": drive_id,
        "eligible_students_notified": len(eligible_students)
    }

@router.get("/{drive_id}/eligible-students", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def list_eligible_students(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Retrieves all students that satisfy the drive's eligibility rules."""
    eligible_students = await get_eligible_students_for_drive(drive_id, institution_id)
    return eligible_students

@router.put("/{drive_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(RoleChecker(["TPO"]))])
async def update_drive(
    drive_id: str,
    payload: DriveCreatePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    deadline = payload.drive_deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
        
    update_doc = {
        "company_name": payload.company_name.strip(),
        "job_role": payload.job_role.strip(),
        "package": payload.package.strip(),
        "location": payload.location.strip(),
        "mode": payload.mode,
        "min_cgpa": payload.min_cgpa,
        "min_ug_percentage": payload.min_ug_percentage,
        "min_tenth_percentage": payload.min_tenth_percentage,
        "min_twelfth_percentage": payload.min_twelfth_percentage,
        "max_backlogs": payload.max_backlogs,
        "max_total_backlogs": payload.max_total_backlogs,
        "allowed_departments": payload.allowed_departments,
        "allowed_programs": payload.allowed_programs,
        "education_gap_allowed": payload.education_gap_allowed,
        "first_attempt_required": payload.first_attempt_required,
        "gender_filter": payload.gender_filter,
        "passout_year": payload.passout_year,
        "external_apply_link": payload.external_apply_link,
        "drive_deadline": deadline,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    res = await db.db.placement_drives.update_one(id_query(drive_id), {"$set": update_doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    return {"message": "Placement drive updated successfully."}

@router.delete("/{drive_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(RoleChecker(["TPO"]))])
async def delete_drive(drive_id: str, current_user: dict = Depends(get_current_user), institution_id: str = Depends(get_tenant_id)):
    res = await db.db.placement_drives.delete_one(id_query(drive_id))
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    await db.db.applications.delete_many({"drive_id": drive_id})
    await db.db.notifications.delete_many({"drive_id": drive_id})
    
    return {"message": "Placement drive deleted successfully."}

# ── Student Drive Feed & 1-Click Snapshot Application ─────────────────────────

@router.get("/student-feed", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_student_drive_feed(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")
        
    now = datetime.now(timezone.utc)
    drives_cursor = db.db.placement_drives.find({"institution_id": institution_id})
    all_drives = await drives_cursor.to_list(length=200)
    
    drive_list = []
    for d in all_drives:
        d_id = str(d["_id"])
        is_eligible, reasons = evaluate_student_eligibility(student, d)
        
        # Check if already applied
        applied = await db.db.applications.find_one({
            "student_id": student_id,
            "drive_id": d_id
        })
        
        if is_eligible or applied:
            drive_list.append({
                "id": d_id,
                "company_name": d["company_name"],
                "job_role": d["job_role"],
                "package": d["package"],
                "location": d["location"],
                "mode": d["mode"],
                "drive_deadline": d["drive_deadline"],
                "external_apply_link": d.get("external_apply_link"),
                "is_eligible": is_eligible,
                "eligibility_reasons": reasons,
                "applied": True if applied else False,
                "application_status": applied.get("status") if applied else None
            })
        
    return drive_list

@router.get("/{drive_id}/application-preview", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_application_preview(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Returns read-only application snapshot preview before student clicks Verify & Apply."""
    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    drive = await db.db.placement_drives.find_one(id_query(drive_id))
    if not student or not drive:
        raise HTTPException(status_code=404, detail="Student or Drive not found.")

    is_eligible, reasons = evaluate_student_eligibility(student, drive)

    preview = {
        "drive_id": drive_id,
        "company_name": drive.get("company_name"),
        "job_role": drive.get("job_role"),
        "package": drive.get("package"),
        "is_eligible": is_eligible,
        "eligibility_reasons": reasons,
        "snapshot_preview": {
            "name": student.get("name") or student.get("identity", {}).get("full_name"),
            "roll_number": student.get("roll_number") or student.get("student_id"),
            "institutional_email": student.get("contact", {}).get("institutional_email") or student.get("emails", {}).get("institute"),
            "personal_email": student.get("contact", {}).get("personal_email") or student.get("emails", {}).get("personal"),
            "mobile": student.get("mobile") or student.get("contact", {}).get("mobile"),
            "program": student.get("program_name") or student.get("academic_identity", {}).get("program_name"),
            "department": student.get("department_name") or student.get("academic_identity", {}).get("department_name"),
            "class_section": student.get("class_name") or student.get("academic_identity", {}).get("class_name"),
            "tenth_percentage": student.get("education", {}).get("secondary", {}).get("normalized_percentage"),
            "twelfth_percentage": student.get("education", {}).get("higher_secondary_or_diploma", {}).get("normalized_percentage"),
            "ug_cgpa": student.get("cgpa") or student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa"),
            "ug_percentage": student.get("education", {}).get("undergraduate", {}).get("normalized_percentage"),
            "current_backlogs": student.get("active_backlogs") if student.get("active_backlogs") is not None else student.get("eligibility_data", {}).get("current_backlogs"),
            "skills": student.get("skills", []),
            "projects": student.get("projects", []),
            "certifications": student.get("certifications", []),
            "resume_url": student.get("resume_url") or student.get("documents", {}).get("resume"),
            "links": student.get("links", {})
        }
    }
    return preview

@router.post("/{drive_id}/apply", dependencies=[Depends(RoleChecker(["Student"]))])
async def apply_to_drive(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    drive = await db.db.placement_drives.find_one(id_query(drive_id))
    
    if not student or not drive:
        raise HTTPException(status_code=404, detail="Student or Drive not found.")
        
    # Check deadline
    now = datetime.now(timezone.utc)
    deadline = drive["drive_deadline"]
    if hasattr(deadline, "tzinfo") and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    elif isinstance(deadline, str):
        deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        
    if now > deadline:
        raise HTTPException(status_code=400, detail="Drive deadline has expired.")
        
    # Check Eligibility
    is_eligible, reasons = evaluate_student_eligibility(student, drive)
    if not is_eligible:
        raise HTTPException(status_code=400, detail=f"Ineligible for drive: {'; '.join(reasons)}")
        
    # Check if already applied
    exists = await db.db.applications.find_one({"student_id": student_id, "drive_id": drive_id})
    if exists:
        return {"message": "You have already applied to this drive."}
        
    # Capture immutable profile and academic snapshot
    profile_snapshot = {
        "name": student.get("name") or student.get("identity", {}).get("full_name"),
        "roll_number": student.get("roll_number") or student.get("student_id"),
        "institutional_email": student.get("contact", {}).get("institutional_email") or student.get("emails", {}).get("institute"),
        "personal_email": student.get("contact", {}).get("personal_email") or student.get("emails", {}).get("personal"),
        "mobile": student.get("mobile") or student.get("contact", {}).get("mobile"),
        "program": student.get("program_name") or student.get("academic_identity", {}).get("program_name"),
        "department": student.get("department_name") or student.get("academic_identity", {}).get("department_name"),
        "class_section": student.get("class_name") or student.get("academic_identity", {}).get("class_name"),
        "passout_year": student.get("passout_year") or student.get("academic_identity", {}).get("graduation_year"),
        "skills": student.get("skills", []),
        "projects": student.get("projects", []),
        "internships": student.get("internships", []),
        "certifications": student.get("certifications", []),
        "links": student.get("links", {}),
        "resume_url": student.get("resume_url") or student.get("documents", {}).get("resume")
    }

    academic_snapshot = {
        "tenth_percentage": student.get("education", {}).get("secondary", {}).get("normalized_percentage"),
        "tenth_board": student.get("education", {}).get("secondary", {}).get("board"),
        "twelfth_percentage": student.get("education", {}).get("higher_secondary_or_diploma", {}).get("normalized_percentage"),
        "twelfth_board": student.get("education", {}).get("higher_secondary_or_diploma", {}).get("board"),
        "ug_cgpa": student.get("cgpa") or student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa"),
        "ug_percentage": student.get("education", {}).get("undergraduate", {}).get("normalized_percentage"),
        "current_backlogs": student.get("active_backlogs") if student.get("active_backlogs") is not None else student.get("eligibility_data", {}).get("current_backlogs"),
        "total_backlogs": student.get("total_backlogs") if student.get("total_backlogs") is not None else student.get("eligibility_data", {}).get("backlog_count"),
        "education_gap": student.get("eligibility_data", {}).get("education_gap") or "No",
        "first_attempt_status": student.get("eligibility_data", {}).get("first_attempt_status") or "Yes"
    }

    app_doc = {
        "student_id": student_id,
        "drive_id": drive_id,
        "institution_id": institution_id,
        "profile_snapshot": profile_snapshot,
        "academic_snapshot": academic_snapshot,
        "resume_version": profile_snapshot.get("resume_url"),
        "status": "Applied",
        "applied_at": datetime.now(timezone.utc).isoformat()
    }
    await db.db.applications.insert_one(app_doc)
    
    await log_audit_event(
        action="student_drive_applied",
        actor=current_user["email"],
        actor_role="Student",
        entity_type="Application",
        entity_id=drive_id,
        institution_id=institution_id,
        details={"company": drive.get("company_name")}
    )
    
    return {"message": "Application submitted successfully with profile snapshot."}

@router.post("/{drive_id}/withdraw", dependencies=[Depends(RoleChecker(["Student"]))])
async def withdraw_from_drive(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    res = await db.db.applications.delete_many({
        "student_id": student_id,
        "drive_id": drive_id,
        "institution_id": institution_id
    })
    
    if res.deleted_count == 0:
        raise HTTPException(status_code=400, detail="No active application found to withdraw.")
        
    return {"message": "Application withdrawn successfully."}

@router.get("/applications/track", dependencies=[Depends(RoleChecker(["Student"]))])
async def track_applications(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    apps_cursor = db.db.applications.find({"student_id": student_id, "institution_id": institution_id})
    apps = await apps_cursor.to_list(length=100)
    
    track_list = []
    for app in apps:
        drive = await db.db.placement_drives.find_one(id_query(app["drive_id"]))
        if drive:
            track_list.append({
                "application_id": str(app["_id"]),
                "drive_id": app["drive_id"],
                "company_name": drive.get("company_name"),
                "job_role": drive.get("job_role"),
                "package": drive.get("package"),
                "applied_at": app.get("applied_at"),
                "status": app.get("status")
            })
            
    return track_list
