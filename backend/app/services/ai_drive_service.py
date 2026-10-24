import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status, BackgroundTasks

from app.db.connection import db
from app.db.utils import id_query, parse_id
from app.ai.agent import ai_agent
from app.ai.validators import AIDriveValidator
from app.services.audit import log_audit_event
from app.services.eligibility_engine import get_eligible_students_for_drive
from app.services.email import send_drive_notification_email, send_drive_notification_emails_batch
from app.services.department_normalizer import are_departments_equivalent


logger = logging.getLogger(__name__)

class AIDriveService:
    """
    Authoritative service managing the lifecycle of AI Placement Drive Drafts
    and executing human-approved transitions to the live placement_drives collection.
    """

    @staticmethod
    async def analyze_and_create_draft(
        source_jd: str,
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """
        Parses raw JD, executes AI agent mapping and validation,
        and saves an AI draft to MongoDB.
        """
        user_id = current_user.get("user_id", "")
        actor_email = current_user.get("email", "")

        await log_audit_event(
            action="ai_drive_analysis_started",
            actor=actor_email,
            actor_role="TPO",
            entity_type="AIDriveDraft",
            entity_id="pending",
            institution_id=institution_id,
            details={"source_length": len(source_jd)}
        )

        draft_obj = await ai_agent.analyze_job_description(
            source_jd=source_jd,
            institution_id=institution_id,
            user_id=user_id
        )

        draft_dict = draft_obj.to_mongo_dict()
        await db.db.ai_drive_drafts.insert_one(draft_dict)

        await log_audit_event(
            action="ai_drive_draft_created",
            actor=actor_email,
            actor_role="TPO",
            entity_type="AIDriveDraft",
            entity_id=draft_dict["_id"],
            institution_id=institution_id,
            details={
                "status": draft_dict["status"],
                "missing_count": len(draft_dict["missing_fields"]),
                "confidence": draft_dict["confidence_score"]
            }
        )

        # Return with id string
        draft_dict["id"] = str(draft_dict.pop("_id"))
        draft_dict["estimated_eligible_count"] = await AIDriveService.calculate_draft_eligible_count(
            draft_dict.get("extracted_requirements", {}),
            draft_dict.get("mapped_requirements", {}),
            institution_id
        )
        return draft_dict

    @staticmethod
    async def calculate_draft_eligible_count(extracted: dict, mapped: dict, institution_id: str) -> int:
        try:
            from app.services.eligibility_engine import evaluate_student_eligibility_detailed
            dept_ids = mapped.get("department_ids") or []
            dept_names = mapped.get("department_names") or []
            ext_depts = extracted.get("allowed_departments") or []
            combined_depts = list(dict.fromkeys([str(d) for d in (dept_ids + dept_names + ext_depts) if d]))

            prog_ids = mapped.get("program_ids") or []
            prog_names = mapped.get("program_names") or []
            ext_progs = extracted.get("allowed_programs") or []
            combined_progs = list(dict.fromkeys([str(p) for p in (prog_ids + prog_names + ext_progs) if p]))

            passout_val = extracted.get("passout_year")
            try:
                passout_int = int(passout_val) if passout_val is not None else None
            except (ValueError, TypeError):
                passout_int = None

            # Dynamically resolve target_batches for passout_int
            target_batches = mapped.get("target_batches") or []
            if passout_int:
                batches = await db.db.academic_batches.find({
                    "institution_id": institution_id,
                    "expected_graduation_year": passout_int
                }).to_list(length=100)
                if batches:
                    target_batches = [str(b["_id"]) for b in batches]

            mock_drive = {
                "institution_id": institution_id,
                "passout_year": passout_int,
                "min_cgpa": float(extracted.get("min_cgpa") or 0.0),
                "max_backlogs": int(extracted.get("max_backlogs") if extracted.get("max_backlogs") is not None else 99),
                "allowed_departments": combined_depts,
                "allowed_programs": combined_progs,
                "target_batches": target_batches,
                "gender_filter": extracted.get("gender_filter", "All")
            }
            students = await db.db.students.find({
                "institution_id": institution_id,
                "status": {"$nin": ["blocked", "rejected", "inactive", "BLOCKED", "REJECTED"]}
            }).to_list(length=5000)
            return sum(1 for s in students if evaluate_student_eligibility_detailed(s, mock_drive)[0])
        except Exception:
            return 0

    @staticmethod
    async def get_draft(draft_id: str, institution_id: str) -> Dict[str, Any]:
        """Fetches a specific draft strictly enforcing tenant isolation."""
        draft = await db.db.ai_drive_drafts.find_one({
            "$and": [
                id_query(draft_id),
                {"institution_id": institution_id}
            ]
        })
        if not draft:
            raise HTTPException(status_code=404, detail="AI Drive Draft not found.")

        draft["id"] = str(draft.pop("_id"))
        draft["estimated_eligible_count"] = await AIDriveService.calculate_draft_eligible_count(
            draft.get("extracted_requirements", {}),
            draft.get("mapped_requirements", {}),
            institution_id
        )
        return draft

    @staticmethod
    async def list_drafts(institution_id: str) -> List[Dict[str, Any]]:
        """Lists all drafts for the tenant sorted by most recently updated."""
        cursor = db.db.ai_drive_drafts.find({"institution_id": institution_id}).sort("updated_at", -1)
        drafts = await cursor.to_list(length=100)
        for d in drafts:
            d["id"] = str(d.pop("_id"))
        return drafts

    @staticmethod
    async def complete_missing_info(
        draft_id: str,
        missing_input: Dict[str, Any],
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """
        Merges TPO-provided information into the draft, re-executes deterministic
        validation, and updates the draft lifecycle state.
        """
        draft = await AIDriveService.get_draft(draft_id, institution_id)
        extracted = draft.get("extracted_requirements", {})
        mapped = draft.get("mapped_requirements", {})

        # Merge new fields
        for k, v in missing_input.items():
            if v is not None and str(v).strip() != "":
                extracted[k] = v

        if extracted.get("drive_deadline"):
            from app.ai.date_utils import normalize_deadline_to_str
            norm = normalize_deadline_to_str(extracted["drive_deadline"])
            if norm:
                extracted["drive_deadline"] = norm

        # If departments or programs were edited or confirmed
        if "allowed_departments" in missing_input:
            dept_names = missing_input["allowed_departments"]
            extracted["allowed_departments"] = dept_names
            # Re-map department IDs
            all_depts = await db.db.departments.find({"institution_id": institution_id}).to_list(length=200)
            dept_ids = []
            for name in dept_names:
                for d in all_depts:
                    d_name = d.get("department_name") or d.get("name", "")
                    if str(d.get("_id")) == name or str(d.get("id")) == name or are_departments_equivalent(name, d_name):
                        dept_ids.append(str(d.get("_id") or d.get("id")))
            mapped["department_ids"] = list(set(dept_ids))

            mapped["department_names"] = dept_names

        # Re-run validation
        is_valid, issues, missing = await AIDriveValidator.validate_draft(
            extracted=extracted,
            mapped=mapped,
            institution_id=institution_id
        )

        new_status = "READY_FOR_REVIEW" if is_valid else ("NEEDS_INPUT" if missing else "DRAFT")

        update_doc = {
            "extracted_requirements": extracted,
            "mapped_requirements": mapped,
            "missing_fields": [m.model_dump() for m in missing],
            "validation_issues": [i.model_dump() for i in issues],
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        await db.db.ai_drive_drafts.update_one(id_query(draft_id), {"$set": update_doc})

        await log_audit_event(
            action="ai_drive_validation_completed",
            actor=current_user.get("email", ""),
            actor_role="TPO",
            entity_type="AIDriveDraft",
            entity_id=draft_id,
            institution_id=institution_id,
            details={"is_valid": is_valid, "new_status": new_status}
        )

        return await AIDriveService.get_draft(draft_id, institution_id)

    @staticmethod
    async def update_draft(
        draft_id: str,
        update_payload: Dict[str, Any],
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """Allows direct editing of draft fields by authenticated TPO."""
        draft = await AIDriveService.get_draft(draft_id, institution_id)
        extracted = draft.get("extracted_requirements", {})
        mapped = draft.get("mapped_requirements", {})

        if "extracted_requirements" in update_payload:
            extracted.update(update_payload["extracted_requirements"])
            if extracted.get("drive_deadline"):
                from app.ai.date_utils import normalize_deadline_to_str
                norm = normalize_deadline_to_str(extracted["drive_deadline"])
                if norm:
                    extracted["drive_deadline"] = norm
        if "mapped_requirements" in update_payload:
            mapped.update(update_payload["mapped_requirements"])

        passout_yr = extracted.get("passout_year")
        if passout_yr is not None:
            try:
                passout_int = int(passout_yr)
                batches_cursor = db.db.academic_batches.find({"institution_id": institution_id})
                batches = await batches_cursor.to_list(length=100)
                mapped["target_batches"] = [str(b["_id"]) for b in batches if b.get("expected_graduation_year") == passout_int]
            except Exception:
                pass

        is_valid, issues, missing = await AIDriveValidator.validate_draft(
            extracted=extracted,
            mapped=mapped,
            institution_id=institution_id
        )

        new_status = "READY_FOR_REVIEW" if is_valid else "NEEDS_INPUT"

        update_doc = {
            "extracted_requirements": extracted,
            "mapped_requirements": mapped,
            "missing_fields": [m.model_dump() for m in missing],
            "validation_issues": [i.model_dump() for i in issues],
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        await db.db.ai_drive_drafts.update_one(id_query(draft_id), {"$set": update_doc})
        return await AIDriveService.get_draft(draft_id, institution_id)

    @staticmethod
    async def approve_and_publish_draft(
        draft_id: str,
        institution_id: str,
        current_user: dict,
        background_tasks: BackgroundTasks
    ) -> Dict[str, Any]:
        """
        HUMAN APPROVAL GATE:
        Only triggered upon explicit TPO approval.
        Validates draft, creates authoritative PlacementDrive, evaluates eligible students,
        triggers notifications, and updates draft status to PUBLISHED.
        """
        draft = await AIDriveService.get_draft(draft_id, institution_id)
        actor_email = current_user.get("email", "")

        extracted = draft.get("extracted_requirements", {})
        mapped = draft.get("mapped_requirements", {})

        # 1. Final Safety & Deterministic Validation Check
        is_valid, issues, missing = await AIDriveValidator.validate_draft(
            extracted=extracted,
            mapped=mapped,
            institution_id=institution_id
        )

        if not is_valid:
            error_msgs = [i.message for i in issues if i.severity == "error"]
            missing_msgs = [f"Missing {m.label}" for m in missing]
            all_errors = error_msgs + missing_msgs
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot publish draft. Validation errors: {'; '.join(all_errors)}"
            )

        # 2. Parse Deadline cleanly
        deadline_raw = extracted.get("drive_deadline")
        from app.ai.date_utils import parse_and_normalize_deadline
        deadline = parse_and_normalize_deadline(deadline_raw)

        if not deadline:
            raise HTTPException(status_code=400, detail="A valid application deadline is required before publishing.")

        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)

        dept_ids = mapped.get("department_ids") or []
        dept_names = mapped.get("department_names") or []
        ext_depts = extracted.get("allowed_departments") or []
        combined_depts = list(dict.fromkeys([str(d) for d in (dept_ids + dept_names + ext_depts) if d]))

        prog_ids = mapped.get("program_ids") or []
        prog_names = mapped.get("program_names") or []
        ext_progs = extracted.get("allowed_programs") or []
        combined_progs = list(dict.fromkeys([str(p) for p in (prog_ids + prog_names + ext_progs) if p]))

        # 3. Build Authoritative Placement Drive Document
        drive_doc = {
            "institution_id": institution_id,
            "company_name": str(extracted.get("company_name", "")).strip(),
            "job_role": str(extracted.get("job_role", "")).strip(),
            "package": str(extracted.get("package", "")).strip(),
            "location": str(extracted.get("location", "")).strip(),
            "mode": extracted.get("mode", "On-campus"),
            "min_cgpa": float(extracted.get("min_cgpa") or 0.0),
            "min_ug_percentage": extracted.get("min_ug_percentage"),
            "min_tenth_percentage": extracted.get("min_tenth_percentage"),
            "min_twelfth_percentage": extracted.get("min_twelfth_percentage"),
            "max_backlogs": int(extracted.get("max_backlogs") if extracted.get("max_backlogs") is not None else 99),
            "max_total_backlogs": extracted.get("max_total_backlogs"),
            "historical_backlogs_allowed": extracted.get("historical_backlogs_allowed", True),
            "allowed_departments": combined_depts,
            "allowed_programs": combined_progs,
            "target_batches": mapped.get("target_batches", []),
            "education_gap_allowed": extracted.get("education_gap_allowed", True),
            "first_attempt_required": extracted.get("first_attempt_required", False),
            "gender_filter": extracted.get("gender_filter", "All"),
            "passout_year": int(extracted.get("passout_year")),
            "required_skills": extracted.get("required_skills", []),
            "preferred_skills": extracted.get("preferred_skills", []),
            "external_apply_link": extracted.get("external_apply_link"),
            "drive_deadline": deadline,
            "created_by": current_user["user_id"],
            "created_via_ai": True,
            "ai_draft_id": draft_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        # 4. Insert into authoritative collection
        result = await db.db.placement_drives.insert_one(drive_doc)
        drive_id = str(result.inserted_id)

        # 5. Evaluate eligible students using existing deterministic engine
        eligible_students = await get_eligible_students_for_drive(drive_id, institution_id)

        # 6. Create notifications for eligible students
        notifications = []
        for student in eligible_students:
            notifications.append({
                "student_id": str(student["_id"]),
                "drive_id": drive_id,
                "institution_id": institution_id,
                "message": f"New Placement Drive: {drive_doc['company_name']} is hiring for {drive_doc['job_role']} ({drive_doc['package']})!",
                "status": "unread",
                "created_at": datetime.now(timezone.utc).isoformat()
            })

        if notifications:
            await db.db.notifications.insert_many(notifications)

        # 7. Non-blocking Background Email Tasks
        recipients_to_notify = []
        for student in eligible_students:
            student_email = (
                student.get("contact", {}).get("institutional_email") or
                student.get("emails", {}).get("institute") or
                student.get("contact", {}).get("personal_email")
            )
            if student_email:
                recipients_to_notify.append({
                    "email": student_email,
                    "student_name": student.get("name") or student.get("identity", {}).get("full_name", "Student")
                })

        if recipients_to_notify:
            async def broadcast_emails():
                try:
                    await send_drive_notification_emails_batch(
                        recipients=recipients_to_notify,
                        company_name=drive_doc["company_name"],
                        job_role=drive_doc["job_role"],
                        package=drive_doc["package"],
                        deadline=deadline.strftime("%d %b %Y, %I:%M %p UTC"),
                        apply_url="http://localhost:5173/dashboard",
                    )
                except Exception as ex:
                    logger.error(f"Error during background drive notification broadcast: {ex}")

            background_tasks.add_task(broadcast_emails)

        # 8. Update Draft Status to PUBLISHED
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.db.ai_drive_drafts.update_one(
            id_query(draft_id),
            {"$set": {
                "status": "PUBLISHED",
                "approved_by": actor_email,
                "approved_at": now_iso,
                "published_drive_id": drive_id,
                "updated_at": now_iso
            }}
        )

        # 9. Audit Logging
        await log_audit_event(
            action="ai_drive_approved",
            actor=actor_email,
            actor_role="TPO",
            entity_type="AIDriveDraft",
            entity_id=draft_id,
            institution_id=institution_id,
            details={"approved_by": actor_email, "published_drive_id": drive_id}
        )

        await log_audit_event(
            action="ai_drive_published",
            actor=actor_email,
            actor_role="TPO",
            entity_type="PlacementDrive",
            entity_id=drive_id,
            institution_id=institution_id,
            details={
                "company": drive_doc["company_name"],
                "eligible_count": len(eligible_students),
                "ai_draft_id": draft_id
            }
        )

        return {
            "message": "AI Placement Drive approved and published successfully.",
            "drive_id": drive_id,
            "draft_id": draft_id,
            "eligible_students_notified": len(eligible_students)
        }
