import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.services.score_normalizer import normalize_academic_score
from app.services.board_conversion_service import DEFAULT_BOARD_RULES

async def run_migration():
    print(f"Connecting to MongoDB at {settings.MONGO_URI} (DB: {settings.MONGO_DB})...")
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB]

    # 1. Ensure default board conversion rules
    print("Ensuring default board conversion rules...")
    count = await db["board_conversion_rules"].count_documents({})
    if count == 0:
        await db["board_conversion_rules"].insert_many(DEFAULT_BOARD_RULES)
        print("Inserted default board conversion rules.")

    # 2. Reconcile Programs with Durations & Semesters
    print("Reconciling Program structures...")
    programs = await db["programs"].find({}).to_list(length=100)
    for p in programs:
        p_name = p.get("program_name") or p.get("name", "")
        duration = 4
        semesters = 8
        if "mba" in p_name.lower() or "m.tech" in p_name.lower() or "mtech" in p_name.lower() or "ms" in p_name.lower():
            duration = 2
            semesters = 4
        elif "mca" in p_name.lower():
            duration = 2
            semesters = 4

        await db["programs"].update_one(
            {"_id": p["_id"]},
            {"$set": {
                "duration_years": p.get("duration_years") or duration,
                "total_semesters": p.get("total_semesters") or semesters,
                "code": p.get("code") or (p_name[:6].upper().replace(" ", "").replace(".", "")),
                "active": True
            }}
        )

    # 3. Ensure Default Academic Calendars for Institutions
    print("Ensuring Default Academic Calendars...")
    institutions = await db["institutions"].find({}).to_list(length=50)
    now = datetime.now(timezone.utc)
    acad_start = now.year if now.month >= 6 else (now.year - 1)
    acad_end = acad_start + 1
    cal_label = f"{acad_start}-{str(acad_end)[-2:]}"

    for inst in institutions:
        inst_id = str(inst.get("id") or inst["_id"])
        cal_exists = await db["academic_calendars"].find_one({"institution_id": inst_id, "active": True})
        if not cal_exists:
            await db["academic_calendars"].insert_one({
                "institution_id": inst_id,
                "academic_year_label": cal_label,
                "start_date": f"{acad_start}-06-01",
                "end_date": f"{acad_end}-05-31",
                "active": True,
                "semester_periods": [
                    {"semester_type": "Odd", "start_date": f"{acad_start}-06-01", "end_date": f"{acad_start}-11-30"},
                    {"semester_type": "Even", "start_date": f"{acad_start}-12-01", "end_date": f"{acad_end}-05-31"}
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    # 4. Migrate and Reconcile Students & Batches
    student_count = await db["students"].count_documents({})
    print(f"Found {student_count} existing students to migrate and reconcile.")

    report = {
        "total_students": student_count,
        "successfully_mapped": 0,
        "needs_batch_mapping": 0,
        "needs_class_mapping": 0,
        "needs_faculty_mapping": 0,
        "needs_manual_review": 0,
        "batches_created": 0,
        "classes_upgraded": 0
    }

    if student_count > 0:
        backup_name = f"students_backup_{now.strftime('%Y%m%d_%H%M%S')}"
        existing_docs = await db["students"].find({}).to_list(length=10000)
        await db[backup_name].insert_many(existing_docs)
        print(f"Backed up {len(existing_docs)} student records to '{backup_name}'.")

        for doc in existing_docs:
            doc_id = doc["_id"]
            inst_id = str(doc.get("institution_id") or doc.get("institute_id") or "")
            prog_id = str(doc.get("program_id") or doc.get("academic_identity", {}).get("program_id") or "")
            dept_id = str(doc.get("department_id") or doc.get("academic_identity", {}).get("department_id") or "")
            class_id = str(doc.get("class_id") or doc.get("academic_identity", {}).get("class_id") or "")
            
            # Program duration
            duration_years = 4
            if prog_id:
                prog_doc = await db["programs"].find_one({"$or": [{"_id": doc_id}, {"id": prog_id}]})
                if prog_doc:
                    duration_years = int(prog_doc.get("duration_years") or 4)

            # Graduation year and admission year
            grad_yr = doc.get("passout_year") or doc.get("graduation_year") or doc.get("academic_identity", {}).get("graduation_year") or 2027
            try:
                grad_yr_int = int(str(grad_yr)[:4])
            except ValueError:
                grad_yr_int = 2027

            adm_yr_int = grad_yr_int - duration_years
            batch_label = f"{adm_yr_int}-{grad_yr_int}"

            # Create or resolve Academic Batch
            batch_id = None
            if inst_id and prog_id:
                batch_query = {
                    "institution_id": inst_id,
                    "admission_year": adm_yr_int,
                    "expected_graduation_year": grad_yr_int
                }
                batch_doc = await db["academic_batches"].find_one(batch_query)
                if not batch_doc:
                    b_res = await db["academic_batches"].insert_one({
                        "institution_id": inst_id,
                        "program_id": prog_id,
                        "admission_year": adm_yr_int,
                        "expected_graduation_year": grad_yr_int,
                        "batch_label": batch_label,
                        "active": True,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    batch_id = str(b_res.inserted_id)
                    report["batches_created"] += 1
                else:
                    batch_id = str(batch_doc["_id"])
            else:
                report["needs_batch_mapping"] += 1

            # Upgrade Class section with batch label and display name
            class_name = doc.get("class_name") or doc.get("academic_identity", {}).get("class_name") or "A"
            display_name = f"{class_name} | {batch_label}" if batch_label else class_name

            if class_id:
                await db["classes"].update_one(
                    {"$or": [{"_id": doc.get("class_id")}, {"id": class_id}]},
                    {"$set": {
                        "academic_batch_id": batch_id,
                        "display_name": display_name,
                        "section_name": class_name
                    }}
                )
                report["classes_upgraded"] += 1
            else:
                report["needs_class_mapping"] += 1

            # Compute derived study year and semester
            cal_start = acad_start
            study_year = (cal_start - adm_yr_int) + 1
            if study_year < 1: study_year = 1
            is_odd = now.month in [6, 7, 8, 9, 10, 11]
            semester = (study_year - 1) * 2 + 1 if is_odd else (study_year - 1) * 2 + 2

            # Normalization of scores
            cgpa_val = doc.get("cgpa")
            ug_norm = normalize_academic_score(cgpa_val, expected_type="CGPA")

            tenth_raw = doc.get("education", {}).get("tenth", {}).get("marks") or doc.get("extra_data", {}).get("10th Marks") or doc.get("extra_data", {}).get("Xth (% or CGPA)")
            tenth_norm = normalize_academic_score(tenth_raw)

            twelfth_raw = doc.get("education", {}).get("twelfth", {}).get("marks") or doc.get("extra_data", {}).get("12th Marks") or doc.get("extra_data", {}).get("XIIth or DIPLOMA(% or CGPA)")
            twelfth_norm = normalize_academic_score(twelfth_raw)

            update_doc = {
                "academic_batch_id": batch_id,
                "batch_label": batch_label,
                "admission_year": adm_yr_int,
                "expected_graduation_year": grad_yr_int,
                "passout_year": grad_yr_int,
                "graduation_year": grad_yr_int,
                "current_study_year": study_year,
                "current_semester": semester,
                "academic_identity.academic_batch_id": batch_id,
                "academic_identity.batch_label": batch_label,
                "academic_identity.admission_year": adm_yr_int,
                "academic_identity.expected_graduation_year": grad_yr_int,
                "academic_identity.graduation_year": grad_yr_int,
                "academic_identity.current_study_year": study_year,
                "academic_identity.current_semester": semester,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            if not doc.get("verified_by"):
                report["needs_faculty_mapping"] += 1
            if tenth_norm.get("verification_status") == "REQUIRES_REVIEW":
                report["needs_manual_review"] += 1

            await db["students"].update_one({"_id": doc_id}, {"$set": update_doc})
            report["successfully_mapped"] += 1

    # 5. Compound Database Indexes
    print("Creating compound indexes...")
    try:
        await db["programs"].create_index([("institution_id", 1), ("code", 1)])
        await db["academic_batches"].create_index([("institution_id", 1), ("program_id", 1), ("admission_year", 1), ("expected_graduation_year", 1)])
        await db["classes"].create_index([("institution_id", 1), ("program_id", 1), ("department_id", 1), ("academic_batch_id", 1), ("section_name", 1)])
        await db["students"].create_index([("institution_id", 1), ("academic_batch_id", 1)])
        await db["students"].create_index([("institution_id", 1), ("class_id", 1)])
        await db["students"].create_index([("institution_id", 1), ("expected_graduation_year", 1)])
        print("Compound indexes created successfully.")
    except Exception as e:
        print(f"Index creation notice: {e}")

    print("\n=======================================================")
    print("           RECONCILIATION MIGRATION REPORT             ")
    print("=======================================================")
    for k, v in report.items():
        print(f"  - {k.replace('_', ' ').title():<30}: {v}")
    print("=======================================================\n")

if __name__ == "__main__":
    asyncio.run(run_migration())
