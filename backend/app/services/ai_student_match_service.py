import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.db.connection import db
from app.db.utils import id_query, parse_id
from app.ai.agent import ai_agent
from app.ai.schemas import StudentMatchResult, StudentDataIssue
from app.services.audit import log_audit_event

logger = logging.getLogger(__name__)

class AIStudentMatchService:
    """
    Service managing Student AI Matching, explainable eligibility breakdowns,
    and student-approved data quality corrections.
    """

    @staticmethod
    async def get_match_assessment(
        student_id: str,
        drive_id: str,
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """
        Executes AI matching evaluation for student against specific drive.
        Logs audit event and returns structured result.
        """
        match_res = await ai_agent.match_student_to_drive(
            student_id=student_id,
            drive_id=drive_id,
            institution_id=institution_id
        )

        await log_audit_event(
            action="ai_student_match_generated",
            actor=current_user.get("email", ""),
            actor_role="Student",
            entity_type="PlacementDrive",
            entity_id=drive_id,
            institution_id=institution_id,
            details={
                "student_id": student_id,
                "is_eligible": match_res.is_eligible,
                "mandatory_passed": sum(1 for m in match_res.mandatory_criteria if m["status"] == "PASS")
            }
        )

        return match_res.model_dump()

    @staticmethod
    async def get_student_data_issues(
        student_id: str,
        institution_id: str
    ) -> List[Dict[str, Any]]:
        """
        Inspects student profile for typos, missing documents, or inconsistencies.
        """
        student = await db.db.students.find_one({
            "$and": [
                id_query(student_id),
                {"institution_id": institution_id}
            ]
        })
        if not student:
            # Fallback check on student_id roll number
            student = await db.db.students.find_one({
                "student_id": student_id,
                "institution_id": institution_id
            })

        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")

        issues = ai_agent.inspect_student_data_quality(student)
        return [i.model_dump() for i in issues]

    @staticmethod
    async def accept_issue_correction(
        student_id: str,
        field: str,
        original_value: Any,
        suggested_value: Any,
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """
        HUMAN APPROVAL GATE for student data:
        Authoritative update only occurs when the student or faculty explicitly accepts.
        """
        student = await db.db.students.find_one({
            "$and": [
                id_query(student_id),
                {"institution_id": institution_id}
            ]
        })
        if not student:
            student = await db.db.students.find_one({
                "student_id": student_id,
                "institution_id": institution_id
            })
        if not student:
            raise HTTPException(status_code=404, detail="Student record not found.")

        actor_email = current_user.get("email", "")
        old_val = None
        new_val = None

        if field == "skills":
            skills = student.get("skills", [])
            # Replace original_value with suggested_value
            updated_skills = []
            for s in skills:
                if str(s).strip().lower() == str(original_value).strip().lower():
                    updated_skills.append(suggested_value)
                else:
                    updated_skills.append(s)
            # Remove duplicates preserving order
            seen = set()
            clean_skills = [x for x in updated_skills if not (x in seen or seen.add(x))]

            old_val = skills
            new_val = clean_skills

            await db.db.students.update_one(
                id_query(str(student["_id"])),
                {"$set": {
                    "skills": clean_skills,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )

        elif field == "links.github":
            # If user provides URL
            await db.db.students.update_one(
                id_query(str(student["_id"])),
                {"$set": {
                    "links.github": suggested_value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            old_val = student.get("links", {}).get("github")
            new_val = suggested_value

        await log_audit_event(
            action="ai_correction_accepted",
            actor=actor_email,
            actor_role=current_user.get("role", "Student"),
            entity_type="Student",
            entity_id=str(student["_id"]),
            institution_id=institution_id,
            old_value=old_val,
            new_value=new_val,
            details={"field": field, "suggested_value": suggested_value}
        )

        return {
            "message": f"Successfully updated {field}.",
            "field": field,
            "new_value": new_val
        }

    @staticmethod
    async def record_match_approval(
        student_id: str,
        drive_id: str,
        institution_id: str,
        current_user: dict
    ) -> Dict[str, Any]:
        """
        Records that the student has reviewed and approved the AI assessment
        prior to submitting their application snapshot.
        """
        actor_email = current_user.get("email", "")

        await log_audit_event(
            action="ai_student_match_approved",
            actor=actor_email,
            actor_role="Student",
            entity_type="PlacementDrive",
            entity_id=drive_id,
            institution_id=institution_id,
            details={"student_id": student_id, "approved_at": datetime.now(timezone.utc).isoformat()}
        )

        return {"message": "AI assessment approved by student.", "status": "APPROVED"}
