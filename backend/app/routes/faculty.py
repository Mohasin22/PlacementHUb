from fastapi import APIRouter, Depends, HTTPException, status
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.services.security import hash_password
from app.services.audit import log_audit_event
from app.db.utils import id_query, parse_id

router = APIRouter()

async def get_faculty_assigned_scope(user_id: str) -> Dict[str, Any]:
    faculty = await db.db.users.find_one(id_query(user_id))
    if not faculty:
        raise HTTPException(status_code=400, detail="Faculty user not found.")
    
    primary_class_id = str(faculty.get("class_id") or "")
    department_id = str(faculty.get("department_id") or "")

    # Query all batch-specific classes assigned to this faculty coordinator
    assigned_classes_cursor = db.db.classes.find({
        "$or": [
            {"faculty_coordinator_id": user_id},
            {"faculty_coordinator_id": parse_id(user_id)},
            {"_id": parse_id(primary_class_id)} if primary_class_id else {"_id": None}
        ]
    })
    assigned_classes = await assigned_classes_cursor.to_list(length=50)
    
    class_ids = [str(c.get("id") or c["_id"]) for c in assigned_classes if c]
    if primary_class_id and primary_class_id not in class_ids:
        class_ids.append(primary_class_id)

    class_options = [
        {
            "id": str(c.get("id") or c["_id"]),
            "name": c.get("display_name") or c.get("class_name") or "Class",
            "batch_id": str(c.get("academic_batch_id") or ""),
            "department_id": str(c.get("department_id") or "")
        }
        for c in assigned_classes
    ]

    return {
        "class_id": primary_class_id or (class_ids[0] if class_ids else None),
        "assigned_class_ids": class_ids,
        "class_options": class_options,
        "department_id": department_id or None,
        "faculty_name": faculty.get("name")
    }

class FacultyStudentUpdatePayload(BaseModel):
    name: Optional[str] = None
    roll_number: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    mobile: Optional[str] = None
    institute_email: Optional[str] = None
    personal_email: Optional[str] = None
    cgpa: Optional[float] = None
    active_backlogs: Optional[int] = None
    total_backlogs: Optional[int] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None

