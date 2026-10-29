import os
import re

backend_dir = os.path.join("placement", "backend")

# ─────────────────────────────────────────────────────────────
# 1. Patch app/routes/faculty.py
# ─────────────────────────────────────────────────────────────
faculty_path = os.path.join(backend_dir, "app", "routes", "faculty.py")
with open(faculty_path, "r", encoding="utf-8") as f:
    fc = f.read()

# Add compare_with_official import
if "from app.services.official_result_service import OfficialResultService" in fc:
    fc = fc.replace(
        "from app.services.official_result_service import OfficialResultService",
        "from app.services.official_result_service import OfficialResultService, compare_with_official"
    )

# Fix N+1 in get_pending_reviews
old_loop = '''    # 2. Enrich submissions with validation report and official comparison
    off_svc = OfficialResultService()
    for sub in submissions:
        sub_id = sub.get("id") or str(sub.get("_id", ""))
        sub["validation_report"] = StudentValidationService.validate_student(sub)
        sub["official_comparison"] = await off_svc.compare_student_with_official(institution_id, sub_id)'''

new_loop = '''    # 2. Batch fetch official results in a single indexed query (N+1 query elimination)
    rolls = [
        str(sub.get("roll_number") or sub.get("student_id") or sub.get("academic_identity", {}).get("roll_number") or "").strip().upper()
        for sub in submissions
    ]
    clean_rolls = [r for r in rolls if r]
    official_map = {}
    if clean_rolls:
        off_cursor = db.db.official_results.find({"institution_id": institution_id, "roll_number": {"$in": clean_rolls}})
        off_records = await off_cursor.to_list(length=len(clean_rolls) + 50)
        official_map = {str(r.get("roll_number", "")).strip().upper(): r for r in off_records}

    for sub in submissions:
        sub_roll = str(sub.get("roll_number") or sub.get("student_id") or sub.get("academic_identity", {}).get("roll_number") or "").strip().upper()
        sub["validation_report"] = StudentValidationService.validate_student(sub)
        sub["official_comparison"] = compare_with_official(sub, official_map.get(sub_roll))'''

if old_loop in fc:
    fc = fc.replace(old_loop, new_loop, 1)

# Fix IDOR in approve_student_canonical
old_appr = '''@router.post("/students/{student_id}/approve", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def approve_student_canonical(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))'''

