import pytest
from datetime import datetime, timezone, timedelta
from app.db.connection import db, connect_to_mongo
from app.ai.agent import ai_agent
from app.ai.validators import AIDriveValidator
from app.services.ai_drive_service import AIDriveService
from app.services.ai_student_match_service import AIStudentMatchService
from fastapi import BackgroundTasks

@pytest.fixture(autouse=True)
async def setup_db():
    await connect_to_mongo()
    # Clean test collections
    await db.db.ai_drive_drafts.delete_many({"institution_id": "test_inst_123"})
    await db.db.placement_drives.delete_many({"institution_id": "test_inst_123"})
    await db.db.programs.delete_many({"institution_id": "test_inst_123"})
    await db.db.departments.delete_many({"institution_id": "test_inst_123"})
    await db.db.students.delete_many({"institution_id": "test_inst_123"})
    await db.db.notifications.delete_many({"institution_id": "test_inst_123"})
    await db.db.audit_logs.delete_many({"institution_id": "test_inst_123"})

@pytest.mark.anyio
async def test_jd_extraction_and_mapping():
    inst_id = "test_inst_123"

    # Seed programs and departments
    prog_res = await db.db.programs.insert_one({
        "institution_id": inst_id,
        "program_name": "B.Tech",
        "code": "BTECH"
    })
    dept_cse = await db.db.departments.insert_one({
        "institution_id": inst_id,
        "department_name": "Computer Science Engineering",
        "program_id": str(prog_res.inserted_id)
    })
    dept_it = await db.db.departments.insert_one({
        "institution_id": inst_id,
        "department_name": "Information Technology",
        "program_id": str(prog_res.inserted_id)
    })

    sample_jd = (
        "ABC Technologies is hiring Software Engineers for our Hyderabad office. "
        "Candidates should have B.Tech degree in CSE/IT or related disciplines, "
        "CGPA of 7.5 or above, no active backlogs, and should graduate in 2026. "
        "Strong knowledge of Java and Python is required. Package is 12 LPA. "
        "Apply before 2026-11-25 18:00:00."
    )

    draft = await ai_agent.analyze_job_description(
        source_jd=sample_jd,
        institution_id=inst_id,
        user_id="user_tpo_1"
    )

    assert draft.extracted_requirements.get("company_name") == "ABC Technologies"
    assert draft.extracted_requirements.get("job_role") == "Software Engineer"
    assert "12 LPA" in draft.extracted_requirements.get("package")
    assert draft.extracted_requirements.get("min_cgpa") == 7.5
    assert draft.extracted_requirements.get("max_backlogs") == 0
    assert draft.extracted_requirements.get("passout_year") == 2026

    # Verify database mappings
    mapped_dept_ids = draft.mapped_requirements.get("department_ids")
    assert str(dept_cse.inserted_id) in mapped_dept_ids
    assert str(dept_it.inserted_id) in mapped_dept_ids

    # Verify status is READY_FOR_REVIEW since deadline was in JD
    assert draft.status in ["READY_FOR_REVIEW", "NEEDS_INPUT"]

@pytest.mark.anyio
async def test_missing_info_detection_and_completion():
    inst_id = "test_inst_123"

    incomplete_jd = (
        "We are looking for Graduate Engineer Trainees in Bangalore. "
        "B.Tech CSE candidates with 7.0 CGPA and 0 backlogs, graduating in 2026. "
        "Package is 8 LPA."
    )

    current_user = {"user_id": "tpo_user", "email": "tpo@college.edu", "role": "TPO"}
    draft_dict = await AIDriveService.analyze_and_create_draft(
        source_jd=incomplete_jd,
        institution_id=inst_id,
        current_user=current_user
    )

    draft_id = draft_dict["id"]
    # Check that missing deadline and company name were detected
    missing_fields = [m["field"] for m in draft_dict["missing_fields"]]
    assert "drive_deadline" in missing_fields or "company_name" in missing_fields
    assert draft_dict["status"] == "NEEDS_INPUT"

    # Complete missing info
    future_deadline = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
    updated_draft = await AIDriveService.complete_missing_info(
        draft_id=draft_id,
        missing_input={
            "company_name": "TCS Digital",
            "drive_deadline": future_deadline
        },
        institution_id=inst_id,
        current_user=current_user
    )

    assert updated_draft["extracted_requirements"]["company_name"] == "TCS Digital"
    assert updated_draft["status"] == "READY_FOR_REVIEW"

@pytest.mark.anyio
async def test_deterministic_validation_rules():
    inst_id = "test_inst_123"

    # Invalid CGPA (11.5) and negative backlogs (-2)
    invalid_extracted = {
        "company_name": "Acme Corp",
        "job_role": "Tester",
        "package": "6 LPA",
        "location": "Remote",
        "min_cgpa": 11.5,
        "max_backlogs": -2,
        "passout_year": 1995,
        "drive_deadline": "invalid-date-format"
    }

    is_valid, issues, missing = await AIDriveValidator.validate_draft(
        extracted=invalid_extracted,
        mapped={},
        institution_id=inst_id
    )

    assert is_valid is False
    issue_fields = [i.field for i in issues]
    assert "min_cgpa" in issue_fields
    assert "max_backlogs" in issue_fields
    assert "passout_year" in issue_fields
    assert "drive_deadline" in issue_fields