class FacultyRegisterPayload(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    class_id: str

@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def register_faculty(payload: FacultyRegisterPayload, current_user: dict = Depends(get_current_user), institution_id: str = Depends(get_tenant_id)):
    cls = await db.db.classes.find_one(id_query(payload.class_id))
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found under this institution.")
        
    if current_user.get("role") == "TPO":
        tpo_user = await db.db.users.find_one(id_query(current_user["user_id"]))
        if tpo_user and tpo_user.get("program_id"):
            tpo_prog_id = str(tpo_user["program_id"])
            cls_prog_id = str(cls.get("program_id") or "")
            if cls_prog_id and tpo_prog_id != cls_prog_id:
                raise HTTPException(status_code=403, detail="TPOs can only appoint Faculty Coordinators for their own assigned program.")

    email_check = payload.email.strip().lower()
    existing_user = await db.db.users.find_one({"email": email_check})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")
        
    faculty_doc = {
        "name": payload.name.strip(),
        "email": email_check,
        "password_hash": hash_password(payload.password),
        "phone": payload.phone.strip() if payload.phone else None,
        "role": "Faculty",
        "class_id": payload.class_id,
        "department_id": str(cls.get("department_id") or ""),
        "institution_id": institution_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    res = await db.db.users.insert_one(faculty_doc)
    return {"message": "Faculty Coordinator registered successfully.", "faculty_id": str(res.inserted_id)}

# ── Canonical Faculty Approval Queue Endpoints ───────────────────────────────

@router.get("/students/pending", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def get_pending_faculty_students(
    class_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Retrieves imported students awaiting verification in this Faculty's class or department."""
    scope = await get_faculty_assigned_scope(current_user["user_id"])
    query: Dict[str, Any] = {
        "institution_id": institution_id,
        "$or": [
            {"approval.faculty_status": "PENDING"},
            {"approval.faculty_status": "MAPPING_REVIEW"},
            {"authentication.account_status": "IMPORTED_PENDING_FACULTY"},
            {"status": "pending"}
        ]
    }

    # Filter by specific selected class or all assigned classes
    target_class_ids = [class_id] if class_id else scope.get("assigned_class_ids", [])
    scope_conds = []
    for cid in target_class_ids:
        if cid:
            scope_conds.append({"class_id": cid})
            scope_conds.append({"academic_identity.class_id": cid})
    
    if not scope_conds and scope.get("department_id"):
        scope_conds.append({"department_id": scope["department_id"]})
        scope_conds.append({"academic_identity.department_id": scope["department_id"]})
    
    if scope_conds:
        query["$and"] = [{"$or": scope_conds}]

    students_cursor = db.db.students.find(query).sort("roll_number", 1)
    students = await students_cursor.to_list(length=1000)

    result = []
    for st in students:
        st["id"] = str(st["_id"])
        del st["_id"]
        result.append(st)

    return {
        "faculty_scope": scope,
        "pending_students": result
    }

@router.post("/students/{student_id}/approve", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def approve_student_canonical(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    update_fields = {
        "approval.faculty_status": "APPROVED",
        "approval.approved_at": datetime.now(timezone.utc).isoformat(),
        "approval.approved_by": current_user["user_id"],
        "authentication.account_status": "READY_FOR_FIRST_LOGIN",
        "status": "verified",
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "verified_by": current_user["user_id"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_fields})

    await log_audit_event(
        action="faculty_approved_student",
        actor=current_user["email"],
        actor_role="Faculty",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"roll_number": student.get("roll_number") or student.get("student_id")}
    )

    return {"message": "Student registration verified and approved successfully."}

@router.post("/students/{student_id}/reject", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def reject_student_canonical(
    student_id: str,
    feedback: str = "Details could not be verified.",
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    update_fields = {
        "approval.faculty_status": "REJECTED",
        "approval.rejection_reason": feedback,
        "authentication.account_status": "SUSPENDED",
        "status": "rejected",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.db.students.update_one(id_query(student_id), {"$set": update_fields})

    await log_audit_event(
        action="faculty_rejected_student",
        actor=current_user["email"],
        actor_role="Faculty",
        entity_type="Student",
        entity_id=student_id,
        institution_id=institution_id,
        details={"reason": feedback}
    )

    return {"message": "Student registration rejected."}

# ── Backward Compatible Reviews Endpoints ────────────────────────────────────

@router.get("/reviews/pending", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def get_pending_reviews(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    scope = await get_faculty_assigned_scope(current_user["user_id"])
    department_id = scope["department_id"] or ""
    class_id = scope["class_id"] or ""

    # 1. Fetch pending student submissions (from both collections for smooth fallback)
    submissions_cursor = db.db.student_pending_submissions.find({
        "institution_id": institution_id,
        "$or": [
            {"department_id": department_id},
            {"class_id": class_id}
        ] if department_id or class_id else {},
        "status": "pending"
    }).sort("roll_number", 1)
    submissions = await submissions_cursor.to_list(length=1000)
    for sub in submissions:
        sub["id"] = str(sub["_id"])
        del sub["_id"]

    # Also include students collection records that are IMPORTED_PENDING_FACULTY
    canonical_pending = await db.db.students.find({
        "institution_id": institution_id,
        "$or": [
            {"approval.faculty_status": "PENDING"},
            {"approval.faculty_status": "MAPPING_REVIEW"},
            {"authentication.account_status": "IMPORTED_PENDING_FACULTY"}
        ]
    }).to_list(length=1000)

    for c_sub in canonical_pending:
        c_id = str(c_sub["_id"])
        if not any(s["id"] == c_id for s in submissions):
            c_sub["id"] = c_id
            del c_sub["_id"]
            submissions.append(c_sub)

    # 2. Fetch pending profile updates
    updates_cursor = db.db.student_pending_updates.find({
        "institution_id": institution_id,
        "status": "pending"
    })
    updates = await updates_cursor.to_list(length=1000)
    for upd in updates:
        upd["id"] = str(upd["_id"])
        del upd["_id"]

    return {
        "department_id": department_id,
        "submissions": submissions,
        "updates": updates
    }

@router.post("/reviews/submissions/{submission_id}/approve", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def approve_submission(
    submission_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    # Try updating students collection first
    res = await db.db.students.update_one(
        id_query(submission_id),
        {"$set": {
            "approval.faculty_status": "APPROVED",
            "approval.approved_at": datetime.now(timezone.utc).isoformat(),
            "approval.approved_by": current_user["user_id"],
            "authentication.account_status": "READY_FOR_FIRST_LOGIN",
            "status": "verified",
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "verified_by": current_user["user_id"]
        }}
    )
    
    # Also clean up student_pending_submissions if present
    sub = await db.db.student_pending_submissions.find_one(id_query(submission_id))
    if sub:
        await db.db.student_pending_submissions.delete_one(id_query(submission_id))
        
    await log_audit_event(
        action="student_registration_approved",
        actor=current_user["email"],
        actor_role="Faculty",
        entity_type="Student",
        entity_id=submission_id,
        institution_id=institution_id
    )
    return {"message": "Student registration approved and student account activated for login."}

@router.put("/reviews/submissions/{submission_id}", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def edit_pending_submission(
    submission_id: str,
    payload: FacultyStudentUpdatePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if update_data:
        await db.db.students.update_one(id_query(submission_id), {"$set": update_data})
        await db.db.student_pending_submissions.update_one(id_query(submission_id), {"$set": update_data})
    return {"message": "Pending submission updated successfully."}

@router.post("/reviews/submissions/{submission_id}/reject", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def reject_submission(
    submission_id: str,
    feedback: str = "Details could not be verified.",
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    await db.db.students.update_one(
        id_query(submission_id),
        {"$set": {"approval.faculty_status": "REJECTED", "approval.rejection_reason": feedback, "status": "rejected"}}
    )
    await db.db.student_pending_submissions.update_one(
        id_query(submission_id),
        {"$set": {"status": "rejected", "rejection_reason": feedback}}
    )
    return {"message": "Student registration rejected."}

@router.post("/reviews/updates/{update_id}/approve", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def approve_update(
    update_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    update = await db.db.student_pending_updates.find_one(id_query(update_id))
    if not update:
        raise HTTPException(status_code=404, detail="Update request not found.")
        
    student_id = update["student_id"]
    await db.db.students.update_one(id_query(student_id), {"$set": update["requested_changes"]})
    await db.db.student_pending_updates.delete_one(id_query(update_id))
    return {"message": "Student profile updates applied successfully."}

@router.post("/reviews/updates/{update_id}/reject", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def reject_update(
    update_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    await db.db.student_pending_updates.delete_one(id_query(update_id))
    return {"message": "Student profile updates rejected."}

from app.services.academic_timeline_service import get_student_academic_status

@router.get("/students", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def get_students(
    class_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    scope = await get_faculty_assigned_scope(current_user["user_id"])
    query: Dict[str, Any] = {"institution_id": institution_id}

    target_class_ids = [class_id] if class_id else scope.get("assigned_class_ids", [])
    scope_conds = []
    for cid in target_class_ids:
        if cid:
            scope_conds.append({"class_id": cid})
            scope_conds.append({"academic_identity.class_id": cid})

    if not scope_conds and scope.get("department_id"):
        scope_conds.append({"department_id": scope["department_id"]})
        scope_conds.append({"academic_identity.department_id": scope["department_id"]})

    if scope_conds:
        query["$and"] = [{"$or": scope_conds}]

    students_cursor = db.db.students.find(query)
    students = await students_cursor.to_list(length=1000)
    now_utc = datetime.now(timezone.utc)

    result_students = []
    for std in students:
        std["id"] = str(std["_id"])
        del std["_id"]
        if "password_hash" in std:
            del std["password_hash"]
        
        derived = await get_student_academic_status(std, current_date=now_utc, institute_id=institution_id)
        std["derived_academic_status"] = derived
        std["batch_label"] = derived["batch_label"]
        std["current_study_year"] = derived["current_study_year"]
        std["current_semester"] = derived["current_semester"]
        result_students.append(std)
        
    return {
        "department_id": scope["department_id"],
        "class_options": scope.get("class_options", []),
        "students": result_students
    }

@router.put("/students/{student_id}", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def update_student_by_faculty(
    student_id: str,
    payload: FacultyStudentUpdatePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not update_data:
        return {"message": "No fields to update."}
        
    await db.db.students.update_one(id_query(student_id), {"$set": update_data})
    return {"message": "Student updated successfully."}