new_appr = '''@router.post("/students/{student_id}/approve", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def approve_student_canonical(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_appr in fc:
    fc = fc.replace(old_appr, new_appr, 1)

# Fix IDOR in reject_student_canonical
old_rej = '''@router.post("/students/{student_id}/reject", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def reject_student_canonical(
    student_id: str,
    feedback: str = "Details could not be verified.",
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))'''

new_rej = '''@router.post("/students/{student_id}/reject", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def reject_student_canonical(
    student_id: str,
    feedback: str = "Details could not be verified.",
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_rej in fc:
    fc = fc.replace(old_rej, new_rej, 1)

# Fix IDOR in request_changes_student_canonical
old_reqch = '''@router.post("/students/{student_id}/request-changes", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def request_changes_student_canonical(
    student_id: str,
    payload: Optional[ChangeRequestPayload] = None,
    feedback: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    reason = payload.reason if payload and payload.reason else (feedback or "Please correct submitted information.")
    student = await db.db.students.find_one(id_query(student_id))'''

new_reqch = '''@router.post("/students/{student_id}/request-changes", dependencies=[Depends(RoleChecker(["Faculty"]))])
async def request_changes_student_canonical(
    student_id: str,
    payload: Optional[ChangeRequestPayload] = None,
    feedback: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    reason = payload.reason if payload and payload.reason else (feedback or "Please correct submitted information.")
    student = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_reqch in fc:
    fc = fc.replace(old_reqch, new_reqch, 1)

with open(faculty_path, "w", encoding="utf-8") as f:
    f.write(fc)

print("faculty.py patched.")

# ─────────────────────────────────────────────────────────────
# 2. Patch app/routes/drive.py (IDOR & N+1 queries)
# ─────────────────────────────────────────────────────────────
drive_path = os.path.join(backend_dir, "app", "routes", "drive.py")
with open(drive_path, "r", encoding="utf-8") as f:
    dc = f.read()

# Fix update_drive IDOR
dc = dc.replace(
    'res = await db.db.placement_drives.update_one(id_query(drive_id), {"$set": update_doc})',
    'res = await db.db.placement_drives.update_one(id_query(drive_id, {"institution_id": institution_id}), {"$set": update_doc})'
)

# Fix delete_drive IDOR
dc = dc.replace(
    'res = await db.db.placement_drives.delete_one(id_query(drive_id))',
    'res = await db.db.placement_drives.delete_one(id_query(drive_id, {"institution_id": institution_id}))'
)

# Fix N+1 in get_student_drive_feed
old_drive_feed = '''    drive_list = []
    for d in all_drives:
        d_id = str(d["_id"])
        is_eligible, reasons = evaluate_student_eligibility(student, d)
        
        # Check if already applied
        applied = await db.db.applications.find_one({
            "student_id": student_id,
            "drive_id": d_id
        })'''

new_drive_feed = '''    # Pre-fetch all applications for this student in a single batch query (N+1 eliminated)
    apps_cursor = db.db.applications.find({"student_id": student_id, "institution_id": institution_id})
    apps_list = await apps_cursor.to_list(length=len(all_drives) + 50)
    apps_map = {str(a["drive_id"]): a for a in apps_list if a.get("drive_id")}

    drive_list = []
    for d in all_drives:
        d_id = str(d["_id"])
        is_eligible, reasons = evaluate_student_eligibility(student, d)
        applied = apps_map.get(d_id)'''

if old_drive_feed in dc:
    dc = dc.replace(old_drive_feed, new_drive_feed, 1)

# Fix N+1 in track_applications
old_track = '''    track_list = []
    for app in apps:
        drive = await db.db.placement_drives.find_one(id_query(app["drive_id"]))
        if drive:'''

new_track = '''    # Batch load all drives in 1 query (N+1 eliminated)
    raw_drive_ids = [app.get("drive_id") for app in apps if app.get("drive_id")]
    parsed_ids = [parse_id(did) for did in raw_drive_ids] + raw_drive_ids
    drives_cursor = db.db.placement_drives.find({"_id": {"$in": parsed_ids}})
    drives_list = await drives_cursor.to_list(length=len(raw_drive_ids) + 10)
    drive_map = {str(d["_id"]): d for d in drives_list}

    track_list = []
    for app in apps:
        drive = drive_map.get(str(app.get("drive_id")))
        if drive:'''

if old_track in dc:
    dc = dc.replace(old_track, new_track, 1)

with open(drive_path, "w", encoding="utf-8") as f:
    f.write(dc)

print("drive.py patched.")

# ─────────────────────────────────────────────────────────────
# 3. Patch app/routes/tpo.py (IDOR & N+1 queries)
# ─────────────────────────────────────────────────────────────
tpo_path = os.path.join(backend_dir, "app", "routes", "tpo.py")
with open(tpo_path, "r", encoding="utf-8") as f:
    tc = f.read()

# Fix IDOR in get_tpo_student_detail
old_tpo_detail = '''@router.get("/students/{student_id}", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def get_tpo_student_detail(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    """Retrieve full profile details of an individual student for TPO."""
    st = await db.db.students.find_one(id_query(student_id))'''

new_tpo_detail = '''@router.get("/students/{student_id}", dependencies=[Depends(RoleChecker(["TPO", "Dean"]))])
async def get_tpo_student_detail(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id),
):
    """Retrieve full profile details of an individual student for TPO with tenant isolation."""
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_tpo_detail in tc:
    tc = tc.replace(old_tpo_detail, new_tpo_detail, 1)

# Fix N+1 in get_tpo_students (pass cached calendar and programs)
old_tpo_students = '''    now_utc = datetime.now(timezone.utc)
    result = []
    for st in students:
        # Calculate derived status
        derived = await get_student_academic_status(st, current_date=now_utc, institute_id=institution_id)'''

new_tpo_students = '''    now_utc = datetime.now(timezone.utc)
    # Pre-cache academic calendar and programs to eliminate N+1 DB queries inside student loop
    cached_cal = await db.db.academic_calendars.find_one({"institution_id": institution_id, "active": True})
    progs_cursor = db.db.programs.find({"institution_id": institution_id})
    progs_list = await progs_cursor.to_list(length=100)
    cached_progs = {str(p.get("id") or p["_id"]): p for p in progs_list}

    result = []
    for st in students:
        # Calculate derived status using pre-cached calendar and programs
        derived = await get_student_academic_status(
            st,
            current_date=now_utc,
            institute_id=institution_id,
            cached_calendar=cached_cal,
            cached_programs=cached_progs
        )'''

if old_tpo_students in tc:
    tc = tc.replace(old_tpo_students, new_tpo_students, 1)

with open(tpo_path, "w", encoding="utf-8") as f:
    f.write(tc)

print("tpo.py patched.")

# ─────────────────────────────────────────────────────────────
# 4. Patch app/routes/academic.py (IDOR)
# ─────────────────────────────────────────────────────────────
acad_path = os.path.join(backend_dir, "app", "routes", "academic.py")
with open(acad_path, "r", encoding="utf-8") as f:
    ac = f.read()

# Fix activate_academic_calendar IDOR
ac = ac.replace(
    'res = await db.db.academic_calendars.update_one(id_query(calendar_id), {"$set": {"active": True}})',
    'res = await db.db.academic_calendars.update_one(id_query(calendar_id, {"institution_id": institution_id}), {"$set": {"active": True}})'
)

# Fix update_program_structure IDOR
ac = ac.replace(
    'res = await db.db.programs.update_one(id_query(program_id), {"$set": update_data})',
    'res = await db.db.programs.update_one(id_query(program_id, {"institution_id": institution_id}), {"$set": update_data})'
)

# Fix override_academic_status IDOR
old_override = '''    """Allows authorized admin to set study year or semester override (e.g. for year gaps or repeating semester)."""
    student = await db.db.students.find_one(id_query(student_id))'''

new_override = '''    """Allows authorized admin to set study year or semester override with tenant check."""
    student = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_override in ac:
    ac = ac.replace(old_override, new_override, 1)

old_clear_override = '''@router.delete("/students/{student_id}/override", dependencies=[Depends(RoleChecker(["Dean", "TPO"]))])
async def clear_academic_status_override(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id))'''

new_clear_override = '''@router.delete("/students/{student_id}/override", dependencies=[Depends(RoleChecker(["Dean", "TPO"]))])
async def clear_academic_status_override(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    student = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))'''

if old_clear_override in ac:
    ac = ac.replace(old_clear_override, new_clear_override, 1)

with open(acad_path, "w", encoding="utf-8") as f:
    f.write(ac)

print("academic.py patched.")

# ─────────────────────────────────────────────────────────────
# 5. Patch app/routes/gdrive_vault.py (Tenant Isolation)
# ─────────────────────────────────────────────────────────────
vault_path = os.path.join(backend_dir, "app", "routes", "gdrive_vault.py")
with open(vault_path, "r", encoding="utf-8") as f:
    vc = f.read()

old_v_get = '''@router.get("/{student_id}", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def get_student_gdrive_vault(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    vault = await GDriveVaultService.get_or_initialize_vault(student_id)
    return vault'''

new_v_get = '''@router.get("/{student_id}", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def get_student_gdrive_vault(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    vault = await GDriveVaultService.get_or_initialize_vault(student_id)
    return vault'''

if old_v_get in vc:
    vc = vc.replace(old_v_get, new_v_get, 1)

old_v_staff_ai = '''@router.post("/{student_id}/verify-ai", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_run_ai_verification(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    try:'''

new_v_staff_ai = '''@router.post("/{student_id}/verify-ai", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_run_ai_verification(
    student_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    try:'''

if old_v_staff_ai in vc:
    vc = vc.replace(old_v_staff_ai, new_v_staff_ai, 1)

old_v_staff_chk = '''@router.put("/{student_id}/checklist-item", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_update_checklist_item(
    student_id: str,
    payload: UpdateChecklistItemPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    try:'''

new_v_staff_chk = '''@router.put("/{student_id}/checklist-item", dependencies=[Depends(RoleChecker(["Faculty", "TPO", "Dean"]))])
async def staff_update_checklist_item(
    student_id: str,
    payload: UpdateChecklistItemPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    st = await db.db.students.find_one(id_query(student_id, {"institution_id": institution_id}))
    if not st:
        raise HTTPException(status_code=404, detail="Student not found under this institution.")
    try:'''

if old_v_staff_chk in vc:
    vc = vc.replace(old_v_staff_chk, new_v_staff_chk, 1)

with open(vault_path, "w", encoding="utf-8") as f:
    f.write(vc)

print("gdrive_vault.py patched.")

# ─────────────────────────────────────────────────────────────
# 6. Patch app/routes/ai.py (Student ID Verification)
# ─────────────────────────────────────────────────────────────
ai_path = os.path.join(backend_dir, "app", "routes", "ai.py")
with open(ai_path, "r", encoding="utf-8") as f:
    aic = f.read()

old_ai_pass = '''    # If student role, ensure they are requesting their own profile
    if current_user.get("role") == "Student" and current_user.get("user_id") != student_id:
        # Check if student_id matches roll number or id
        pass  # tenant checks in service handles this safely'''

new_ai_pass = '''    # Enforce student identity verification to prevent IDOR
    if current_user.get("role") == "Student":
        curr_id = str(current_user.get("user_id"))
        if curr_id != student_id and parse_id(curr_id) != parse_id(student_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students can only assess their own matching criteria.")'''

if old_ai_pass in aic:
    aic = aic.replace(old_ai_pass, new_ai_pass, 1)

old_ai_appr = '''@router.post("/students/{student_id}/match/{drive_id}/approve", dependencies=[Depends(RoleChecker(["Student"]))])
async def approve_student_match(
    student_id: str,
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):'''

new_ai_appr = '''@router.post("/students/{student_id}/match/{drive_id}/approve", dependencies=[Depends(RoleChecker(["Student"]))])
async def approve_student_match(
    student_id: str,
    drive_id: str,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    curr_id = str(current_user.get("user_id"))
    if curr_id != student_id and parse_id(curr_id) != parse_id(student_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students can only approve match records for their own profile.")'''

if old_ai_appr in aic:
    aic = aic.replace(old_ai_appr, new_ai_appr, 1)

old_ai_issues = '''@router.post("/students/{student_id}/issues/accept", dependencies=[Depends(RoleChecker(["Student", "Faculty"]))])
async def accept_student_data_correction(
    student_id: str,
    payload: AcceptIssueCorrectionPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):'''

new_ai_issues = '''@router.post("/students/{student_id}/issues/accept", dependencies=[Depends(RoleChecker(["Student", "Faculty"]))])
async def accept_student_data_correction(
    student_id: str,
    payload: AcceptIssueCorrectionPayload,
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    if current_user.get("role") == "Student":
        curr_id = str(current_user.get("user_id"))
        if curr_id != student_id and parse_id(curr_id) != parse_id(student_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students can only accept corrections for their own profile.")'''

if old_ai_issues in aic:
    aic = aic.replace(old_ai_issues, new_ai_issues, 1)

with open(ai_path, "w", encoding="utf-8") as f:
    f.write(aic)

print("ai.py patched.")

# ─────────────────────────────────────────────────────────────
# 7. Patch app/routes/resume.py (SSRF Protection)
# ─────────────────────────────────────────────────────────────
resume_path = os.path.join(backend_dir, "app", "routes", "resume.py")
with open(resume_path, "r", encoding="utf-8") as f:
    rc = f.read()

ssrf_helper = '''import socket
import ipaddress
import urllib.parse

def is_safe_external_url(url: str) -> bool:
    """Blocks SSRF to private, loopback, or cloud metadata IP ranges."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.hostname
        if not host:
            return False
        # Disallow localhost / 127.0.0.1 directly
        if host.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"):
            return False
        # Resolve hostname IPs
        _, _, ip_list = socket.gethostbyname_ex(host)
        for ip_str in ip_list:
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False
'''

if "def is_safe_external_url" not in rc:
    rc = ssrf_helper + "\n" + rc

old_ssrf_fetch = '''    # 2. If not found locally, attempt direct fetch if it's an HTTP/HTTPS URL
    if not file_bytes and (resume_url.startswith("http://") or resume_url.startswith("https://")):'''

new_ssrf_fetch = '''    # 2. If not found locally, attempt direct fetch if it's a verified safe external HTTP/HTTPS URL (SSRF protected)
    if not file_bytes and (resume_url.startswith("http://") or resume_url.startswith("https://")) and is_safe_external_url(resume_url):'''

if old_ssrf_fetch in rc:
    rc = rc.replace(old_ssrf_fetch, new_ssrf_fetch, 1)

with open(resume_path, "w", encoding="utf-8") as f:
    f.write(rc)

print("resume.py patched.")

