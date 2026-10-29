from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from app.db.utils import id_query, parse_id
from app.services.excel_importer import process_excel_import
from app.services.audit import log_audit_event
from app.services.duplicate_detection_service import DuplicateDetectionService
from app.services.student_validation_service import StudentValidationService
from app.services.backlog_service import BacklogService
from app.services.verification_service import get_student_for_user, get_verification_status
import pandas as pd
import io
import os
import math
import uuid

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import openpyxl.utils

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()
bulk_router = APIRouter()

# ── Helper: Canonical Template Resolver & Dynamic Generator ─────────────────

def get_standard_template_path() -> Optional[str]:
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "Placement_Portal_Standard_Student_Template.xlsx")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Placement_Portal_Standard_Student_Template.xlsx")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Placement_Portal_Standard_Student_Template.xlsx")),
        os.path.abspath(os.path.join(os.getcwd(), "Placement_Portal_Standard_Student_Template.xlsx")),
        os.path.abspath(os.path.join(os.getcwd(), "..", "Placement_Portal_Standard_Student_Template.xlsx")),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def generate_standard_template_bytes() -> bytes:
    wb = openpyxl.Workbook()
    
    # 1. Main Sheet
    ws = wb.active
    ws.title = "Student_Master_Upload"
    
    headers = [
        "Student ID / Roll Number", "Full Name", "First Name", "Middle Name", "Last Name",
        "Date of Birth", "Gender", "Institutional Email", "Personal Email", "Mobile Number",
        "Program", "Department", "Class / Section", "Year of Passing",
        "Admission Year", "Expected Graduation Year", "Academic Batch",
        "10th Board", "10th School / Institution", "10th Passing Year", "10th Score Type", "10th Score",
        "12th / Diploma Board", "12th / Diploma Institution", "12th / Diploma Passing Year", "12th / Diploma Score Type", "12th / Diploma Score",
        "UG College / Institution", "UG Overall Score Type", "UG Overall Score",
        "Semester 1 SGPA", "Semester 2 SGPA", "Semester 3 SGPA", "Semester 4 SGPA",
        "Semester 5 SGPA", "Semester 6 SGPA", "Semester 7 SGPA", "Semester 8 SGPA",
        "Current Backlogs", "Backlog Count", "Education Gap", "First Attempt Status",
        "Entrance Exam", "Entrance Rank", "Nationality",
        "Profile Photo URL", "Combined Document URL", "Technical Certificates URL", "Achievement Certificates URL"
    ]
    
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    ws.append(headers)
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center
        cell.border = thin_border
        col_letter = openpyxl.utils.get_column_letter(col_num)
        ws.column_dimensions[col_letter].width = max(18, len(headers[col_num - 1]) + 4)

    ws.row_dimensions[1].height = 28

    # Add sample row
    sample_row = [
        "21CS001", "John Doe", "John", "", "Doe",
        "2003-05-14", "Male", "john.doe@gtu.edu", "johndoe@gmail.com", "9876543210",
        "B.Tech", "Computer Engineering", "CS-A", "2025",
        "2021", "2025", "2021-2025",
        "CBSE", "Delhi Public School", "2019", "Percentage", "88.5",
        "GSEB", "St. Xavier High School", "2021", "Percentage", "85.0",
        "Gujarat Technological University", "CGPA", "8.75",
        "8.50", "8.60", "8.70", "8.80", "8.90", "8.95", "", "",
        "No", "0", "No", "Yes",
        "GUJCET", "1420", "Indian",
        "https://example.com/photos/21cs001.jpg", "https://example.com/docs/21cs001_all.pdf", "", ""
    ]
    ws.append(sample_row)

    # 2. Field Guide Sheet
    ws_guide = wb.create_sheet(title="Field_Guide")
    ws_guide.append(["Column Header", "Requirement", "Allowed / Expected Values", "Description"])
    for cell in ws_guide[1]:
        cell.fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
        cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    
    field_guide_rows = [
        ("Student ID / Roll Number", "Required", "Alphanumeric string (e.g. 21CS001)", "Unique student registration or roll number"),
        ("Full Name", "Required", "String", "Full student name as per official records"),
        ("Institutional Email", "Recommended", "Valid email address", "Official college domain email for notifications"),
        ("Personal Email", "Recommended", "Valid email address", "Student primary personal email"),
        ("Program", "Required", "e.g. B.Tech, M.Tech, MBA, MCA, Diploma", "Academic degree program"),
        ("Department", "Required", "e.g. Computer Engineering, Mechanical", "Academic department name"),
        ("Class / Section", "Required", "e.g. CS-A, CS-B, Sec-1", "Class and section designation"),
        ("Admission Year", "Optional (System Derived)", "e.g. 2021", "Year of enrollment into program"),
        ("Expected Graduation Year", "Optional (System Derived)", "e.g. 2025", "Expected passout year"),
        ("Academic Batch", "Optional (System Derived)", "e.g. 2021-2025", "Canonical academic cohort label"),
        ("10th Score Type", "Required if score given", "Percentage / CGPA / Marks", "Grading format for secondary schooling"),
        ("10th Score", "Required", "Number (e.g. 88.5 or 9.2)", "Normalized secondary score"),
        ("12th / Diploma Score Type", "Required if score given", "Percentage / CGPA / Marks", "Grading format for higher secondary / diploma"),
        ("12th / Diploma Score", "Required", "Number (e.g. 85.0 or 8.8)", "Normalized higher secondary score"),
        ("UG Overall Score", "Required for active UG", "CGPA (0.00 - 10.00)", "Cumulative grade point average"),
    ]
    for r in field_guide_rows:
        ws_guide.append(list(r))
    for col in ws_guide.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        ws_guide.column_dimensions[openpyxl.utils.get_column_letter(col[0].column)].width = max(max_len + 4, 15)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()

