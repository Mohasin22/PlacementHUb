from fastapi import APIRouter, Depends, HTTPException, status
from app.db.tenant import get_current_user, get_tenant_id, RoleChecker
from app.db.connection import db
from typing import List
from datetime import datetime, timezone
from app.db.utils import id_query, parse_id, sanitize_student_record

router = APIRouter()

require_dean = RoleChecker(["Dean"])


# ── Analytics Overview ──────────────────────────────────────────────────────
@router.get("/stats", dependencies=[Depends(require_dean)])
async def get_dean_stats(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    """
    Returns high-level placement statistics for the institution dashboard.
    """
    # Student counts
    total_students = await db.db.students.count_documents({"institution_id": institution_id})
    verified_students = await db.db.students.count_documents({"institution_id": institution_id, "status": "verified"})
    pending_students = await db.db.student_pending_submissions.count_documents({"institution_id": institution_id, "status": "pending"})

    # Drive counts
    total_drives = await db.db.placement_drives.count_documents({"institution_id": institution_id})
    now = datetime.now(timezone.utc)
    active_drives = await db.db.placement_drives.count_documents({"institution_id": institution_id, "drive_deadline": {"$gt": now}})

    # Application counts
    total_applications = await db.db.applications.count_documents({"institution_id": institution_id})
    placed_students = await db.db.applications.count_documents({"institution_id": institution_id, "status": "Placed"})
    shortlisted_students = await db.db.applications.count_documents({"institution_id": institution_id, "status": "Shortlisted"})

    # User counts
    tpo_count = await db.db.users.count_documents({"institution_id": institution_id, "role": "TPO"})
    faculty_count = await db.db.users.count_documents({"institution_id": institution_id, "role": "Faculty"})

    placement_rate = round((placed_students / total_students * 100), 1) if total_students else 0

    return {
        "students": {
            "total": total_students,
            "verified": verified_students,
            "pending_verification": pending_students,
        },
        "drives": {
            "total": total_drives,
            "active": active_drives,
        },
        "applications": {
            "total": total_applications,
            "placed": placed_students,
            "shortlisted": shortlisted_students,
        },
        "staff": {
            "tpos": tpo_count,
            "faculty": faculty_count,
        },
        "placement_rate_percent": placement_rate,
    }


# ── Department-wise breakdown ────────────────────────────────────────────────
@router.get("/stats/by-department", dependencies=[Depends(require_dean)])
async def get_stats_by_department(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    depts_cursor = db.db.departments.find({"institution_id": institution_id})
    depts = await depts_cursor.to_list(length=100)

    # Batch 1: Aggregate students per department in 1 single query
    st_pipeline = [
        {"$match": {"institution_id": institution_id}},
        {"$group": {"_id": "$department_id", "count": {"$sum": 1}}}
    ]
    st_agg = await db.db.students.aggregate(st_pipeline).to_list(length=500)
    dept_st_counts = {str(r["_id"]): r["count"] for r in st_agg if r.get("_id")}

    # Batch 2: Map students to departments
    st_docs = await db.db.students.find({"institution_id": institution_id}, {"_id": 1, "department_id": 1}).to_list(length=5000)
    student_to_dept = {str(s["_id"]): str(s.get("department_id", "")) for s in st_docs}

    # Batch 3: Aggregate applications by student & status in 1 query
    app_pipeline = [
        {"$match": {"institution_id": institution_id, "status": {"$in": ["Placed", "Shortlisted"]}}},
        {"$group": {"_id": {"student_id": "$student_id", "status": "$status"}, "count": {"$sum": 1}}}
    ]
    app_stats = await db.db.applications.aggregate(app_pipeline).to_list(length=5000)
    dept_placed = {}
    dept_shortlisted = {}
    for a in app_stats:
        sid = str(a["_id"].get("student_id", ""))
        did = student_to_dept.get(sid)
        if did:
            if a["_id"].get("status") == "Placed":
                dept_placed[did] = dept_placed.get(did, 0) + 1
            elif a["_id"].get("status") == "Shortlisted":
                dept_shortlisted[did] = dept_shortlisted.get(did, 0) + 1

    result = []
    for dept in depts:
        dept_id = str(dept["_id"])
        total = dept_st_counts.get(dept_id, 0)
        placed = dept_placed.get(dept_id, 0)
        shortlisted = dept_shortlisted.get(dept_id, 0)
        result.append({
            "department_id": dept_id,
            "department_name": dept.get("department_name") or dept.get("name", "Unknown"),
            "total_students": total,
            "placed": placed,
            "shortlisted": shortlisted,
            "placement_rate": round(placed / total * 100, 1) if total else 0,
        })

    return result


# ── Program-wise breakdown ───────────────────────────────────────────────────
@router.get("/stats/by-program", dependencies=[Depends(require_dean)])
async def get_stats_by_program(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    progs_cursor = db.db.programs.find({"institution_id": institution_id})
    progs = await progs_cursor.to_list(length=100)

    result = []
    for prog in progs:
        prog_id = str(prog["_id"])
        total = await db.db.students.count_documents({"institution_id": institution_id, "program_id": prog_id})
        prog_students_cursor = db.db.students.find({"institution_id": institution_id, "program_id": prog_id}, {"_id": 1})
        prog_students = await prog_students_cursor.to_list(length=1000)
        prog_student_ids = [str(s["_id"]) for s in prog_students]
        prog_placed = await db.db.applications.count_documents({
            "institution_id": institution_id,
            "student_id": {"$in": prog_student_ids},
            "status": "Placed"
        })
        result.append({
            "program_id": prog_id,
            "program_name": prog.get("program_name") or prog.get("name", "Unknown"),
            "total_students": total,
            "placed": prog_placed,
            "placement_rate": round(prog_placed / total * 100, 1) if total else 0,
        })

    return result


# ── Drive activity list ──────────────────────────────────────────────────────
@router.get("/drives", dependencies=[Depends(require_dean)])
async def list_all_drives(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    drives_cursor = db.db.placement_drives.find({"institution_id": institution_id})
    drives = await drives_cursor.to_list(length=200)

    # Batch load all application stats for all drives in 1 aggregation (eliminating N+1 queries)
    pipeline = [
        {"$match": {"institution_id": institution_id}},
        {
            "$group": {
                "_id": {
                    "drive_id": "$drive_id",
                    "status": "$status"
                },
                "count": {"$sum": 1}
            }
        }
    ]
    app_stats = await db.db.applications.aggregate(pipeline).to_list(length=2000)
    counts_map = {}
    for item in app_stats:
        d_id = str(item["_id"].get("drive_id") or "")
        st = str(item["_id"].get("status") or "")
        if d_id not in counts_map:
            counts_map[d_id] = {"total": 0, "Placed": 0}
        counts_map[d_id]["total"] += item["count"]
        if st == "Placed":
            counts_map[d_id]["Placed"] += item["count"]

    result = []
    for d in drives:
        drive_id = str(d["_id"])
        counts = counts_map.get(drive_id, {"total": 0, "Placed": 0})
        applicant_count = counts["total"]
        placed_count = counts["Placed"]
        result.append({
            "id": drive_id,
            "company_name": d["company_name"],
            "job_role": d["job_role"],
            "package": d["package"],
            "location": d["location"],
            "deadline": d["drive_deadline"],
            "applicants": applicant_count,
            "placed": placed_count,
        })

    return result


# ── List all staff (TPOs + Faculty) ─────────────────────────────────────────
@router.get("/users", dependencies=[Depends(require_dean)])
async def list_staff(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    users_cursor = db.db.users.find(
        {"institution_id": institution_id, "role": {"$in": ["TPO", "Faculty"]}, "is_active": {"$ne": False}},
        {"_id": 1, "name": 1, "email": 1, "role": 1, "phone": 1, "program_id": 1, "department_id": 1, "class_id": 1, "created_at": 1}
    )
    users = await users_cursor.to_list(length=200)
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
    return users


# ── Student list ─────────────────────────────────────────────────────────────
@router.get("/students", dependencies=[Depends(require_dean)])
async def list_students(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    students_cursor = db.db.students.find(
        {"institution_id": institution_id}
    )
    students = await students_cursor.to_list(length=2000)
    for s in students:
        s["id"] = str(s["_id"])
        del s["_id"]
        sanitize_student_record(s)
    return students


# ── Notifications list for current user ─────────────────────────────────────
@router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    user_id = current_user["user_id"]
    role = current_user["role"]

    if role == "Student":
        notifs_cursor = db.db.notifications.find(
            {"student_id": user_id, "institution_id": institution_id},
        )
    else:
        notifs_cursor = db.db.notifications.find(
            {"institution_id": institution_id, "student_id": {"$exists": False}},
        )

    notifs = await notifs_cursor.to_list(length=50)
    for n in notifs:
        n["id"] = str(n["_id"])
        del n["_id"]

    return notifs


# ── Mark notification read ───────────────────────────────────────────────────
@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    await db.db.notifications.update_one(
        id_query(notification_id),
        {"$set": {"status": "read"}}
    )
    return {"message": "Notification marked as read."}


# ── Deactivate TPO / Faculty ──────────────────────────────────────────────────
@router.delete("/users/{user_id}", dependencies=[Depends(require_dean)])
async def deactivate_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    user = await db.db.users.find_one(id_query(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.get("role") == "Faculty":
        await db.db.classes.update_many(
            {
                "$or": [
                    {"faculty_coordinator_id": user_id},
                    {"faculty_coordinator_id": parse_id(user_id)},
                    {"faculty_coordinator_id": str(user.get("_id"))}
                ]
            },
            {"$unset": {"faculty_coordinator_id": ""}}
        )

    await db.db.users.delete_one(id_query(user_id))
    await db.db.audit_logs.insert_one({
        "action": "user_removed", "institution_id": institution_id,
        "user_id": current_user["user_id"], "target_user_id": user_id,
        "role": "Dean", "timestamp": datetime.now(timezone.utc), "status": "success",
    })
    return {"message": f"{user['role']} account removed successfully."}

