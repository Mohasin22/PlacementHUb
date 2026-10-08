from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from app.db.connection import db
from app.db.utils import id_query, parse_id
from app.services.audit import log_audit_event

class BacklogService:
    """
    Service for managing active backlogs, historical backlogs, F-grades,
    and structured backlog history.
    Never deletes historical backlog records.
    """

    @staticmethod
    def is_f_grade(grade: Optional[str]) -> bool:
        if not grade:
            return False
        g = str(grade).strip().upper()
        return g in ["F", "FAIL", "RA", "AB", "ABSENT", "FF", "FR"]

    @staticmethod
    def is_passing_grade(grade: Optional[str]) -> bool:
        if not grade:
            return False
        g = str(grade).strip().upper()
        return g in ["A+", "A", "B+", "B", "C+", "C", "D", "P", "PASS", "S", "O", "EX"]

    @staticmethod
    def count_active(history: List[Dict[str, Any]]) -> int:
        return sum(1 for item in history if str(item.get("status", "")).upper() == "ACTIVE")

    @staticmethod
    def count_total(history: List[Dict[str, Any]]) -> int:
        return len(history)

    @staticmethod
    def count_historical(history: List[Dict[str, Any]]) -> int:
        return sum(1 for item in history if str(item.get("status", "")).upper() == "CLEARED")

    @classmethod
    def normalize_entry(cls, raw_subject: Dict[str, Any]) -> Dict[str, Any]:
        grade = str(raw_subject.get("grade", "")).strip().upper()
        status = "ACTIVE" if cls.is_f_grade(grade) else "CLEARED"
        return {
            "subject_name": raw_subject.get("subject_name") or raw_subject.get("name"),
            "semester": raw_subject.get("semester"),
            "grade": grade,
            "status": status,
            "attempts": raw_subject.get("attempts", 1),
            "clearing_semester": raw_subject.get("clearing_semester")
        }

    @staticmethod
    def clear_backlog(entry: Dict[str, Any], clearing_semester: Optional[int] = None, attempts: int = 1) -> Dict[str, Any]:
        updated = dict(entry)
        updated["status"] = "CLEARED"
        updated["clearing_semester"] = clearing_semester
        updated["attempts"] = attempts
        return updated

    @classmethod
    async def get_student_backlog_history(
        cls,
        student_id: str,
        institution_id: str
    ) -> Dict[str, Any]:
        """
        Retrieves the structured backlog history and counts for a student.
        """
        student = await db.db.students.find_one({
            "institution_id": institution_id,
            "$or": [{"_id": parse_id(student_id)}, {"id": student_id}, {"student_id": student_id}]
        })
        if not student:
            return {
                "current_backlogs": 0,
                "historical_backlogs": 0,
                "history": []
            }

        history = student.get("backlog_history") or []
        
        # Calculate active vs historical
        active_count = sum(1 for item in history if str(item.get("status", "")).upper() == "ACTIVE")
        historical_total = len(history)

        return {
            "current_backlogs": active_count,
            "historical_backlogs": historical_total,
            "history": history
        }

    @classmethod
    async def process_subject_result(
        cls,
        student_id: str,
        institution_id: str,
        semester: int,
        subject_code: str,
        subject_name: str,
        grade: str,
        cleared_in_semester: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Processes an individual subject grade (e.g. from official college/lab results).
        If F-grade is detected, flags as active backlog.
        If a subsequent result shows passing grade for a previously failed subject,
        marks the backlog as CLEARED with cleared_semester recorded.
        """
        student = await db.db.students.find_one({
            "institution_id": institution_id,
            "$or": [{"_id": parse_id(student_id)}, {"id": student_id}, {"student_id": student_id}]
        })
        if not student:
            raise ValueError(f"Student {student_id} not found in institution {institution_id}")

        history: List[Dict[str, Any]] = list(student.get("backlog_history") or [])
        now_iso = datetime.now(timezone.utc).isoformat()
        
        norm_code = subject_code.strip().upper()
        is_f = cls.is_f_grade(grade)
        is_pass = cls.is_passing_grade(grade)

        existing_entry_idx = next(
            (i for i, b in enumerate(history) if b.get("subject_code", "").strip().upper() == norm_code),
            None
        )

        if is_f:
            if existing_entry_idx is not None:
                # Increment attempts if still failing or re-appeared
                entry = history[existing_entry_idx]
                entry["attempts"] = entry.get("attempts", 1) + 1
                entry["grade"] = grade
                entry["status"] = "ACTIVE"
                entry["last_updated"] = now_iso
            else:
                # New backlog entry
                history.append({
                    "semester": semester,
                    "subject_code": norm_code,
                    "subject_name": subject_name.strip(),
                    "grade": grade,
                    "status": "ACTIVE",
                    "attempts": 1,
                    "cleared_semester": None,
                    "official_source_verified": True,
                    "recorded_at": now_iso
                })
        elif is_pass:
            if existing_entry_idx is not None:
                # Mark as cleared
                entry = history[existing_entry_idx]
                entry["status"] = "CLEARED"
                entry["cleared_semester"] = cleared_in_semester or semester
                entry["clearing_grade"] = grade
                entry["last_updated"] = now_iso

        # Compute updated counts
        active_count = sum(1 for item in history if str(item.get("status", "")).upper() == "ACTIVE")
        historical_total = len(history)

        update_doc = {
            "backlog_history": history,
            "active_backlogs": active_count,
            "total_backlogs": historical_total,
            "eligibility_data.current_backlogs": active_count,
            "eligibility_data.backlog_count": historical_total,
            "updated_at": now_iso
        }

        await db.db.students.update_one(
            {"_id": student["_id"]},
            {"$set": update_doc}
        )

        return {
            "current_backlogs": active_count,
            "historical_backlogs": historical_total,
            "history": history
        }

    @classmethod
    async def sync_from_official_results(
        cls,
        student_id: str,
        institution_id: str,
        official_subjects: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Synchronizes entire backlog history from a list of official subject result records.
        """
        student = await db.db.students.find_one({
            "institution_id": institution_id,
            "$or": [{"_id": parse_id(student_id)}, {"id": student_id}, {"student_id": student_id}]
        })
        if not student:
            raise ValueError(f"Student {student_id} not found")

        history: List[Dict[str, Any]] = list(student.get("backlog_history") or [])
        now_iso = datetime.now(timezone.utc).isoformat()

        # Sort official records by semester ascending
        sorted_records = sorted(official_subjects, key=lambda s: int(s.get("semester", 1)))

        for sub in sorted_records:
            sem = int(sub.get("semester", 1))
            code = (sub.get("subject_code") or sub.get("code") or "").strip().upper()
            name = (sub.get("subject_name") or sub.get("name") or code).strip()
            grade = (sub.get("grade") or "").strip().upper()

            if not code:
                continue

            existing_idx = next(
                (i for i, b in enumerate(history) if b.get("subject_code", "").strip().upper() == code),
                None
            )

            if cls.is_f_grade(grade):
                if existing_idx is not None:
                    history[existing_idx]["attempts"] = history[existing_idx].get("attempts", 1) + 1
                    history[existing_idx]["grade"] = grade
                    history[existing_idx]["status"] = "ACTIVE"
                    history[existing_idx]["last_updated"] = now_iso
                else:
                    history.append({
                        "semester": sem,
                        "subject_code": code,
                        "subject_name": name,
                        "grade": grade,
                        "status": "ACTIVE",
                        "attempts": 1,
                        "cleared_semester": None,
                        "official_source_verified": True,
                        "recorded_at": now_iso
                    })
            elif cls.is_passing_grade(grade):
                if existing_idx is not None:
                    history[existing_idx]["status"] = "CLEARED"
                    history[existing_idx]["cleared_semester"] = sem
                    history[existing_idx]["clearing_grade"] = grade
                    history[existing_idx]["last_updated"] = now_iso

        active_count = sum(1 for item in history if str(item.get("status", "")).upper() == "ACTIVE")
        historical_total = len(history)

        update_doc = {
            "backlog_history": history,
            "active_backlogs": active_count,
            "total_backlogs": historical_total,
            "eligibility_data.current_backlogs": active_count,
            "eligibility_data.backlog_count": historical_total,
            "updated_at": now_iso
        }

        await db.db.students.update_one(
            {"_id": student["_id"]},
            {"$set": update_doc}
        )

        return {
            "current_backlogs": active_count,
            "historical_backlogs": historical_total,
            "history": history
        }
