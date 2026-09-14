from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from app.db.connection import db
from app.db.utils import id_query, parse_id

def evaluate_student_eligibility(
    student: Dict[str, Any],
    drive: Dict[str, Any],
    derived_status: Optional[Dict[str, Any]] = None
) -> Tuple[bool, List[str]]:
    """
    Evaluates whether a student meets the structured requirements of a placement drive,
    including academic batch, study year, semester, graduation year, and academic flags.
    Returns (is_eligible: bool, failure_reasons: List[str]).
    """
    reasons = []

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
    if drive_passout and student_grad_year:
        try:
            if int(student_grad_year) != int(drive_passout):
                reasons.append(f"Graduation year mismatch: Required {drive_passout}, found {student_grad_year}")
        except ValueError:
            pass

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
        if not batch_match:
            reasons.append(f"Academic Batch '{st_batch_label or 'N/A'}' is not targeted for this drive")

    # 3. Study Year check (min_study_year, max_study_year)
    st_study_year = derived_status.get("current_study_year") if derived_status else (
        acad_id.get("current_study_year") or student.get("current_study_year")
    )
    min_study_year = drive.get("min_study_year")
    if min_study_year is not None and st_study_year is not None:
        if int(st_study_year) < int(min_study_year):
            reasons.append(f"Current study year ({st_study_year} Year) is below required minimum ({min_study_year} Year)")

    max_study_year = drive.get("max_study_year")
    if max_study_year is not None and st_study_year is not None:
        if int(st_study_year) > int(max_study_year):
            reasons.append(f"Current study year ({st_study_year} Year) exceeds maximum allowed ({max_study_year} Year)")

    # 4. Specific Semester check
    target_semesters = drive.get("specific_semesters") or []
    if target_semesters:
        st_sem = derived_status.get("current_semester") if derived_status else (
            acad_id.get("current_semester") or student.get("current_semester")
        )
        if st_sem is not None and int(st_sem) not in [int(s) for s in target_semesters]:
            reasons.append(f"Current semester ({st_sem} Sem) is not targeted for this drive")

    # 5. Program check
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
        if not prog_match:
            reasons.append("Degree / Program not eligible for this drive")

    # 6. Department check
    allowed_depts = drive.get("allowed_departments") or []
    if allowed_depts:
        st_dept_id = str(acad_id.get("department_id") or student.get("department_id") or "")
        st_dept_name = (acad_id.get("department_name") or student.get("department_name") or "").lower()
        
        dept_match = False
        for ad in allowed_depts:
            ad_str = str(ad).lower()
            if ad_str == st_dept_id.lower() or ad_str == st_dept_name or ad_str in st_dept_name:
                dept_match = True
                break
        if not dept_match:
            reasons.append("Department / Branch not eligible for this drive")

    # 7. Class Section check
    allowed_classes = drive.get("allowed_classes") or []
    if allowed_classes:
        st_cls_id = str(acad_id.get("class_id") or student.get("class_id") or "")
        st_cls_name = (acad_id.get("class_name") or student.get("class_name") or "").lower()
        
        cls_match = False
        for ac in allowed_classes:
            ac_str = str(ac).lower()
            if ac_str == st_cls_id.lower() or ac_str == st_cls_name or ac_str in st_cls_name:
                cls_match = True
                break
        if not cls_match:
            reasons.append("Class / Section not eligible for this drive")

    # 8. UG CGPA check
    min_cgpa = float(drive.get("min_cgpa") or 0.0)
    st_cgpa = float(
        student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa") or
        student.get("cgpa") or
        0.0
    )
    if min_cgpa > 0.0 and st_cgpa < min_cgpa:
        reasons.append(f"UG CGPA {st_cgpa} is below minimum requirement of {min_cgpa}")

    # 9. Backlogs check
    max_backlogs = int(drive.get("max_backlogs") if drive.get("max_backlogs") is not None else (drive.get("max_active_backlogs") or 99))
    st_backlogs = int(
        student.get("eligibility_data", {}).get("current_backlogs") if student.get("eligibility_data") is not None
        else (student.get("active_backlogs") or 0)
    )
    if st_backlogs > max_backlogs:
        reasons.append(f"Current backlogs ({st_backlogs}) exceed maximum allowed ({max_backlogs})")

    # 10. Education Gap check
    edu_gap_allowed = drive.get("education_gap_allowed", True)
    if edu_gap_allowed is False:
        st_gap = (
            student.get("eligibility_data", {}).get("education_gap") or
            student.get("academic_flags", {}).get("gaps_education") or
            "No"
        )
        if str(st_gap).lower().startswith("y"):
            reasons.append("Education gap not allowed for this drive")

    # 11. First Attempt Status check
    first_attempt_required = drive.get("first_attempt_required", False)
    if first_attempt_required:
        st_attempt = (
            student.get("eligibility_data", {}).get("first_attempt_status") or
            student.get("academic_flags", {}).get("cleared_first_attempt") or
            "Yes"
        )
        if str(st_attempt).lower().startswith("n"):
            reasons.append("All papers cleared in first attempt required")

    # 12. Gender Filter
    gender_filter = drive.get("gender_filter", "All")
    if gender_filter and gender_filter != "All":
        st_gender = (student.get("identity", {}).get("gender") or student.get("gender") or "").lower()
        if gender_filter.lower() != st_gender:
            reasons.append(f"Drive restricted to {gender_filter} candidates")

    # 13. Secondary (10th) Percentage check
    min_10th = drive.get("min_tenth_percentage")
    if min_10th:
        st_10th = student.get("education", {}).get("secondary", {}).get("normalized_percentage")
        if st_10th is not None and st_10th < float(min_10th):
            reasons.append(f"10th score {st_10th}% is below minimum {min_10th}%")

    # 14. Higher Secondary / 12th Percentage check
    min_12th = drive.get("min_twelfth_percentage")
    if min_12th:
        st_12th = student.get("education", {}).get("higher_secondary_or_diploma", {}).get("normalized_percentage")
        if st_12th is not None and st_12th < float(min_12th):
            reasons.append(f"12th score {st_12th}% is below minimum {min_12th}%")

    return (len(reasons) == 0, reasons)

async def get_eligible_students_for_drive(drive_id: str, institution_id: str) -> List[Dict[str, Any]]:
    """Retrieves all eligible active students for a placement drive using derived timeline status."""
    drive = await db.db.placement_drives.find_one(id_query(drive_id))
    if not drive:
        return []

    query = {
        "institution_id": institution_id,
        "status": {"$in": ["verified", "approved", "APPROVED"]}
    }
    
    students_cursor = db.db.students.find(query)
    all_students = await students_cursor.to_list(length=5000)

    from app.services.academic_timeline_service import get_student_academic_status
    now_utc = datetime.now(timezone.utc)

    eligible_list = []
    for st in all_students:
        derived_status = await get_student_academic_status(st, current_date=now_utc, institute_id=institution_id)
        is_el, reasons = evaluate_student_eligibility(st, drive, derived_status=derived_status)
        if is_el:
            st["id"] = str(st["_id"])
            st["derived_academic_status"] = derived_status
            eligible_list.append(st)

    return eligible_list