async def serve_standard_template_response():
    template_path = get_standard_template_path()
    if template_path and os.path.exists(template_path):
        return FileResponse(
            template_path,
            filename="Placement_Portal_Standard_Student_Template.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    content = generate_standard_template_bytes()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Placement_Portal_Standard_Student_Template.xlsx"'}
    )

class BulkCommitPayload(BaseModel):
    temp_file_id: Optional[str] = None
    override_existing: Optional[bool] = True

async def execute_bulk_preview(
    file: UploadFile,
    current_user: dict,
    institution_id: str
):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel workbook (.xlsx, .xls) or CSV.")

    contents = await file.read()
    temp_file_id = str(uuid.uuid4())
    temp_path = os.path.join(UPLOAD_DIR, f"temp_bulk_{temp_file_id}.xlsx")
    with open(temp_path, "wb") as f:
        f.write(contents)

    result = await process_excel_import(
        file_bytes=contents,
        institution_id=institution_id,
        source_filename=file.filename,
        confirm_save=False,
        imported_by_user_id=current_user["user_id"]
    )
    if not result.get("success"):
        if os.path.exists(temp_path):
            try: os.remove(temp_path)
            except Exception: pass
        raise HTTPException(status_code=400, detail=result.get("error", "Validation failed"))

    result["temp_file_id"] = temp_file_id
    return result

async def execute_bulk_commit(
    temp_file_id: Optional[str],
    file: Optional[UploadFile],
    current_user: dict,
    institution_id: str
):
    contents = None
    filename = "bulk_upload.xlsx"
    temp_path = None

    if temp_file_id:
        temp_path = os.path.join(UPLOAD_DIR, f"temp_bulk_{temp_file_id}.xlsx")
        if not os.path.exists(temp_path):
            raise HTTPException(status_code=400, detail="Temporary upload session expired or not found. Please upload the file again.")
        with open(temp_path, "rb") as f:
            contents = f.read()
    elif file is not None:
        filename = file.filename
        contents = await file.read()
    else:
        raise HTTPException(status_code=400, detail="No file or temporary upload session ID provided for commit.")

    result = await process_excel_import(
        file_bytes=contents,
        institution_id=institution_id,
        source_filename=filename,
        confirm_save=True,
        imported_by_user_id=current_user["user_id"]
    )

    if temp_path and os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Import commit failed"))

    summary = result.get("summary", {})
    return {
        "success": True,
        "message": f"Successfully imported {summary.get('inserted_count', 0)} new students and updated {summary.get('updated_count', 0)} existing records.",
        "batch_id": result.get("batch_id"),
        "summary": summary,
        "sample_preview": result.get("sample_preview", []),
        "validation_issues": result.get("validation_issues", [])
    }

