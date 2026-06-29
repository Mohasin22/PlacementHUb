from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import io

router = APIRouter()

VALID_STATUSES = ["Applied", "Shortlisted", "On-Hold", "Rejected", "Placed"]


class ApplicationStatusUpdate(BaseModel):
    status: str

class ExportFieldsPayload(BaseModel):
    fields: List[str]

class BulkStatusUpdate(BaseModel):
    application_ids: List[str]
    status: str

class PlaceStudentPayload(BaseModel):
    offer_letter_url: Optional[str] = None
    ctc_offered: Optional[str] = None
    joining_date: Optional[str] = None


# ── TPO Drive Listing ────────────────────────────────────────────────────────
@router.get("/drives", dependencies=[Depends(RoleChecker(["TPO"]))])
async def list_tpo_drives(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    """List all placement drives created under this institution with applicant stats."""
    drives_cursor = db.db.placement_drives.find({"institution_id": institution_id})
    drives = await drives_cursor.to_list(length=200)
    now = datetime.now(timezone.utc)
    result = []
    for d in drives:
        drive_id = str(d["_id"])
        total_apps = await db.db.applications.count_documents({"drive_id": drive_id})
        shortlisted = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Shortlisted"})
        placed = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Placed"})
        rejected = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Rejected"})
        deadline = d["drive_deadline"]
        if hasattr(deadline, "tzinfo") and deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        result.append({
            "id": drive_id,
            "company_name": d["company_name"],
            "job_role": d["job_role"],
            "package": d["package"],
            "location": d["location"],
            "mode": d["mode"],
            "min_cgpa": d["min_cgpa"],
            "max_backlogs": d["max_backlogs"],
            "drive_deadline": d["drive_deadline"],
            "is_active": deadline > now,
            "total_applicants": total_apps,
            "shortlisted": shortlisted,
            "placed": placed,
            "rejected": rejected,
            "external_apply_link": d.get("external_apply_link"),
        })
    return result


# ── Drive Stats ──────────────────────────────────────────────────────────────
@router.get("/drives/{drive_id}/stats", dependencies=[Depends(RoleChecker(["TPO"]))])
async def get_drive_stats(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    drive = await db.db.placement_drives.find_one({"_id": ObjectId(drive_id), "institution_id": institution_id})
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found.")
    total = await db.db.applications.count_documents({"drive_id": drive_id})
    shortlisted = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Shortlisted"})
    placed = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Placed"})
    rejected = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Rejected"})
    applied = await db.db.applications.count_documents({"drive_id": drive_id, "status": "Applied"})
    return {
        "drive_id": drive_id,
        "company_name": drive["company_name"],
        "job_role": drive["job_role"],
        "package": drive["package"],
        "total_applicants": total,
        "applied": applied,
        "shortlisted": shortlisted,
        "placed": placed,
        "rejected": rejected,
        "conversion_rate": round(placed / total * 100, 1) if total else 0,
    }


# ── Drive Applications ───────────────────────────────────────────────────────
@router.get("/drives/{drive_id}/applications", dependencies=[Depends(RoleChecker(["TPO"]))])
async def get_drive_applications(
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    drive = await db.db.placement_drives.find_one({"_id": ObjectId(drive_id), "institution_id": institution_id})
    if not drive:
        raise HTTPException(status_code=404, detail="Placement drive not found.")
    apps_cursor = db.db.applications.find({"drive_id": drive_id, "institution_id": institution_id})
    apps = await apps_cursor.to_list(length=1000)
    app_details = []
    for app in apps:
        student = await db.db.students.find_one({"_id": ObjectId(app["student_id"])})
        if student:
            app_details.append({
                "application_id": str(app["_id"]),
                "student_id": app["student_id"],
                "name": student.get("name"),
                "roll_number": student.get("roll_number"),
                "department_name": student.get("department_name"),
                "cgpa": student.get("cgpa"),
                "mobile": student.get("mobile"),
                "resume_url": student.get("resume_url"),
                "skills": student.get("skills", []),
                "applied_at": app["applied_at"],
                "status": app["status"],
                "offer_letter_url": app.get("offer_letter_url"),
                "ctc_offered": app.get("ctc_offered"),
            })
    return app_details


# ── Single Application Status Update ────────────────────────────────────────
@router.post("/applications/{application_id}/status", dependencies=[Depends(RoleChecker(["TPO"]))])
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Valid values: {VALID_STATUSES}")
    app = await db.db.applications.find_one({"_id": ObjectId(application_id), "institution_id": institution_id})
    if not app:
        raise HTTPException(status_code=404, detail="Application record not found.")
    await db.db.applications.update_one(
        {"_id": ObjectId(application_id)},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}}
    )
    await db.db.audit_logs.insert_one({
        "action": f"application_status_update_{payload.status.lower()}",
        "institution_id": institution_id,
        "email": current_user["email"],
        "user_id": current_user["user_id"],
        "role": "TPO",
        "application_id": application_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    })
    return {"message": f"Application status updated to {payload.status}."}


# ── Bulk Status Update ───────────────────────────────────────────────────────
@router.post("/drives/{drive_id}/bulk-status", dependencies=[Depends(RoleChecker(["TPO"]))])
async def bulk_update_status(
    drive_id: str,
    payload: BulkStatusUpdate,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Valid values: {VALID_STATUSES}")
    if not payload.application_ids:
        raise HTTPException(status_code=400, detail="No application IDs provided.")
    updated = 0
    for app_id in payload.application_ids:
        try:
            result = await db.db.applications.update_one(
                {"_id": ObjectId(app_id), "institution_id": institution_id},
                {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}}
            )
            if result.modified_count:
                updated += 1
        except Exception:
            continue
    await db.db.audit_logs.insert_one({
        "action": f"bulk_status_update_{payload.status.lower()}",
        "institution_id": institution_id,
        "user_id": current_user["user_id"],
        "role": "TPO",
        "drive_id": drive_id,
        "count": updated,
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    })
    return {"message": f"{updated} application(s) updated to {payload.status}."}


# ── Place Student with Offer Details ────────────────────────────────────────
@router.post("/applications/{application_id}/place", dependencies=[Depends(RoleChecker(["TPO"]))])
async def place_student(
    application_id: str,
    payload: PlaceStudentPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    app = await db.db.applications.find_one({"_id": ObjectId(application_id), "institution_id": institution_id})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    update_data: dict = {
        "status": "Placed",
        "placed_at": datetime.now(timezone.utc),
        "placed_by": current_user["user_id"],
    }
    if payload.offer_letter_url:
        update_data["offer_letter_url"] = payload.offer_letter_url
    if payload.ctc_offered:
        update_data["ctc_offered"] = payload.ctc_offered
    if payload.joining_date:
        update_data["joining_date"] = payload.joining_date
    await db.db.applications.update_one({"_id": ObjectId(application_id)}, {"$set": update_data})
    await db.db.audit_logs.insert_one({
        "action": "student_placed",
        "institution_id": institution_id,
        "user_id": current_user["user_id"],
        "role": "TPO",
        "application_id": application_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    })
    return {"message": "Student marked as Placed with offer details recorded."}


# ── Dynamic Excel Export ─────────────────────────────────────────────────────
@router.post("/drives/{drive_id}/export", dependencies=[Depends(RoleChecker(["TPO"]))])
async def export_drive_applications(
    drive_id: str,
    payload: ExportFieldsPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    drive = await db.db.placement_drives.find_one({"_id": ObjectId(drive_id), "institution_id": institution_id})
    if not drive:
        raise HTTPException(status_code=404, detail="Drive not found.")
    apps_cursor = db.db.applications.find({"drive_id": drive_id, "institution_id": institution_id})
    apps = await apps_cursor.to_list(length=1000)

    wb = Workbook()
    ws = wb.active
    ws.title = "Applications"

    # Styled header row
    header_fill = PatternFill(start_color="5C2D91", end_color="5C2D91", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    ws.append(payload.fields)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for app in apps:
        student = await db.db.students.find_one({"_id": ObjectId(app["student_id"])})
        if not student:
            continue
        row = []
        for field in payload.fields:
            if field == "Name":             row.append(student.get("name", ""))
            elif field == "Roll Number":    row.append(student.get("roll_number", ""))
            elif field == "Personal Email": row.append(student.get("emails", {}).get("personal", ""))
            elif field == "Institute Email":row.append(student.get("emails", {}).get("institute", ""))
            elif field == "CGPA":           row.append(student.get("cgpa", 0.0))
            elif field == "Mobile":         row.append(student.get("mobile", ""))
            elif field == "Resume Link":    row.append(student.get("resume_url", ""))
            elif field == "Active Backlogs":row.append(student.get("active_backlogs", 0))
            elif field == "Total Backlogs": row.append(student.get("total_backlogs", 0))
            elif field == "Skills":         row.append(", ".join(student.get("skills", [])))
            elif field == "Department":     row.append(student.get("department_name", ""))
            elif field == "Program":        row.append(student.get("program_name", ""))
            elif field == "Status":         row.append(app.get("status", ""))
            elif field == "CTC Offered":    row.append(app.get("ctc_offered", ""))
            elif field == "Offer Letter":   row.append(app.get("offer_letter_url", ""))
            else: row.append("")
        ws.append(row)

    # Auto-fit column widths
    for column in ws.columns:
        max_len = max((len(str(cell.value)) for cell in column if cell.value), default=10)
        ws.column_dimensions[column[0].column_letter].width = min(max_len + 4, 50)

    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    await db.db.audit_logs.insert_one({
        "action": "tpo_applications_exported",
        "institution_id": institution_id,
        "email": current_user["email"],
        "user_id": current_user["user_id"],
        "role": "TPO",
        "drive_id": drive_id,
        "fields_exported": payload.fields,
        "timestamp": datetime.now(timezone.utc),
        "status": "success",
    })
    filename = f"{drive['company_name'].replace(' ','_')}_{drive['job_role'].replace(' ','_')}_HR_Report.xlsx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
