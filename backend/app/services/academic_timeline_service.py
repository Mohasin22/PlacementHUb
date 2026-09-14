import re
import uuid
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
from app.db.connection import db
from app.db.utils import id_query, parse_id

def parse_academic_year_start(label: str) -> int:
    """Extracts starting year from labels like '2026-27', '2026-2027', '2026'."""
    if not label:
        return datetime.now(timezone.utc).year
    match = re.search(r"(\d{4})", str(label))
    if match:
        return int(match.group(1))
    return datetime.now(timezone.utc).year

def get_ordinal_label(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        suffix = 'th'
    else:
        suffix = ['th', 'st', 'nd', 'rd', 'th'][min(n % 10, 4)]
    return f"{n}{suffix}"

async def ensure_default_academic_calendar(institute_id: str) -> Dict[str, Any]:
    """Ensures at least one active academic calendar exists for the institution."""
    query = {"institution_id": institute_id, "active": True}
    cal = await db.db.academic_calendars.find_one(query)
    if cal:
        return cal

    now = datetime.now(timezone.utc)
    current_year = now.year
    # If before June, academic year is (year-1)-(year), else (year)-(year+1)
    if now.month < 6:
        acad_start = current_year - 1
        acad_end = current_year
    else:
        acad_start = current_year
        acad_end = current_year + 1

    label = f"{acad_start}-{str(acad_end)[-2:]}"
    default_cal = {
        "institution_id": institute_id,
        "academic_year_label": label,
        "start_date": f"{acad_start}-06-01",
        "end_date": f"{acad_end}-05-31",
        "active": True,
        "semester_periods": [
            {"semester_type": "Odd", "start_date": f"{acad_start}-06-01", "end_date": f"{acad_start}-11-30"},
            {"semester_type": "Even", "start_date": f"{acad_start}-12-01", "end_date": f"{acad_end}-05-31"}
        ],
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    res = await db.db.academic_calendars.insert_one(default_cal)
    default_cal["_id"] = res.inserted_id
    return default_cal

async def get_or_create_academic_batch(
    institute_id: str,
    program_id: str,
    admission_year: int,
    expected_graduation_year: int
) -> Dict[str, Any]:
    """Retrieves or auto-creates an academic batch entity."""
    batch_label = f"{admission_year}-{expected_graduation_year}"
    query = {
        "institution_id": institute_id,
        "$or": [
            {"program_id": program_id},
            {"program_id": parse_id(program_id)}
        ],
        "admission_year": admission_year,
        "expected_graduation_year": expected_graduation_year
    }
    
    batch = await db.db.academic_batches.find_one(query)
    if batch:
        batch["id"] = str(batch["_id"])
        return batch

    # Create new academic batch
    batch_doc = {
        "institution_id": institute_id,
        "program_id": str(program_id),
        "admission_year": admission_year,
        "expected_graduation_year": expected_graduation_year,
        "batch_label": batch_label,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    res = await db.db.academic_batches.insert_one(batch_doc)
    batch_doc["_id"] = res.inserted_id
    batch_doc["id"] = str(res.inserted_id)
    return batch_doc

async def get_or_create_class_section(
    institute_id: str,
    program_id: str,
    department_id: str,
    academic_batch_id: str,
    section_name: str,
    faculty_coordinator_id: Optional[str] = None
) -> Dict[str, Any]:
    """Retrieves or auto-creates a batch-specific class section."""
    clean_sec = section_name.strip()
    
    # Retrieve batch label for display name
    batch_doc = await db.db.academic_batches.find_one(id_query(academic_batch_id))
    batch_label = batch_doc.get("batch_label") if batch_doc else ""
    
    display_name = f"{clean_sec} | {batch_label}" if batch_label else clean_sec

    query = {
        "institution_id": institute_id,
        "$or": [{"program_id": program_id}, {"program_id": parse_id(program_id)}],
        "$and": [
            {"$or": [{"department_id": department_id}, {"department_id": parse_id(department_id)}]},
            {"$or": [{"academic_batch_id": academic_batch_id}, {"academic_batch_id": parse_id(academic_batch_id)}]},
            {"$or": [{"class_name": clean_sec}, {"section_name": clean_sec}, {"display_name": display_name}]}
        ]
    }

    cls = await db.db.classes.find_one(query)
    if cls:
        cls["id"] = str(cls["_id"])
        # Update faculty coordinator if not already set
        if faculty_coordinator_id and not cls.get("faculty_coordinator_id"):
            await db.db.classes.update_one(id_query(cls["id"]), {"$set": {"faculty_coordinator_id": faculty_coordinator_id}})
            cls["faculty_coordinator_id"] = faculty_coordinator_id
        return cls

    cls_doc = {
        "institution_id": institute_id,
        "program_id": str(program_id),
        "department_id": str(department_id),
        "academic_batch_id": str(academic_batch_id),
        "section_name": clean_sec,
        "class_name": clean_sec,
        "display_name": display_name,
        "faculty_coordinator_id": faculty_coordinator_id,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    res = await db.db.classes.insert_one(cls_doc)
    cls_doc["_id"] = res.inserted_id
    cls_doc["id"] = str(res.inserted_id)
    return cls_doc

async def get_student_academic_status(
    student: Dict[str, Any],
    current_date: Optional[datetime] = None,
    institute_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Computes system-derived academic status (academic year, current study year, current semester)
    based on admission year, program duration, active academic calendar, and administrative overrides.
    """
    if current_date is None:
        current_date = datetime.now(timezone.utc)
    if current_date.tzinfo is None:
        current_date = current_date.replace(tzinfo=timezone.utc)

    inst_id = institute_id or student.get("institution_id") or student.get("institute_id")

    # 1. Check for Active Administrative Override
    override = (
        student.get("academic_identity", {}).get("academic_status_override") or
        student.get("academic_status_override")
    )
    if override and (override.get("is_active") is True or override.get("is_active") is None):
        overridden_yr = override.get("study_year")
        overridden_sem = override.get("semester")
        if overridden_yr is not None or overridden_sem is not None:
            return {
                "academic_year": override.get("academic_year_label", "Override"),
                "current_study_year": overridden_yr,
                "current_semester": overridden_sem,
                "study_year_label": f"{get_ordinal_label(overridden_yr)} Year" if overridden_yr else "N/A",
                "semester_label": f"{get_ordinal_label(overridden_sem)} Semester" if overridden_sem else "N/A",
                "status_label": f"{get_ordinal_label(overridden_yr)} Year - {get_ordinal_label(overridden_sem)} Sem" if (overridden_yr and overridden_sem) else "Overridden Status",
                "is_overridden": True,
                "override_reason": override.get("reason"),
                "batch_label": student.get("academic_identity", {}).get("batch_label") or student.get("batch_label"),
                "admission_year": student.get("academic_identity", {}).get("admission_year") or student.get("admission_year"),
                "expected_graduation_year": student.get("academic_identity", {}).get("expected_graduation_year") or student.get("passout_year") or student.get("graduation_year")
            }

    # 2. Get Program Duration & Structure
    prog_id = student.get("academic_identity", {}).get("program_id") or student.get("program_id")
    duration_years = 4
    total_semesters = 8
    prog = None

    if prog_id and inst_id:
        prog = await db.db.programs.find_one(id_query(prog_id))
        if prog:
            duration_years = int(prog.get("duration_years") or 4)
            total_semesters = int(prog.get("total_semesters") or (duration_years * 2))

    if not prog:
        # Check program name keywords (MBA, M.Tech -> 2 years, MCA -> 2/3 years)
        prog_name = (student.get("academic_identity", {}).get("program_name") or student.get("program_name") or "").lower()
        if "mba" in prog_name or "m.tech" in prog_name or "mtech" in prog_name or "ms" in prog_name:
            duration_years = 2
            total_semesters = 4
        elif "mca" in prog_name:
            duration_years = 2
            total_semesters = 4

    # 3. Resolve Active Academic Calendar
    acad_cal = None
    if inst_id:
        acad_cal = await db.db.academic_calendars.find_one({"institution_id": inst_id, "active": True})
        if not acad_cal:
            acad_cal = await ensure_default_academic_calendar(inst_id)

    if acad_cal:
        acad_year_label = acad_cal.get("academic_year_label", f"{current_date.year}-{str(current_date.year+1)[-2:]}")
        cal_start_year = parse_academic_year_start(acad_year_label)
    else:
        cal_start_year = current_date.year if current_date.month >= 6 else (current_date.year - 1)
        acad_year_label = f"{cal_start_year}-{str(cal_start_year+1)[-2:]}"

    # 4. Resolve Admission Year & Expected Graduation Year
    adm_yr = student.get("academic_identity", {}).get("admission_year") or student.get("admission_year")
    grad_yr = (
        student.get("academic_identity", {}).get("expected_graduation_year") or
        student.get("academic_identity", {}).get("graduation_year") or
        student.get("passout_year") or
        student.get("graduation_year")
    )

    if not adm_yr and grad_yr:
        try:
            grad_int = int(str(grad_yr)[:4])
            adm_yr = grad_int - duration_years
        except ValueError:
            adm_yr = cal_start_year
    elif not adm_yr:
        adm_yr = cal_start_year

    adm_yr_int = int(adm_yr)
    grad_yr_int = int(grad_yr) if grad_yr else (adm_yr_int + duration_years)
    batch_label = f"{adm_yr_int}-{grad_yr_int}"

    # 5. Derive Current Study Year
    study_year = (cal_start_year - adm_yr_int) + 1
    if study_year < 1:
        study_year = 1
    # Allow study_year to exceed normal duration if student has extended/delayed graduation

    # 6. Derive Current Semester
    # Check if current_date matches Odd vs Even period in active calendar
    is_odd_sem = True
    if acad_cal and acad_cal.get("semester_periods"):
        cur_date_str = current_date.strftime("%Y-%m-%d")
        for period in acad_cal["semester_periods"]:
            s_from = period.get("start_date", "")
            s_to = period.get("end_date", "")
            if s_from and s_to and s_from <= cur_date_str <= s_to:
                if period.get("semester_type") == "Even" or period.get("semester", 0) % 2 == 0:
                    is_odd_sem = False
                break
    else:
        # Fallback by calendar month: June (6) - Nov (11) = Odd, Dec (12) - May (5) = Even
        if current_date.month in [12, 1, 2, 3, 4, 5]:
            is_odd_sem = False

    if is_odd_sem:
        semester = (study_year - 1) * 2 + 1
    else:
        semester = (study_year - 1) * 2 + 2

    return {
        "academic_year": acad_year_label,
        "current_study_year": study_year,
        "current_semester": semester,
        "study_year_label": f"{get_ordinal_label(study_year)} Year",
        "semester_label": f"{get_ordinal_label(semester)} Semester",
        "status_label": f"{get_ordinal_label(study_year)} Year - {get_ordinal_label(semester)} Sem",
        "is_overridden": False,
        "batch_label": batch_label,
        "admission_year": adm_yr_int,
        "expected_graduation_year": grad_yr_int,
        "duration_years": duration_years,
        "total_semesters": total_semesters
    }