# ── 1. Standard Template Excel Import Endpoints ──────────────────────────────

@router.get("/import/template")
@router.get("/template")
async def download_standard_template_students():
    """Serves the canonical master upload Excel workbook."""
    return await serve_standard_template_response()

@bulk_router.get("/template")
async def download_standard_template_bulk():
    """Serves the canonical master upload Excel workbook."""
    return await serve_standard_template_response()

@router.post("/import/preview", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def preview_standard_excel_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Validates the standard 46-column Excel template and returns validation metrics + temp_file_id."""
    return await execute_bulk_preview(file, current_user, institution_id)

@bulk_router.post("/preview", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def preview_bulk_excel(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Validates the standard 46-column Excel template and returns validation metrics + temp_file_id."""
    return await execute_bulk_preview(file, current_user, institution_id)

@router.post("/import/confirm", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
@router.post("/import/commit", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def confirm_standard_excel_import(
    payload: Optional[BulkCommitPayload] = None,
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Executes the standard Excel import and commits canonical records to MongoDB."""
    return await execute_bulk_commit(
        temp_file_id=payload.temp_file_id if payload else None,
        file=file,
        current_user=current_user,
        institution_id=institution_id
    )

@bulk_router.post("/commit", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def commit_bulk_students(
    payload: BulkCommitPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Commits validated temporary bulk upload into MongoDB."""
    return await execute_bulk_commit(
        temp_file_id=payload.temp_file_id,
        file=None,
        current_user=current_user,
        institution_id=institution_id
    )

@bulk_router.post("/confirm", dependencies=[Depends(RoleChecker(["TPO", "Dean", "Faculty"]))])
async def confirm_bulk_students_alias(
    payload: Optional[BulkCommitPayload] = None,
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Alias for committing bulk student upload via temp_file_id or direct file upload."""
    return await execute_bulk_commit(
        temp_file_id=payload.temp_file_id if payload else None,
        file=file,
        current_user=current_user,
        institution_id=institution_id
    )

# ── 2. Student Profile & Correction Requests ─────────────────────────────────

class CorrectionRequestPayload(BaseModel):
    field_name: str
    current_value: Optional[str] = None
    requested_value: str
    reason: str

class StudentUpdatePayload(BaseModel):
    mobile: Optional[str] = None
    cgpa: Optional[float] = None
    active_backlogs: Optional[int] = None
    total_backlogs: Optional[int] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    institute_email: Optional[EmailStr] = None
    personal_email: Optional[EmailStr] = None
    links: Optional[Dict[str, Optional[str]]] = None
    career_preferences: Optional[Dict[str, Any]] = None

from app.services.academic_timeline_service import get_student_academic_status

@router.get("/profile")
async def get_student_profile(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await get_student_for_user(current_user["user_id"], current_user.get("email"))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    
    student["id"] = str(student.get("_id", student.get("id")))
    if "_id" in student:
        del student["_id"]
        
    # Calculate live system-derived academic status
    derived_status = await get_student_academic_status(student, current_date=datetime.now(timezone.utc), institute_id=institution_id)
    student["derived_academic_status"] = derived_status
    student["current_study_year"] = derived_status["current_study_year"]
    student["current_semester"] = derived_status["current_semester"]
    student["batch_label"] = derived_status["batch_label"]

    # Professional Verification Status
    student["verification_status"] = get_verification_status(student)

    # Ensure badges and metadata are available
    edu = student.get("education")
    ug_status = edu.get("undergraduate", {}).get("verification_status") if isinstance(edu, dict) else None
    approval = student.get("approval") if isinstance(student.get("approval"), dict) else {}
    verif = student.get("verification_status") if isinstance(student.get("verification_status"), dict) else {}
    github_conn = bool(verif.get("github", {}).get("connected")) if isinstance(verif.get("github"), dict) else False
    linkedin_conn = bool(verif.get("linkedin", {}).get("connected")) if isinstance(verif.get("linkedin"), dict) else False

    badges = {
        "identity": "VERIFIED" if approval.get("faculty_status") == "APPROVED" else "REQUIRES_REVIEW",
        "academics": "VERIFIED" if ug_status == "VERIFIED" else "REQUIRES_REVIEW",
        "academic_batch": "SYSTEM_DERIVED",
        "study_year": "SYSTEM_DERIVED",
        "skills": "STUDENT_EDITABLE",
        "projects": "STUDENT_EDITABLE",
        "resume": "AI_SUGGESTION" if student.get("resume_scanned") else "STUDENT_EDITABLE",
        "github_verification": "VERIFIED" if github_conn else "NOT_CONNECTED",
        "linkedin_verification": "VERIFIED" if linkedin_conn else "NOT_CONNECTED"
    }
    student["field_badges"] = badges
    return student

@router.put("/profile/update")
async def request_profile_update(
    payload: StudentUpdatePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student_id = current_user["user_id"]
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
        
    update_data = {}
    for k, v in payload.dict().items():
        if v is not None:
            if k == "institute_email":
                update_data["emails.institute"] = v
                update_data["contact.institutional_email"] = v
            elif k == "personal_email":
                update_data["emails.personal"] = v
                update_data["contact.personal_email"] = v
            else:
                update_data[k] = v
                
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    # Validate safe URLs on links & resume
    if payload.links:
        for lk, lu in payload.links.items():
            if lu and not StudentValidationService.is_safe_url(lu):
                raise HTTPException(status_code=400, detail=f"Unsafe URL protocol in {lk}. Only http:// and https:// are allowed.")
    if payload.resume_url and not StudentValidationService.is_safe_url(payload.resume_url):
        raise HTTPException(status_code=400, detail="Unsafe URL protocol in resume link. Only http:// and https:// are allowed.")

    # Validate duplicate student identifiers within institution
    dup_check_data = {
        "personal_email": str(payload.personal_email) if payload.personal_email else None,
        "institute_email": str(payload.institute_email) if payload.institute_email else None,
        "mobile": payload.mobile
    }
    dup_res = await DuplicateDetectionService.check_duplicate(
        institution_id=institution_id,
        student_data=dup_check_data,
        exclude_student_id=student_id
    )
    if dup_res["is_duplicate"]:
        raise HTTPException(
            status_code=400,
            detail=f"Conflict detected: Another student record already exists with matching {', '.join(dup_res['matched_fields'])}."
        )

    # Check if student is modifying dynamic fields directly (skills, projects, links, mobile) vs authoritative fields
    authoritative_fields = {"cgpa", "active_backlogs", "total_backlogs", "dob", "gender"}
    has_authoritative = any(k in authoritative_fields for k in update_data.keys())

    if not has_authoritative:
        # Direct update for dynamic fields!
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.db.students.update_one(id_query(student_id), {"$set": update_data})
        await log_audit_event(
            action="student_profile_direct_update",
            actor=current_user["email"],
            actor_role="Student",
            entity_type="StudentProfile",
            entity_id=student_id,
            institution_id=institution_id,
            details=update_data
        )
        return {"message": "Profile updated successfully."}

    # If authoritative fields are touched, submit to pending faculty review queue
    await db.db.student_pending_updates.delete_many({
        "student_id": student_id,
        "institution_id": institution_id
    })
    
    pending_update_doc = {
        "student_id": student_id,
        "institution_id": institution_id,
        "department_id": student.get("academic_identity", {}).get("department_id") or student.get("department_id"),
        "class_id": student.get("academic_identity", {}).get("class_id") or student.get("class_id"),
        "student_name": student.get("name") or student.get("identity", {}).get("full_name"),
        "roll_number": student.get("roll_number") or student.get("student_id"),
        "requested_changes": update_data,
        "current_state": {k: student.get(k) for k in update_data.keys()},
        "status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat()
    }
    await db.db.student_pending_updates.insert_one(pending_update_doc)
    
    await log_audit_event(
        action="student_profile_update_request",
        actor=current_user["email"],
        actor_role="Student",
        entity_type="StudentPendingUpdate",
        entity_id=student_id,
        institution_id=institution_id,
        details=update_data
    )
    
    return {"message": "Profile update request submitted and is pending Faculty Coordinator review."}

@router.post("/{student_id}/correction-request", dependencies=[Depends(RoleChecker(["Student"]))])
async def submit_academic_correction_request(
    student_id: str,
    payload: CorrectionRequestPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found.")

    req_doc = {
        "student_id": student_id,
        "institution_id": institution_id,
        "roll_number": student.get("roll_number") or student.get("student_id"),
        "student_name": student.get("name") or student.get("identity", {}).get("full_name"),
        "department_id": student.get("academic_identity", {}).get("department_id") or student.get("department_id"),
        "class_id": student.get("academic_identity", {}).get("class_id") or student.get("class_id"),
        "field_name": payload.field_name,
        "current_value": payload.current_value,
        "requested_value": payload.requested_value,
        "reason": payload.reason,
        "status": "PENDING",
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }

    res = await db.db.correction_requests.insert_one(req_doc)
    await log_audit_event(
        action="academic_correction_requested",
        actor=current_user["email"],
        actor_role="Student",
        entity_type="CorrectionRequest",
        entity_id=str(res.inserted_id),
        institution_id=institution_id,
        details=payload.dict()
    )

    return {"message": "Correction request submitted to Faculty Coordinator.", "request_id": str(res.inserted_id)}

# ── 3. Backward Compatible Bulk Upload & Webhook ─────────────────────────────

@router.post("/bulk-upload", dependencies=[Depends(RoleChecker(["TPO", "Faculty", "Dean"]))])
async def bulk_upload_students(
    file: UploadFile = File(...),
    target_type: Optional[str] = Form(None),
    target_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")

    contents = await file.read()
    res = await process_excel_import(
        file_bytes=contents,
        institution_id=institution_id,
        source_filename=file.filename,
        confirm_save=True,
        imported_by_user_id=current_user["user_id"]
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Upload processing failed"))

    summary = res.get("summary", {})
    return {
        "message": f"Successfully processed {summary.get('total_rows', 0)} student records into system, pre-assigned to respective Faculty Coordinators by Department & Class.",
        "inserted": summary.get("inserted_count", 0),
        "updated": summary.get("updated_count", 0),
        "summary": summary
    }

# ── 4. Targeted Seminars / Events for Student ─────────────────────────────────
@router.get("/events", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_student_events(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(current_user["user_id"]))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    prog_id = str(student.get("academic_identity", {}).get("program_id") or student.get("program_id") or "")
    dept_id = str(student.get("academic_identity", {}).get("department_id") or student.get("department_id") or "")
    cls_id = str(student.get("academic_identity", {}).get("class_id") or student.get("class_id") or "")

    query = {
        "institution_id": institution_id,
        "$or": [
            {"target_type": "All"},
            {"target_type": "Program", "target_id": {"$in": [prog_id, parse_id(prog_id)]}},
            {"target_type": "Department", "target_id": {"$in": [dept_id, parse_id(dept_id)]}},
            {"target_type": "Class", "target_id": {"$in": [cls_id, parse_id(cls_id)]}},
        ]
    }

    events_cursor = db.db.events.find(query).sort("created_at", -1)
    events = await events_cursor.to_list(length=100)

    result = []
    for e in events:
        result.append({
            "id": str(e["_id"]),
            "title": e.get("title"),
            "speaker": e.get("speaker"),
            "date_time": e.get("date_time"),
            "venue": e.get("venue"),
            "description": e.get("description"),
            "target_type": e.get("target_type", "All"),
            "created_at": e.get("created_at")
        })

    return result

@router.post("/{student_id}/resume", dependencies=[Depends(RoleChecker(["Student", "TPO", "Faculty", "Dean"]))])
async def update_or_upload_student_resume(
    student_id: str,
    file: Optional[UploadFile] = File(None),
    resume_url: Optional[str] = Form(None),
    doc_type: Optional[str] = Form("resume"),
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Upload a resume file (.pdf/.docx) or certificate or update URL link for a student.
    Allowed for Student (own profile) or TPO, Faculty, Dean.
    """
    if current_user["role"] == "Student" and str(current_user["user_id"]) != student_id and parse_id(str(current_user["user_id"])) != parse_id(student_id):
        raise HTTPException(status_code=403, detail="Students can only update their own documents.")
        
    student = await db.db.students.find_one(id_query(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
        
    final_url = ""
    
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".pdf", ".docx"]:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX document formats are supported.")
            
        file_bytes = await file.read()
        if len(file_bytes) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 15MB limit.")
            
        safe_prefix = "cert" if doc_type in ["tech_certs", "achieve_certs", "technical_certificates", "achievement_certificates"] else "resume"
        unique_filename = f"{safe_prefix}_{uuid.uuid4()}{ext}"
        filepath = os.path.join(UPLOAD_DIR, unique_filename)
        with open(filepath, "wb") as buffer:
            buffer.write(file_bytes)
            
        final_url = f"http://localhost:8000/api/files/download/{unique_filename}"
    elif resume_url and resume_url.strip():
        final_url = resume_url.strip()
    else:
        raise HTTPException(status_code=400, detail="Please provide either a document file or a valid document URL link.")
        
    if doc_type in ["tech_certs", "technical_certificates"]:
        update_data = {
            "documents.technical_certificates": final_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        msg = "Technical certificates updated successfully."
        audit_action = "student_tech_certs_updated"
    elif doc_type in ["achieve_certs", "achievement_certificates"]:
        update_data = {
            "documents.achievement_certificates": final_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        msg = "Achievement certificates updated successfully."
        audit_action = "student_achieve_certs_updated"
    else:
        update_data = {
            "resume_url": final_url,
            "documents.resume": final_url,
            "documents.combined_documents": final_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        msg = "Resume updated successfully."
        audit_action = "student_resume_updated"
        
    await db.db.students.update_one(id_query(student_id), {"$set": update_data})
    
    await log_audit_event(
        action=audit_action,
        actor=current_user["email"],
        actor_role=current_user["role"],
        entity_type="StudentProfile",
        entity_id=student_id,
        institution_id=institution_id,
        details={"url": final_url, "doc_type": doc_type}
    )
    
    return {
        "success": True,
        "message": msg,
        "document_url": final_url,
        "resume_url": final_url
    }

# ── 5. Google Forms Webhook Ingestion with Duplicate & Validation Checks ───────

class GFormWebhookPayload(BaseModel):
    name: Optional[str] = None
    roll_number: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    mobile: Optional[str] = None
    personal_email: Optional[str] = None
    institute_email: Optional[str] = None
    program_name: Optional[str] = None
    department_name: Optional[str] = None
    class_name: Optional[str] = None
    cgpa: Optional[float] = None
    active_backlogs: Optional[int] = 0
    total_backlogs: Optional[int] = 0
    tenth_board: Optional[str] = None
    tenth_percentage: Optional[float] = None
    twelfth_board: Optional[str] = None
    twelfth_percentage: Optional[float] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None

class DuplicateResolvePayload(BaseModel):
    action: str  # CONFIRM_DUPLICATE, KEEP_EXISTING, MERGE, REJECT_WARNING
    notes: Optional[str] = None

@router.post("/webhook/gform/{institution_id}")
async def google_forms_webhook_endpoint(
    institution_id: str,
    payload: GFormWebhookPayload
):
    """
    Ingests Google Forms student submissions.
    Enforces Student Data Validation, Duplicate Detection, and places records
    into the pending faculty verification queue without immediate master record overwrite.
    """
    inst = await db.db.institutions.find_one({"$or": [{"_id": parse_id(institution_id)}, {"id": institution_id}]})
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found.")

    sub_dict = payload.dict()
    
    # 1. Run Data Validation
    validation_res = StudentValidationService.validate_student(sub_dict)
    
    # 2. Run Duplicate Detection across Roll, Emails, Mobile
    dup_res = await DuplicateDetectionService.check_duplicate(
        institution_id=institution_id,
        student_data=sub_dict
    )
    
    dup_record_id = None
    duplicate_status = "UNIQUE"
    if dup_res["is_duplicate"]:
        duplicate_status = dup_res["status"]
        dup_record_id = await DuplicateDetectionService.record_duplicate_warning(
            institution_id=institution_id,
            detection_result=dup_res,
            source="google_forms_webhook",
            source_details={"submitted_roll": payload.roll_number}
        )

    # Resolve hierarchy references if available
    dept = await db.db.departments.find_one({
        "institution_id": institution_id,
        "name": {"$regex": f"^{re.escape(payload.department_name or '')}$", "$options": "i"}
    })
    dept_id = str(dept["_id"]) if dept else None

    cls_obj = None
    if dept_id:
        cls_obj = await db.db.classes.find_one({
            "department_id": dept_id,
            "name": {"$regex": f"^{re.escape(payload.class_name or '')}$", "$options": "i"}
        })
    class_id = str(cls_obj["_id"]) if cls_obj else None

    pending_doc = {
        "institution_id": institution_id,
        "name": payload.name,
        "roll_number": payload.roll_number,
        "dob": payload.dob,
        "gender": payload.gender,
        "mobile": payload.mobile,
        "institute_email": payload.institute_email,
        "personal_email": payload.personal_email,
        "program_name": payload.program_name,
        "department_name": payload.department_name,
        "department_id": dept_id,
        "class_name": payload.class_name,
        "class_id": class_id,
        "cgpa": payload.cgpa or 0.0,
        "active_backlogs": payload.active_backlogs or 0,
        "total_backlogs": payload.total_backlogs or 0,
        "tenth_board": payload.tenth_board,
        "tenth_percentage": payload.tenth_percentage,
        "twelfth_board": payload.twelfth_board,
        "twelfth_percentage": payload.twelfth_percentage,
        "skills": payload.skills or [],
        "projects": payload.projects or [],
        "resume_url": payload.resume_url,
        "photo_url": payload.photo_url,
        "status": "pending",
        "duplicate_status": duplicate_status,
        "duplicate_record_id": dup_record_id,
        "validation_report": validation_res,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }

    res = await db.db.student_pending_submissions.insert_one(pending_doc)

    await log_audit_event(
        action="student_gform_submitted",
        actor=payload.institute_email or payload.personal_email or "google_form",
        actor_role="AnonymousStudent",
        entity_type="StudentPendingSubmission",
        entity_id=str(res.inserted_id),
        institution_id=institution_id,
        details={
            "roll_number": payload.roll_number,
            "duplicate_detected": dup_res["is_duplicate"],
            "validation_status": validation_res["overall_status"]
        }
    )

    return {
        "success": True,
        "message": "Submission received and queued for Faculty Coordinator review.",
        "submission_id": str(res.inserted_id),
        "duplicate_detected": dup_res["is_duplicate"],
        "duplicate_status": duplicate_status,
        "validation_status": validation_res["overall_status"]
    }

# ── 6. Duplicate Student Warnings & Review ────────────────────────────────────

@router.get("/duplicates", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def list_duplicate_student_records(
    status_filter: Optional[str] = None,
    unresolved_only: bool = True,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Lists duplicate student detection warnings for the institution."""
    query: Dict[str, Any] = {"institution_id": institution_id}
    if status_filter:
        query["status"] = status_filter
    elif unresolved_only:
        query["resolved_at"] = None

    cursor = db.db.duplicate_records.find(query).sort("created_at", -1)
    duplicates = await cursor.to_list(length=500)

    for d in duplicates:
        d["id"] = str(d["_id"])
        del d["_id"]
        existing = d.get("existing_record") or {}
        incoming = d.get("incoming_record") or {}
        d["student_name"] = existing.get("name") or incoming.get("name") or "Unknown Student"
        d["roll_number"] = d.get("matched_roll_number") or existing.get("roll_number") or incoming.get("roll_number") or ""
        d["institute_email"] = d.get("matched_email") or existing.get("institute_email") or incoming.get("institute_email") or ""
        d["mobile"] = existing.get("mobile") or incoming.get("mobile") or ""
        d["department"] = existing.get("department") or incoming.get("department") or ""

    return {"duplicates": duplicates, "total": len(duplicates)}

@router.post("/duplicates/{duplicate_id}/resolve", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def resolve_duplicate_student_warning(
    duplicate_id: str,
    payload: DuplicateResolvePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """
    Authorized resolution of duplicate student warning (CONFIRM_DUPLICATE, KEEP_EXISTING, MERGE, REJECT_WARNING).
    Maintains complete audit log.
    """
    res = await DuplicateDetectionService.resolve_duplicate(
        duplicate_id=duplicate_id,
        institution_id=institution_id,
        action=payload.action,
        resolved_by_user=current_user,
        notes=payload.notes
    )
    return res

@router.post("/duplicates/resolve-all", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def resolve_all_duplicate_student_warnings(
    payload: DuplicateResolvePayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Resolves all unresolved duplicate student warnings for the institution."""
    now_iso = datetime.now(timezone.utc).isoformat()
    action = payload.action or "KEEP_EXISTING"
    new_status = {
        "CONFIRM_DUPLICATE": "DUPLICATE_CONFIRMED",
        "KEEP_EXISTING": "RESOLVED_KEPT_EXISTING",
        "MERGE": "RESOLVED_MERGED",
        "REJECT_WARNING": "REJECTED_WARNING_UNIQUE"
    }.get(action, "RESOLVED")

    res = await db.db.duplicate_records.update_many(
        {"institution_id": institution_id, "resolved_at": None},
        {"$set": {
            "status": new_status,
            "resolution_action": action,
            "resolved_at": now_iso,
            "resolved_by": current_user.get("email"),
            "resolved_by_user_id": current_user.get("user_id"),
            "resolution_notes": payload.notes or "Bulk resolved"
        }}
    )
    return {"success": True, "modified_count": res.modified_count, "action": action}

# ── 7. Comprehensive Student Data Validation Reports ──────────────────────────

@router.get("/profile/validation-report", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_my_validation_report(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Returns complete 10-category validation report for the authenticated student."""
    student = await db.db.students.find_one(id_query(current_user["user_id"]))
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return StudentValidationService.validate_student(student)

@router.get("/{student_id}/validation-report", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean", "Student"]))])
async def get_student_validation_report(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Returns complete 10-category validation report for any student within the institution."""
    if current_user["role"] == "Student" and str(current_user["user_id"]) != student_id and parse_id(str(current_user["user_id"])) != parse_id(student_id):
        raise HTTPException(status_code=403, detail="Students may only view their own validation report.")

    student = await db.db.students.find_one({
        "institution_id": institution_id,
        "$or": [{"_id": parse_id(student_id)}, {"id": student_id}, {"student_id": student_id}]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    return StudentValidationService.validate_student(student)

# ── 8. Structured Backlog History ─────────────────────────────────────────────

@router.get("/profile/backlog-history", dependencies=[Depends(RoleChecker(["Student"]))])
async def get_my_backlog_history(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Returns structured backlog history distinguishing active vs historical backlogs."""
    return await BacklogService.get_student_backlog_history(
        student_id=current_user["user_id"],
        institution_id=institution_id
    )

@router.get("/{student_id}/backlog-history", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean", "Student"]))])
async def get_student_backlog_history(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    """Returns structured backlog history for student within the institution."""
    if current_user["role"] == "Student" and str(current_user["user_id"]) != student_id and parse_id(str(current_user["user_id"])) != parse_id(student_id):
        raise HTTPException(status_code=403, detail="Students may only view their own backlog history.")

    return await BacklogService.get_student_backlog_history(
        student_id=student_id,
        institution_id=institution_id
    )

