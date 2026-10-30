from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from app.db.connection import db
from app.db.utils import id_query, parse_id, sanitize_student_record
from app.services.department_normalizer import are_departments_equivalent


def evaluate_student_eligibility(
    student: Dict[str, Any],
    drive: Dict[str, Any],
    derived_status: Optional[Dict[str, Any]] = None
) -> Tuple[bool, List[str]]:
    """
    Evaluates whether a student meets the structured requirements of a placement drive,
    including academic batch, study year, semester, graduation year, current backlogs,
    historical backlogs, and academic flags.
    Returns (is_eligible: bool, failure_reasons: List[str]).
    """
    is_eligible, reasons, _ = evaluate_student_eligibility_detailed(student, drive, derived_status)
    return is_eligible, reasons

def evaluate_student_eligibility_detailed(
    student: Dict[str, Any],
    drive: Dict[str, Any],
    derived_status: Optional[Dict[str, Any]] = None
) -> Tuple[bool, List[str], List[Dict[str, Any]]]:
    """
    Evaluates student eligibility with itemized explanation breakdown per requirement.
    Returns:
        (is_eligible: bool, failure_reasons: List[str], criteria_breakdown: List[Dict[str, Any]])
    where criteria_breakdown contains:
        [{"criterion": "UG CGPA", "status": "PASS"|"FAIL", "detail": "..."}, ...]
    """
    reasons = []
    breakdown = []

    acad_id = student.get("academic_identity") or {}

    # 1. Graduation / Passout Year check
    drive_passout = drive.get("passout_year") or drive.get("graduation_year")
    student_grad_year = (
        acad_id.get("expected_graduation_year") or
        acad_id.get("graduation_year") or
        student.get("expected_graduation_year") or
        student.get("passout_year") or
        student.get("graduation_year")
    )
    if drive_passout:
        if student_grad_year and str(student_grad_year).isdigit() and str(drive_passout).isdigit():
            if int(student_grad_year) == int(drive_passout):
                breakdown.append({"criterion": "Graduation Year", "status": "PASS", "detail": f"Matched {drive_passout}"})
            else:
                msg = f"Graduation year mismatch: Required {drive_passout}, found {student_grad_year}"
                reasons.append(msg)
                breakdown.append({"criterion": "Graduation Year", "status": "FAIL", "detail": msg})

    # 2. Academic Batch check (e.g. target_batches: ["2023-2027", "batch_id_1"])
    target_batches = drive.get("target_batches") or []
    if target_batches:
        st_batch_id = str(acad_id.get("academic_batch_id") or student.get("academic_batch_id") or "")
        st_batch_label = str(acad_id.get("batch_label") or student.get("batch_label") or "").strip()

        batch_match = False
        for tb in target_batches:
            tb_str = str(tb).strip()
            if tb_str.lower() == st_batch_id.lower() or tb_str.lower() == st_batch_label.lower():
                batch_match = True
                break
        if batch_match:
            breakdown.append({"criterion": "Academic Batch", "status": "PASS", "detail": f"Batch '{st_batch_label or st_batch_id}' targeted"})
        else:
            msg = f"Academic Batch '{st_batch_label or 'N/A'}' is not targeted for this drive"
            reasons.append(msg)
            breakdown.append({"criterion": "Academic Batch", "status": "FAIL", "detail": msg})

    # 3. Study Year check (min_study_year, max_study_year)
    st_study_year = derived_status.get("current_study_year") if derived_status else (
        acad_id.get("current_study_year") or student.get("current_study_year")
    )
    min_study_year = drive.get("min_study_year")
    if min_study_year is not None and st_study_year is not None:
        if int(st_study_year) >= int(min_study_year):
            breakdown.append({"criterion": "Minimum Study Year", "status": "PASS", "detail": f"Current: {st_study_year} Year >= {min_study_year}"})
        else:
            msg = f"Current study year ({st_study_year} Year) is below required minimum ({min_study_year} Year)"
            reasons.append(msg)
            breakdown.append({"criterion": "Minimum Study Year", "status": "FAIL", "detail": msg})

    max_study_year = drive.get("max_study_year")
    if max_study_year is not None and st_study_year is not None:
        if int(st_study_year) <= int(max_study_year):
            breakdown.append({"criterion": "Maximum Study Year", "status": "PASS", "detail": f"Current: {st_study_year} Year <= {max_study_year}"})
        else:
            msg = f"Current study year ({st_study_year} Year) exceeds maximum allowed ({max_study_year} Year)"
            reasons.append(msg)
            breakdown.append({"criterion": "Maximum Study Year", "status": "FAIL", "detail": msg})

    # 4. Program check
    allowed_progs = drive.get("allowed_programs") or []
    if allowed_progs:
        st_prog_id = str(acad_id.get("program_id") or student.get("program_id") or "")
        st_prog_name = (acad_id.get("program_name") or student.get("program_name") or "").lower()

        prog_match = False
        for ap in allowed_progs:
            ap_str = str(ap).lower()
            if ap_str == st_prog_id.lower() or ap_str == st_prog_name or ap_str in st_prog_name:
                prog_match = True
                break
        if prog_match:
            breakdown.append({"criterion": "Program / Degree", "status": "PASS", "detail": "Eligible program"})
        else:
            msg = "Degree / Program not eligible for this drive"
            reasons.append(msg)
            breakdown.append({"criterion": "Program / Degree", "status": "FAIL", "detail": msg})

    # 5. Department check
    allowed_depts = drive.get("allowed_departments") or []
    if allowed_depts:
        st_dept_id = str(acad_id.get("department_id") or student.get("department_id") or "")
        st_dept_name = (
            acad_id.get("department_name") or student.get("department_name") or
            acad_id.get("department") or student.get("department") or
            acad_id.get("branch") or student.get("branch") or ""
        ).lower()

        dept_match = False
        for ad in allowed_depts:
            ad_str = str(ad).strip()
            if (ad_str.lower() == st_dept_id.lower() or
                ad_str.lower() == st_dept_name or
                (st_dept_name and ad_str.lower() in st_dept_name) or
                are_departments_equivalent(ad_str, st_dept_name)):
                dept_match = True
                break
        if dept_match:
            breakdown.append({"criterion": "Department / Branch", "status": "PASS", "detail": "Eligible department"})
        else:
            msg = "Department / Branch not eligible for this drive"
            reasons.append(msg)
            breakdown.append({"criterion": "Department / Branch", "status": "FAIL", "detail": msg})

    # 6. UG CGPA check
    min_cgpa = float(drive.get("min_cgpa") or 0.0)
    st_cgpa = float(
        student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa") or
        student.get("cgpa") or
        0.0
    )
    if min_cgpa > 0.0:
        if st_cgpa >= min_cgpa:
            breakdown.append({"criterion": "UG CGPA", "status": "PASS", "detail": f"CGPA {st_cgpa} >= required {min_cgpa}"})
        else:
            msg = f"UG CGPA {st_cgpa} is below minimum requirement of {min_cgpa}"
            reasons.append(msg)
            breakdown.append({"criterion": "UG CGPA", "status": "FAIL", "detail": msg})

    # 7. UG Percentage check
    min_ug_pct = drive.get("min_ug_percentage")
    if min_ug_pct:
        st_ug_pct = student.get("education", {}).get("undergraduate", {}).get("normalized_percentage")
        if st_ug_pct is not None:
            if float(st_ug_pct) >= float(min_ug_pct):
                breakdown.append({"criterion": "UG Percentage", "status": "PASS", "detail": f"{st_ug_pct}% >= {min_ug_pct}%"})
            else:
                msg = f"UG score {st_ug_pct}% is below required {min_ug_pct}%"
                reasons.append(msg)
                breakdown.append({"criterion": "UG Percentage", "status": "FAIL", "detail": msg})

    # 8. Current Active Backlogs check (Requirement 7 & 9)
    max_active_backlogs = int(
        drive.get("max_active_backlogs") if drive.get("max_active_backlogs") is not None
        else (drive.get("max_backlogs") if drive.get("max_backlogs") is not None else 99)
    )
    st_active_backlogs = int(
        student.get("active_backlogs") if student.get("active_backlogs") is not None
        else (student.get("eligibility_data", {}).get("current_backlogs") if student.get("eligibility_data") is not None else 0)
    )
    if st_active_backlogs <= max_active_backlogs:
        breakdown.append({"criterion": "Current Active Backlogs", "status": "PASS", "detail": f"Active: {st_active_backlogs} <= max allowed {max_active_backlogs}"})
    else:
        msg = f"Current active backlogs ({st_active_backlogs}) exceed maximum allowed ({max_active_backlogs})"
        reasons.append(msg)
        breakdown.append({"criterion": "Current Active Backlogs", "status": "FAIL", "detail": msg})

    # 9. Historical Backlogs check (Requirement 7 & 8 & 9)
    # Check whether historical backlogs are allowed at all
    historical_backlogs_allowed = drive.get("historical_backlogs_allowed")
    if historical_backlogs_allowed is False:
        st_total_backlogs = int(
            student.get("total_backlogs") if student.get("total_backlogs") is not None
            else (student.get("eligibility_data", {}).get("backlog_count") if student.get("eligibility_data") is not None else 0)
        )
        if st_total_backlogs > 0:
            msg = f"Historical backlogs are not allowed for this drive (Student has {st_total_backlogs} historical backlogs)"
            reasons.append(msg)
            breakdown.append({"criterion": "Historical Backlogs Policy", "status": "FAIL", "detail": msg})
        else:
            breakdown.append({"criterion": "Historical Backlogs Policy", "status": "PASS", "detail": "Clean history (0 historical backlogs)"})

    max_total_backlogs = drive.get("max_total_backlogs")
    if max_total_backlogs is not None:
        st_total_backlogs = int(
            student.get("total_backlogs") if student.get("total_backlogs") is not None
            else (student.get("eligibility_data", {}).get("backlog_count") if student.get("eligibility_data") is not None else 0)
        )
        if st_total_backlogs <= int(max_total_backlogs):
            breakdown.append({"criterion": "Total Backlogs", "status": "PASS", "detail": f"Total: {st_total_backlogs} <= max {max_total_backlogs}"})
        else:
            msg = f"Total backlogs ({st_total_backlogs}) exceed maximum allowed ({max_total_backlogs})"
            reasons.append(msg)
            breakdown.append({"criterion": "Total Backlogs", "status": "FAIL", "detail": msg})

    # 10. Secondary (10th) Percentage check
    min_10th = drive.get("min_tenth_percentage")
    if min_10th:
        sec_edu = student.get("education", {}).get("secondary") if isinstance(student.get("education"), dict) else None
        st_10th = sec_edu.get("normalized_percentage") if sec_edu else student.get("tenth_percentage")
        if st_10th is not None:
            if float(st_10th) >= float(min_10th):
                breakdown.append({"criterion": "10th Percentage", "status": "PASS", "detail": f"{st_10th}% >= {min_10th}%"})
            else:
                msg = f"10th score {st_10th}% is below minimum {min_10th}%"
                reasons.append(msg)
                breakdown.append({"criterion": "10th Percentage", "status": "FAIL", "detail": msg})

    # 11. Higher Secondary / 12th Percentage check
    min_12th = drive.get("min_twelfth_percentage")
    if min_12th:
        twelfth_edu = student.get("education", {}).get("higher_secondary_or_diploma") if isinstance(student.get("education"), dict) else None
        st_12th = twelfth_edu.get("normalized_percentage") if twelfth_edu else student.get("twelfth_percentage")
        if st_12th is not None:
            if float(st_12th) >= float(min_12th):
                breakdown.append({"criterion": "12th Percentage", "status": "PASS", "detail": f"{st_12th}% >= {min_12th}%"})
            else:
                msg = f"12th score {st_12th}% is below minimum {min_12th}%"
                reasons.append(msg)
                breakdown.append({"criterion": "12th Percentage", "status": "FAIL", "detail": msg})

    # 12. Education Gap check
    edu_gap_allowed = drive.get("education_gap_allowed", True)
    if edu_gap_allowed is False:
        st_gap = (
            student.get("eligibility_data", {}).get("education_gap") or
            student.get("academic_flags", {}).get("gaps_education") or
            "No"
        )
        if str(st_gap).lower().startswith("y"):
            msg = "Education gap not allowed for this drive"
            reasons.append(msg)
            breakdown.append({"criterion": "Education Gap", "status": "FAIL", "detail": msg})
        else:
            breakdown.append({"criterion": "Education Gap", "status": "PASS", "detail": "No education gap"})

    # 13. First Attempt Status check
    first_attempt_required = drive.get("first_attempt_required", False)
    if first_attempt_required:
        st_attempt = (
            student.get("eligibility_data", {}).get("first_attempt_status") or
            student.get("academic_flags", {}).get("cleared_first_attempt") or
            "Yes"
        )
        if str(st_attempt).lower().startswith("n"):
            msg = "All papers cleared in first attempt required"
            reasons.append(msg)
            breakdown.append({"criterion": "First Attempt Status", "status": "FAIL", "detail": msg})
        else:
            breakdown.append({"criterion": "First Attempt Status", "status": "PASS", "detail": "All papers cleared in first attempt"})

    # 14. Gender Filter
    gender_filter = drive.get("gender_filter", "All")
    if gender_filter and gender_filter != "All":
        st_gender = (student.get("identity", {}).get("gender") or student.get("gender") or "").lower()
        if gender_filter.lower() == st_gender:
            breakdown.append({"criterion": "Gender Filter", "status": "PASS", "detail": f"Matched {gender_filter}"})
        else:
            msg = f"Drive restricted to {gender_filter} candidates"
            reasons.append(msg)
            breakdown.append({"criterion": "Gender Filter", "status": "FAIL", "detail": msg})

    is_eligible = len(reasons) == 0
    return is_eligible, reasons, breakdown

