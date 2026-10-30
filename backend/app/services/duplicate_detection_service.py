from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import re
import uuid
from app.db.connection import db
from app.db.utils import id_query, parse_id, sanitize_student_record
from app.services.audit import log_audit_event

class DuplicateDetectionService:
    """
    Robust tenant-scoped duplicate student detection engine.
    Detects potential duplicates across Roll Number, Institutional Email,
    Personal Email, and Mobile Number.
    Supports states: UNIQUE, POSSIBLE_DUPLICATE, DUPLICATE_CONFIRMED.
    """

    @staticmethod
    def normalize_email(email: Optional[str]) -> str:
        if not email:
            return ""
        return email.strip().lower()

    @staticmethod
    def normalize_phone(phone: Optional[str]) -> str:
        if not phone:
            return ""
        digits = re.sub(r"\D", "", str(phone).strip())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        return digits

    @staticmethod
    def normalize_roll(roll: Optional[str]) -> str:
        if not roll:
            return ""
        return str(roll).strip().upper()

    def __init__(self, db: Any = None):
        self.db = db

    @staticmethod
    def build_resolution(duplicate_id: str, action: str, actor_id: Optional[str] = None) -> Dict[str, Any]:
        return {
            "duplicate_id": duplicate_id,
            "action": action,
            "resolved_by": actor_id,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "status": "RESOLVED"
        }

    async def check_candidate(
        self,
        candidate: Dict[str, Any],
        students_coll: Any = None,
        pending_coll: Any = None
    ) -> Dict[str, Any]:
        roll = self.normalize_roll(candidate.get("roll_number") or candidate.get("student_id"))
        inst_email = self.normalize_email(
            candidate.get("institute_email") or
            candidate.get("institutional_email") or
            (candidate.get("emails", {}).get("institute") if isinstance(candidate.get("emails"), dict) else None)
        )
        personal_email = self.normalize_email(
            candidate.get("personal_email") or
            (candidate.get("emails", {}).get("personal") if isinstance(candidate.get("emails"), dict) else None)
        )
        mobile = self.normalize_phone(candidate.get("mobile"))

        existing_students = []
        if students_coll:
            res = students_coll.find({})
            cursor = await res if hasattr(res, "__await__") else res
            if hasattr(cursor, "to_list"):
                to_list_res = cursor.to_list(100)
                existing_students = await to_list_res if hasattr(to_list_res, "__await__") else to_list_res
            elif hasattr(cursor, "__iter__"):
                existing_students = list(cursor)

        existing_pending = []
        if pending_coll:
            res = pending_coll.find({})
            cursor = await res if hasattr(res, "__await__") else res
            if hasattr(cursor, "to_list"):
                to_list_res = cursor.to_list(100)
                existing_pending = await to_list_res if hasattr(to_list_res, "__await__") else to_list_res
            elif hasattr(cursor, "__iter__"):
                existing_pending = list(cursor)

        all_existing = existing_students + existing_pending
        matches = []

        for ex in all_existing:
            ex_id = str(ex.get("_id", ex.get("id", "")))
            if ex_id and ex_id == str(candidate.get("_id", candidate.get("id", ""))):
                continue

            ex_roll = self.normalize_roll(ex.get("roll_number") or ex.get("student_id"))
            ex_inst_email = self.normalize_email(
                ex.get("institute_email") or
                ex.get("institutional_email") or
                (ex.get("emails", {}).get("institute") if isinstance(ex.get("emails"), dict) else None)
            )
            ex_personal_email = self.normalize_email(
                ex.get("personal_email") or
                (ex.get("emails", {}).get("personal") if isinstance(ex.get("emails"), dict) else None)
            )
            ex_mobile = self.normalize_phone(ex.get("mobile"))

            if roll and ex_roll and roll == ex_roll:
                matches.append({"field": "roll_number", "matched_value": roll, "existing_id": ex_id})
            if inst_email and ex_inst_email and inst_email == ex_inst_email:
                matches.append({"field": "institute_email", "matched_value": inst_email, "existing_id": ex_id})
            if personal_email and ex_personal_email and personal_email == ex_personal_email:
                matches.append({"field": "personal_email", "matched_value": personal_email, "existing_id": ex_id})
            if mobile and ex_mobile and mobile == ex_mobile:
                matches.append({"field": "mobile", "matched_value": mobile, "existing_id": ex_id})

        if not matches:
            return {"status": "UNIQUE", "matches": [], "is_duplicate": False}

        status = "DUPLICATE_CONFIRMED" if len(matches) > 1 else "POSSIBLE_DUPLICATE"
        return {"status": status, "matches": matches, "is_duplicate": True}

    @classmethod
    async def check_duplicate(
        cls,
        institution_id: str,
        student_data: Dict[str, Any],
        exclude_student_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Scans existing student records in the same institution for matching identifiers.
        Returns detection result with status (UNIQUE, POSSIBLE_DUPLICATE, DUPLICATE_CONFIRMED),
        matched fields, existing student snapshot, and incoming record snapshot.
        """
        roll_no = cls.normalize_roll(
            student_data.get("roll_number") or
            student_data.get("student_id") or
            student_data.get("studentId")
        )
        inst_email = cls.normalize_email(
            student_data.get("institute_email") or
            student_data.get("institutional_email") or
            (student_data.get("emails", {}).get("institute") if isinstance(student_data.get("emails"), dict) else None) or
            (student_data.get("contact", {}).get("institutional_email") if isinstance(student_data.get("contact"), dict) else None)
        )
        personal_email = cls.normalize_email(
            student_data.get("personal_email") or
            (student_data.get("emails", {}).get("personal") if isinstance(student_data.get("emails"), dict) else None) or
            (student_data.get("contact", {}).get("personal_email") if isinstance(student_data.get("contact"), dict) else None)
        )
        mobile = cls.normalize_phone(
            student_data.get("mobile") or
            (student_data.get("contact", {}).get("mobile") if isinstance(student_data.get("contact"), dict) else None)
        )

        match_conditions = []
        if roll_no:
            match_conditions.extend([
                {"roll_number": {"$regex": f"^{re.escape(roll_no)}$", "$options": "i"}},
                {"student_id": {"$regex": f"^{re.escape(roll_no)}$", "$options": "i"}}
            ])
        if inst_email:
            match_conditions.extend([
                {"institute_email": inst_email},
                {"contact.institutional_email": inst_email},
                {"emails.institute": inst_email}
            ])
        if personal_email:
            match_conditions.extend([
                {"personal_email": personal_email},
                {"contact.personal_email": personal_email},
                {"emails.personal": personal_email}
            ])
        if mobile and len(mobile) >= 10:
            match_conditions.extend([
                {"mobile": mobile},
                {"contact.mobile": mobile}
            ])

        if not match_conditions:
            return {
                "status": "UNIQUE",
                "is_duplicate": False,
                "matched_fields": [],
                "existing_student": None,
                "incoming_record": student_data
            }

        query: Dict[str, Any] = {
            "institution_id": institution_id,
            "$or": match_conditions
        }
        if exclude_student_id:
            query["_id"] = {"$ne": parse_id(exclude_student_id)}

        existing_match = await db.db.students.find_one(query)

        if not existing_match:
            # Also check pending submissions
            pending_query: Dict[str, Any] = {
                "institution_id": institution_id,
                "$or": match_conditions
            }
            if exclude_student_id:
                pending_query["_id"] = {"$ne": parse_id(exclude_student_id)}
            existing_match = await db.db.student_pending_submissions.find_one(pending_query)

        if not existing_match:
            return {
                "status": "UNIQUE",
                "is_duplicate": False,
                "matched_fields": [],
                "existing_student": None,
                "incoming_record": student_data
            }

        # Analyze which specific fields matched
        matched_fields = []
        ex_roll = cls.normalize_roll(existing_match.get("roll_number") or existing_match.get("student_id"))
        ex_inst_email = cls.normalize_email(
            existing_match.get("institute_email") or
            existing_match.get("contact", {}).get("institutional_email") or
            existing_match.get("emails", {}).get("institute")
        )
        ex_personal_email = cls.normalize_email(
            existing_match.get("personal_email") or
            existing_match.get("contact", {}).get("personal_email") or
            existing_match.get("emails", {}).get("personal")
        )
        ex_mobile = cls.normalize_phone(
            existing_match.get("mobile") or
            existing_match.get("contact", {}).get("mobile")
        )

        if roll_no and ex_roll and roll_no == ex_roll:
            matched_fields.append("Roll Number")
        if inst_email and ex_inst_email and inst_email == ex_inst_email:
            matched_fields.append("Institute Email")
        if personal_email and ex_personal_email and personal_email == ex_personal_email:
            matched_fields.append("Personal Email")
        if mobile and ex_mobile and mobile == ex_mobile:
            matched_fields.append("Mobile Number")

        existing_summary = {
            "id": str(existing_match.get("_id", existing_match.get("id"))),
            "name": existing_match.get("name") or existing_match.get("identity", {}).get("full_name"),
            "roll_number": ex_roll,
            "institute_email": ex_inst_email,
            "personal_email": ex_personal_email,
            "mobile": ex_mobile,
            "department": existing_match.get("department_name") or existing_match.get("academic_identity", {}).get("department_name"),
            "program": existing_match.get("program_name") or existing_match.get("academic_identity", {}).get("program_name"),
            "status": existing_match.get("status") or existing_match.get("approval", {}).get("faculty_status")
        }

        incoming_summary = {
            "name": student_data.get("name") or student_data.get("full_name") or student_data.get("identity", {}).get("full_name"),
            "roll_number": roll_no,
            "institute_email": inst_email,
            "personal_email": personal_email,
            "mobile": mobile,
            "department": student_data.get("department_name") or student_data.get("department") or student_data.get("academic_identity", {}).get("department_name"),
            "program": student_data.get("program_name") or student_data.get("program") or student_data.get("academic_identity", {}).get("program_name")
        }

        # Check if already confirmed in duplicate collection
        dup_record = await db.db.duplicate_records.find_one({
            "institution_id": institution_id,
            "existing_student_id": existing_summary["id"],
            "matched_roll_number": roll_no,
            "status": "CONFIRMED"
        })

        current_status = "DUPLICATE_CONFIRMED" if dup_record else "POSSIBLE_DUPLICATE"

        return {
            "status": current_status,
            "is_duplicate": True,
            "matched_fields": matched_fields,
            "message": "Possible duplicate student detected",
            "existing_student": existing_summary,
            "incoming_record": incoming_summary
        }

    @classmethod
    async def record_duplicate_warning(
        cls,
        institution_id: str,
        detection_result: Dict[str, Any],
        source: str = "import",
        source_details: Optional[Dict[str, Any]] = None
    ) -> str:
        """Stores a potential duplicate incident in duplicate_records collection for faculty/admin review."""
        existing = sanitize_student_record(dict(detection_result.get("existing_student") or {}))
        incoming = sanitize_student_record(dict(detection_result.get("incoming_record") or {}))

        duplicate_doc = {
            "duplicate_id": str(uuid.uuid4()),
            "institution_id": institution_id,
            "status": detection_result.get("status", "POSSIBLE_DUPLICATE"),
            "source": source,
            "matched_fields": detection_result.get("matched_fields", []),
            "matched_roll_number": incoming.get("roll_number"),
            "matched_email": incoming.get("institute_email") or incoming.get("personal_email"),
            "existing_student_id": existing.get("id"),
            "existing_record": existing,
            "incoming_record": incoming,
            "source_details": source_details or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "resolved_at": None,
            "resolved_by": None,
            "resolution_action": None,
            "resolution_notes": None
        }

        res = await db.db.duplicate_records.insert_one(duplicate_doc)
        return str(res.inserted_id)

    @classmethod
    async def resolve_duplicate(
        cls,
        duplicate_id: str,
        institution_id: str,
        action: str,  # "CONFIRM_DUPLICATE", "KEEP_EXISTING", "MERGE", "REJECT_WARNING"
        resolved_by_user: Dict[str, Any],
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Authorized administrator/faculty member resolves a duplicate warning.
        Actions:
        - CONFIRM_DUPLICATE: Mark record as duplicate confirmed.
        - KEEP_EXISTING: Discard incoming or leave existing intact.
        - MERGE: Merge non-empty incoming fields into existing record with audit trail.
        - REJECT_WARNING: Mark as false-positive, student is unique.
        """
        dup_rec = await db.db.duplicate_records.find_one({
            "institution_id": institution_id,
            "$or": [
                {"duplicate_id": duplicate_id},
                {"_id": parse_id(duplicate_id)}
            ]
        })
        if not dup_rec:
            raise ValueError("Duplicate record not found.")

        valid_actions = ["CONFIRM_DUPLICATE", "KEEP_EXISTING", "MERGE", "REJECT_WARNING"]
        if action not in valid_actions:
            raise ValueError(f"Invalid action {action}. Must be one of {valid_actions}")

        now_iso = datetime.now(timezone.utc).isoformat()
        existing_id = dup_rec.get("existing_student_id")

        if action == "MERGE" and existing_id:
            # Merge safe incoming data into existing student
            incoming = dup_rec.get("incoming_record", {})
            patch_data = {}
            for field in ["personal_email", "mobile", "skills", "projects", "certifications", "resume_url"]:
                if incoming.get(field):
                    patch_data[field] = incoming[field]
            if patch_data:
                patch_data["updated_at"] = now_iso
                await db.db.students.update_one(id_query(existing_id), {"$set": patch_data})

        new_status = {
            "CONFIRM_DUPLICATE": "DUPLICATE_CONFIRMED",
            "KEEP_EXISTING": "RESOLVED_KEPT_EXISTING",
            "MERGE": "RESOLVED_MERGED",
            "REJECT_WARNING": "REJECTED_WARNING_UNIQUE"
        }.get(action, "RESOLVED")

        await db.db.duplicate_records.update_one(
            {"_id": dup_rec["_id"]},
            {"$set": {
                "status": new_status,
                "resolution_action": action,
                "resolved_at": now_iso,
                "resolved_by": resolved_by_user.get("email"),
                "resolved_by_user_id": resolved_by_user.get("user_id"),
                "resolution_notes": notes
            }}
        )

        await log_audit_event(
            action=f"duplicate_resolved_{action.lower()}",
            actor=resolved_by_user.get("email", "admin"),
            actor_role=resolved_by_user.get("role", "Faculty"),
            entity_type="DuplicateRecord",
            entity_id=duplicate_id,
            institution_id=institution_id,
            details={
                "action": action,
                "notes": notes,
                "existing_student_id": existing_id,
                "matched_fields": dup_rec.get("matched_fields")
            }
        )

        return {
            "success": True,
            "status": new_status,
            "message": f"Duplicate resolution '{action}' applied successfully."
        }