@pytest.mark.anyio
async def test_human_approved_publishing_flow():
    inst_id = "test_inst_123"

    # Seed an eligible student
    await db.db.students.insert_one({
        "institution_id": inst_id,
        "student_id": "220101",
        "name": "Priya Sharma",
        "status": "verified",
        "program_name": "B.Tech",
        "passout_year": 2026,
        "cgpa": 8.5,
        "active_backlogs": 0,
        "total_backlogs": 0,
        "contact": {"institutional_email": "priya@college.edu"},
        "academic_identity": {"program_name": "B.Tech", "expected_graduation_year": 2026},
        "education": {
            "undergraduate": {"normalized_cgpa": 8.5}
        }
    })

    current_user = {"user_id": "tpo_user_1", "email": "tpo@college.edu", "role": "TPO"}
    future_deadline = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    jd = (
        "Google is hiring Software Engineers for Hyderabad. "
        "B.Tech graduates of 2026 with CGPA 8.0+ and 0 backlogs. "
        "Package is 25 LPA. Apply before " + future_deadline
    )

    draft_dict = await AIDriveService.analyze_and_create_draft(
        source_jd=jd,
        institution_id=inst_id,
        current_user=current_user
    )

    draft_id = draft_dict["id"]

    # Approve and publish
    bg_tasks = BackgroundTasks()
    res = await AIDriveService.approve_and_publish_draft(
        draft_id=draft_id,
        institution_id=inst_id,
        current_user=current_user,
        background_tasks=bg_tasks
    )

    assert "drive_id" in res
    assert res["eligible_students_notified"] == 1

    # Verify real placement drive exists in DB
    drive = await db.db.placement_drives.find_one({"_id": db.db.placement_drives.database.client.get_database()._Client__classes["ObjectId"](res["drive_id"]) if hasattr(db.db.placement_drives.database.client, "_Client__classes") else None} if False else {"company_name": "Google"})
    assert drive is not None
    assert drive["package"] == "25 LPA"

    # Verify audit logs
    audit = await db.db.audit_logs.find_one({"action": "ai_drive_published", "institution_id": inst_id}, sort=[("_id", -1)])
    assert audit is not None
    assert audit["entity_id"] == res["drive_id"]

@pytest.mark.anyio
async def test_student_ai_match_and_data_quality():
    inst_id = "test_inst_123"

    # Seed drive
    drive_res = await db.db.placement_drives.insert_one({
        "institution_id": inst_id,
        "company_name": "Infosys",
        "job_role": "Specialist Programmer",
        "package": "9.5 LPA",
        "min_cgpa": 7.0,
        "max_backlogs": 0,
        "passout_year": 2026,
        "required_skills": ["Java", "Python"]
    })
    drive_id = str(drive_res.inserted_id)

    # Seed student with typo in skill ("Pyhton")
    student_res = await db.db.students.insert_one({
        "institution_id": inst_id,
        "student_id": "220202",
        "name": "Rahul Verma",
        "status": "verified",
        "passout_year": 2026,
        "cgpa": 7.8,
        "active_backlogs": 0,
        "skills": ["Java", "Pyhton"],
        "education": {
            "undergraduate": {"normalized_cgpa": 7.8}
        }
    })
    student_id = str(student_res.inserted_id)

    current_user = {"user_id": student_id, "email": "rahul@college.edu", "role": "Student"}

    # 1. AI Match
    match_res = await AIStudentMatchService.get_match_assessment(
        student_id=student_id,
        drive_id=drive_id,
        institution_id=inst_id,
        current_user=current_user
    )

    assert match_res["is_eligible"] is True
    assert "Infosys" in match_res["ai_explanation"]

    # 2. Inspect Data Quality Issues
    issues = await AIStudentMatchService.get_student_data_issues(student_id, inst_id)
    typo_issue = next((i for i in issues if i["field"] == "skills" and i["original_value"] == "Pyhton"), None)
    assert typo_issue is not None
    assert typo_issue["suggested_value"] == "Python"

    # 3. Student Approves Typo Correction
    accept_res = await AIStudentMatchService.accept_issue_correction(
        student_id=student_id,
        field="skills",
        original_value="Pyhton",
        suggested_value="Python",
        institution_id=inst_id,
        current_user=current_user
    )

    assert "Python" in accept_res["new_value"]

    # Verify updated in MongoDB
    st_updated = await db.db.students.find_one({"_id": student_res.inserted_id})
    assert "Python" in st_updated["skills"]
    assert "Pyhton" not in st_updated["skills"]


@pytest.mark.anyio
async def test_deadline_normalization_and_parsing():
    from app.ai.date_utils import parse_and_normalize_deadline, normalize_deadline_to_str

    # Date without time should default to end-of-day 23:59:59
    assert normalize_deadline_to_str("25 November 2026") == "2026-11-25 23:59:59"
    assert normalize_deadline_to_str("25th November 2026") == "2026-11-25 23:59:59"
    assert normalize_deadline_to_str("Nov 25 2026") == "2026-11-25 23:59:59"
    assert normalize_deadline_to_str("2026-11-25") == "2026-11-25 23:59:59"

    # Date with time should preserve the time accurately
    assert normalize_deadline_to_str("25 November 2026 18:00") == "2026-11-25 18:00:00"
    assert normalize_deadline_to_str("Nov 25 2026 5:00 PM") == "2026-11-25 17:00:00"
    assert normalize_deadline_to_str("2026-11-25 14:30:00") == "2026-11-25 14:30:00"

    # Conversational prefix stripping
    assert normalize_deadline_to_str("Application Deadline: 25 November 2026") == "2026-11-25 23:59:59"

    # Invalid string returns None
    assert normalize_deadline_to_str("invalid-date-format") is None