async def get_eligible_students_for_drive(drive_id: str, institution_id: str) -> List[Dict[str, Any]]:
    """Retrieves all eligible active students for a placement drive using derived timeline status."""
    drive = await db.db.placement_drives.find_one(id_query(drive_id))
    if not drive:
        return []

    query = {
        "institution_id": institution_id,
        "status": {"$nin": ["blocked", "rejected", "inactive", "BLOCKED", "REJECTED"]}
    }

    students_cursor = db.db.students.find(query)
    all_students = await students_cursor.to_list(length=5000)

    from app.services.academic_timeline_service import get_student_academic_status, ensure_default_academic_calendar
    now_utc = datetime.now(timezone.utc)

    # Performance optimization: prefetch academic calendar and programs once for this institution
    cached_cal = await db.db.academic_calendars.find_one({"institution_id": institution_id, "active": True})
    if not cached_cal:
        cached_cal = await ensure_default_academic_calendar(institution_id)

    raw_progs = await db.db.programs.find({"institution_id": institution_id}).to_list(length=100)
    cached_progs = {}
    for p in raw_progs:
        cached_progs[str(p["_id"])] = p
        if "id" in p:
            cached_progs[str(p["id"])] = p

    eligible_list = []
    for st in all_students:
        derived_status = await get_student_academic_status(
            st,
            current_date=now_utc,
            institute_id=institution_id,
            cached_calendar=cached_cal,
            cached_programs=cached_progs
        )
        is_el, reasons, breakdown = evaluate_student_eligibility_detailed(st, drive, derived_status=derived_status)
        if is_el:
            st["id"] = str(st["_id"])
            st["derived_academic_status"] = derived_status
            st["eligibility_breakdown"] = breakdown
            eligible_list.append(sanitize_student_record(st))

    return eligible_list
