from fastapi import APIRouter, Depends, HTTPException, status
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from app.services.email import send_drive_notification_email
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter()

class DriveCreatePayload(BaseModel):
    company_name: str
    job_role: str
    package: str  # e.g. "12 LPA"
    location: str
    mode: str  # "On-campus", "Remote", "Hybrid"
    min_cgpa: float = 0.0
    max_backlogs: int = 99
    allowed_departments: List[str]  # List of department ID strings
    allowed_programs: List[str]     # List of program ID strings
    gender_filter: str = "All"      # "All", "Male", "Female"
    passout_year: int
    external_apply_link: Optional[str] = None
    drive_deadline: datetime

@router.post("/create", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO"]))])
async def create_drive(payload: DriveCreatePayload, current_user: dict = Depends(get_current_user), institution_id: str = Depends(get_tenant_id)):
    # Parse deadline to UTC
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
        "max_backlogs": payload.max_backlogs,
        "allowed_departments": payload.allowed_departments,
        "allowed_programs": payload.allowed_programs,
        "gender_filter": payload.gender_filter,
        "passout_year": payload.passout_year,
        "external_apply_link": payload.external_apply_link,
        "drive_deadline": deadline,
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.db.placement_drives.insert_one(drive_doc)
    drive_id = str(result.inserted_id)
    
    # TRIGGER ELIGIBILITY ENGINE & NOTIFICATION SYSTEM
    # Search all student profiles in the institution that match criteria
    query = {
        "institution_id": institution_id,
        "status": "verified",
        "program_id": {"$in": payload.allowed_programs},
        "department_id": {"$in": payload.allowed_departments},
        "cgpa": {"$gte": payload.min_cgpa},
        "active_backlogs": {"$lte": payload.max_backlogs}
        # In a real app we can check: "education.tenth.percentage", "gender", etc.
    }
    
    # Handle Gender Filter
    if payload.gender_filter != "All":
        query["gender"] = payload.gender_filter
        
    eligible_students_cursor = db.db.students.find(query)
    eligible_students = await eligible_students_cursor.to_list(length=1000)
    
    notifications = []
    for student in eligible_students:
        student_id = str(student["_id"])
        
        # 1. Add notification document to database
        notifications.append({
            "student_id": student_id,
            "drive_id": drive_id,
            "institution_id": institution_id,
            "message": f"New Placement Drive: {payload.company_name} is hiring for {payload.job_role}!",
            "status": "unread",
            "created_at": datetime.now(timezone.utc)
        })
        
        # 2. Send real email notification
        student_email = student.get("emails", {}).get("institute") or student.get("emails", {}).get("personal")
        if student_email:
            await send_drive_notification_email(
                email=student_email,
                student_name=student.get("name", "Student"),
                company_name=payload.company_name,
                job_role=payload.job_role,
                package=payload.package,
                deadline=deadline.strftime("%d %b %Y, %I:%M %p UTC"),
                apply_url="http://localhost:5173/dashboard",
            )

    if notifications:
        await db.db.notifications.insert_many(notifications)
        
    # Log Audit
    await db.db.audit_logs.insert_one({
        "action": "placement_drive_created",
        "institution_id": institution_id,
        "email": current_user["email"],
        "user_id": current_user["user_id"],
        "role": "TPO",
        "drive_id": drive_id,
        "eligible_students_count": len(eligible_students),
        "timestamp": datetime.now(timezone.utc),
        "status": "success"
    })
    
    return {
        "message": "Placement drive created successfully.",
        "drive_id": drive_id,
        "eligible_students_notified": len(eligible_students)
    }

# Student views their eligible placement drive feed
@router.get("/student-feed", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_student_drive_feed(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one({"_id": ObjectId(student_id), "institution_id": institution_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")
        
    # Query drives where student meets criteria
    now = datetime.now(timezone.utc)
    query = {
        "institution_id": institution_id,
        "drive_deadline": {"$gt": now},
        "allowed_programs": student["program_id"],
        "allowed_departments": student["department_id"],
        "min_cgpa": {"$lte": student["cgpa"]},
        "max_backlogs": {"$gte": student["active_backlogs"]}
    }
    
    if student.get("gender"):
        query["gender_filter"] = {"$in": ["All", student["gender"]]}
        
    drives_cursor = db.db.placement_drives.find(query)
    drives = await drives_cursor.to_list(length=100)
    
    # Map driving list to check if already applied
    drive_list = []
    for d in drives:
        d_id = str(d["_id"])
        applied = await db.db.applications.find_one({
            "student_id": student_id,
            "drive_id": d_id
        })
        
        drive_list.append({
            "id": d_id,
            "company_name": d["company_name"],
            "job_role": d["job_role"],
            "package": d["package"],
            "location": d["location"],
            "mode": d["mode"],
            "drive_deadline": d["drive_deadline"],
            "external_apply_link": d.get("external_apply_link"),
            "applied": True if applied else False,
            "application_status": applied.get("status") if applied else None
        })
        
    return drive_list

# Student applies for a drive
@router.post("/{drive_id}/apply", dependencies=[Depends(RoleChecker(["Student"]))])
async def apply_to_drive(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one({"_id": ObjectId(student_id), "institution_id": institution_id})
    drive = await db.db.placement_drives.find_one({"_id": ObjectId(drive_id), "institution_id": institution_id})
    
    if not student or not drive:
        raise HTTPException(status_code=404, detail="Student or Drive not found.")
        
    # Check deadline
    now = datetime.now(timezone.utc)
    deadline = drive["drive_deadline"]
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if now > deadline:
        raise HTTPException(status_code=400, detail="Drive deadline has expired.")
        
    # Check Eligibility
    eligible = (
        student["program_id"] in drive["allowed_programs"] and
        student["department_id"] in drive["allowed_departments"] and
        student["cgpa"] >= drive["min_cgpa"] and
        student["active_backlogs"] <= drive["max_backlogs"]
    )
    if not eligible:
        raise HTTPException(status_code=400, detail="You do not meet the eligibility requirements for this drive.")
        
    # Check if already applied
    exists = await db.db.applications.find_one({"student_id": student_id, "drive_id": drive_id})
    if exists:
        return {"message": "You have already applied to this drive."}
        
    # Apply
    app_doc = {
        "student_id": student_id,
        "drive_id": drive_id,
        "institution_id": institution_id,
        "status": "Applied",
        "applied_at": datetime.now(timezone.utc)
    }
    await db.db.applications.insert_one(app_doc)
    
    # Log Audit
    await db.db.audit_logs.insert_one({
        "action": "student_drive_apply",
        "institution_id": institution_id,
        "email": current_user["email"],
        "user_id": student_id,
        "role": "Student",
        "drive_id": drive_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "success"
    })
    
    return {"message": "Application submitted successfully."}

# Student withdraws from a drive
@router.post("/{drive_id}/withdraw", dependencies=[Depends(RoleChecker(["Student"]))])
async def withdraw_from_drive(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    
    # Delete application
    res = await db.db.applications.delete_many({
        "student_id": student_id,
        "drive_id": drive_id,
        "institution_id": institution_id
    })
    
    if res.deleted_count == 0:
        raise HTTPException(status_code=400, detail="No active application found to withdraw.")
        
    # Log Audit
    await db.db.audit_logs.insert_one({
        "action": "student_drive_withdraw",
        "institution_id": institution_id,
        "email": current_user["email"],
        "user_id": student_id,
        "role": "Student",
        "drive_id": drive_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "success"
    })
    
    return {"message": "Application withdrawn successfully."}

# Track student application history
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
        drive = await db.db.placement_drives.find_one({"_id": ObjectId(app["drive_id"])})
        if drive:
            track_list.append({
                "application_id": str(app["_id"]),
                "drive_id": app["drive_id"],
                "company_name": drive["company_name"],
                "job_role": drive["job_role"],
                "package": drive["package"],
                "applied_at": app["applied_at"],
                "status": app["status"]
            })
            
    return track_list
