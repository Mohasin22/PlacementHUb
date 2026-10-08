import abc
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import re
from app.db.connection import db
from app.db.utils import id_query, parse_id

class OfficialResultSource(abc.ABC):
    """
    Abstract interface for retrieving authoritative institution/lab academic results.
    Allows connecting to database, files, or external ERP systems.
    """

    @abc.abstractmethod
    async def get_official_result_for_student(
        self,
        institution_id: str,
        roll_number: str
    ) -> Optional[Dict[str, Any]]:
        pass

    @abc.abstractmethod
    async def list_official_results(
        self,
        institution_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        pass


class MongoOfficialResultSource(OfficialResultSource):
    """
    MongoDB implementation of OfficialResultSource querying 'official_results'.
    """

    async def get_official_result_for_student(
        self,
        institution_id: str,
        roll_number: str
    ) -> Optional[Dict[str, Any]]:
        if not roll_number:
            return None
        norm_roll = roll_number.strip().upper()
        res = await db.db.official_results.find_one({
            "institution_id": institution_id,
            "roll_number": {"$regex": f"^{re.escape(norm_roll)}$", "$options": "i"}
        })
        return res

    async def list_official_results(
        self,
        institution_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        cursor = db.db.official_results.find({"institution_id": institution_id}).limit(limit)
        results = await cursor.to_list(length=limit)
        for r in results:
            r["id"] = str(r["_id"])
            del r["_id"]
        return results


class OfficialResultService:
    """
    High-level service for official academic result ingestion,
    verification, and mismatch comparison against student-submitted data.
    """

    def __init__(self, source: Optional[OfficialResultSource] = None):
        self.source = source or MongoOfficialResultSource()

    async def compare_student_with_official(
        self,
        institution_id: str,
        student_id: str
    ) -> Dict[str, Any]:
        """
        Compares student submitted data with authoritative official college results.
        Returns match status (MATCH, MISMATCH, NO_OFFICIAL_RECORD) and itemized discrepancies.
        """
        student = await db.db.students.find_one({
            "institution_id": institution_id,
            "$or": [{"_id": parse_id(student_id)}, {"id": student_id}, {"student_id": student_id}]
        })
        if not student:
            raise ValueError(f"Student {student_id} not found in institution {institution_id}")

        roll_number = student.get("roll_number") or student.get("student_id") or ""
        official_rec = await self.source.get_official_result_for_student(institution_id, roll_number)

        if not official_rec:
            return {
                "status": "NO_OFFICIAL_RECORD",
                "has_mismatch": False,
                "message": "No official college results uploaded for this student yet.",
                "student_data": {
                    "roll_number": roll_number,
                    "name": student.get("name") or student.get("identity", {}).get("full_name"),
                    "cgpa": student.get("cgpa") or student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa"),
                    "active_backlogs": student.get("active_backlogs", 0),
                    "total_backlogs": student.get("total_backlogs", 0)
                },
                "official_data": None,
                "discrepancies": []
            }

        discrepancies = []

        # 1. CGPA Check
        st_cgpa = float(student.get("cgpa") or student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa") or 0.0)
        off_cgpa = float(official_rec.get("cgpa") or 0.0)
        if off_cgpa > 0 and abs(st_cgpa - off_cgpa) > 0.01:
            discrepancies.append({
                "field": "CGPA",
                "student_value": st_cgpa,
                "official_value": off_cgpa,
                "severity": "HIGH",
                "message": f"Student entered CGPA {st_cgpa}, official result is {off_cgpa}"
            })

        # 2. Backlogs Check
        st_backlogs = int(student.get("active_backlogs") if student.get("active_backlogs") is not None else student.get("eligibility_data", {}).get("current_backlogs", 0))
        off_backlogs = int(official_rec.get("backlogs_current") if official_rec.get("backlogs_current") is not None else official_rec.get("current_backlogs", 0))
        if st_backlogs != off_backlogs:
            discrepancies.append({
                "field": "Active Backlogs",
                "student_value": st_backlogs,
                "official_value": off_backlogs,
                "severity": "CRITICAL",
                "message": f"Student reported {st_backlogs} active backlogs, official records show {off_backlogs}"
            })

        # 3. Total Backlogs Check
        st_total_backlogs = int(student.get("total_backlogs") if student.get("total_backlogs") is not None else student.get("eligibility_data", {}).get("backlog_count", 0))
        off_total_backlogs = int(official_rec.get("backlogs_total") if official_rec.get("backlogs_total") is not None else official_rec.get("total_backlogs", 0))
        if st_total_backlogs != off_total_backlogs:
            discrepancies.append({
                "field": "Total Historical Backlogs",
                "student_value": st_total_backlogs,
                "official_value": off_total_backlogs,
                "severity": "MEDIUM",
                "message": f"Student reported {st_total_backlogs} historical backlogs, official records show {off_total_backlogs}"
            })

        # 4. Student Name Check
        st_name = (student.get("name") or student.get("identity", {}).get("full_name") or "").strip().lower()
        off_name = (official_rec.get("student_name") or official_rec.get("name") or "").strip().lower()
        if off_name and st_name and off_name != st_name:
            # Check partial match
            words_st = set(st_name.split())
            words_off = set(off_name.split())
            if not words_st.intersection(words_off):
                discrepancies.append({
                    "field": "Student Name",
                    "student_value": student.get("name") or student.get("identity", {}).get("full_name"),
                    "official_value": official_rec.get("student_name") or official_rec.get("name"),
                    "severity": "MEDIUM",
                    "message": "Student name differs significantly from official result ledger"
                })

        has_mismatch = len(discrepancies) > 0
        status_label = "MISMATCH" if has_mismatch else "MATCH"

        return {
            "status": status_label,
            "has_mismatch": has_mismatch,
            "message": "DATA MISMATCH detected between student data and official result" if has_mismatch else "Student data matches official college results",
            "student_data": {
                "roll_number": roll_number,
                "name": student.get("name") or student.get("identity", {}).get("full_name"),
                "cgpa": st_cgpa,
                "active_backlogs": st_backlogs,
                "total_backlogs": st_total_backlogs
            },
            "official_data": {
                "roll_number": official_rec.get("roll_number"),
                "name": official_rec.get("student_name") or official_rec.get("name"),
                "cgpa": off_cgpa,
                "active_backlogs": off_backlogs,
                "total_backlogs": off_total_backlogs,
                "source_batch_id": official_rec.get("source_batch_id"),
                "subject_results": official_rec.get("subject_results", [])
            },
            "discrepancies": discrepancies
        }

    async def ingest_official_result_record(
        self,
        institution_id: str,
        record: Dict[str, Any],
        uploaded_by_user_id: Optional[str] = None
    ) -> str:
        """
        Upserts an official result record in MongoDB for the given institution.
        """
        roll_no = str(record.get("roll_number") or record.get("roll_no") or record.get("student_id") or "").strip().upper()
        if not roll_no:
            raise ValueError("Roll Number is required for official results.")

        doc = {
            "institution_id": institution_id,
            "roll_number": roll_no,
            "student_name": record.get("student_name") or record.get("name"),
            "program": record.get("program"),
            "department": record.get("department"),
            "cgpa": float(record.get("cgpa") or 0.0),
            "backlogs_current": int(record.get("backlogs_current", record.get("current_backlogs", 0))),
            "backlogs_total": int(record.get("backlogs_total", record.get("total_backlogs", 0))),
            "sgpa_records": record.get("sgpa_records", {}),
            "subject_results": record.get("subject_results", []),
            "uploaded_by": uploaded_by_user_id,
            "source_batch_id": record.get("source_batch_id"),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        res = await db.db.official_results.update_one(
            {"institution_id": institution_id, "roll_number": roll_no},
            {"$set": doc},
            upsert=True
        )

        # Check if student exists; if so, sync backlogs from official results
        student = await db.db.students.find_one({
            "institution_id": institution_id,
            "$or": [{"roll_number": roll_no}, {"student_id": roll_no}]
        })
        if student and record.get("subject_results"):
            from app.services.backlog_service import BacklogService
            await BacklogService.sync_from_official_results(
                student_id=str(student["_id"]),
                institution_id=institution_id,
                official_subjects=record.get("subject_results", [])
            )

        return roll_no


def compare_with_official(student_data: Dict[str, Any], official_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Pure comparison function comparing student data against official record.
    Returns status (MATCH, MISMATCH, NO_OFFICIAL_RECORD) and list of discrepancies.
    """
    if not official_data:
        return {
            "status": "NO_OFFICIAL_RECORD",
            "has_mismatch": False,
            "discrepancies": []
        }

    discrepancies = []

    # 1. CGPA comparison
    st_cgpa = float(
        student_data.get("cgpa") or
        student_data.get("education", {}).get("undergraduate", {}).get("normalized_cgpa") or
        0.0
    )
    off_cgpa = float(official_data.get("cgpa") or 0.0)
    if off_cgpa > 0 and abs(st_cgpa - off_cgpa) > 0.01:
        discrepancies.append({
            "field": "cgpa",
            "status": "MISMATCH",
            "student_value": st_cgpa,
            "official_value": off_cgpa,
            "message": f"CGPA mismatch: student {st_cgpa} vs official {off_cgpa}"
        })

    # 2. 10th percentage comparison
    st_tenth = float(
        student_data.get("tenth_percentage") or
        student_data.get("education", {}).get("secondary", {}).get("normalized_percentage") or
        0.0
    )
    off_tenth = float(official_data.get("tenth_percentage") or 0.0)
    if off_tenth > 0 and abs(st_tenth - off_tenth) > 0.01:
        discrepancies.append({
            "field": "tenth_percentage",
            "status": "MISMATCH",
            "student_value": st_tenth,
            "official_value": off_tenth,
            "message": f"10th percentage mismatch: student {st_tenth} vs official {off_tenth}"
        })

    # 3. 12th percentage comparison
    st_twelfth = float(
        student_data.get("twelfth_percentage") or
        student_data.get("education", {}).get("higher_secondary_or_diploma", {}).get("normalized_percentage") or
        0.0
    )
    off_twelfth = float(official_data.get("twelfth_percentage") or 0.0)
    if off_twelfth > 0 and abs(st_twelfth - off_twelfth) > 0.01:
        discrepancies.append({
            "field": "twelfth_percentage",
            "status": "MISMATCH",
            "student_value": st_twelfth,
            "official_value": off_twelfth,
            "message": f"12th percentage mismatch: student {st_twelfth} vs official {off_twelfth}"
        })

    has_mismatch = len(discrepancies) > 0
    return {
        "status": "MISMATCH" if has_mismatch else "MATCH",
        "has_mismatch": has_mismatch,
        "discrepancies": discrepancies
    }
