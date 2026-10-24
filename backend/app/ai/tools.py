import logging
from typing import Dict, Any, List, Optional
from app.db.connection import db
from app.db.utils import id_query, parse_id

logger = logging.getLogger(__name__)

class AITools:
    """
    Controlled allowlisted tools for the AI Agent.
    Strictly enforces multi-tenant boundary via institution_id.
    Never allows arbitrary code or direct unrestricted database access.
    """

    @staticmethod
    async def get_institution_schema(institution_id: str) -> Dict[str, Any]:
        """Returns institution identity and high-level setup."""
        inst = await db.db.institutions.find_one(id_query(institution_id))
        if not inst:
            return {}
        return {
            "institution_id": str(inst.get("_id")),
            "name": inst.get("name"),
            "code": inst.get("institution_code")
        }

    @staticmethod
    async def get_academic_hierarchy(institution_id: str) -> Dict[str, Any]:
        """
        Retrieves the complete academic hierarchy for the tenant:
        programs, departments, classes, and academic batches.
        """
        programs = await AITools.get_programs(institution_id)
        departments = await AITools.get_departments(institution_id)
        classes = await AITools.get_classes(institution_id)
        batches = await AITools.get_academic_batches(institution_id)

        return {
            "programs": programs,
            "departments": departments,
            "classes": classes,
            "batches": batches
        }

    @staticmethod
    async def get_programs(institution_id: str) -> List[Dict[str, Any]]:
        """Lists all active programs belonging to the institution."""
        progs_cursor = db.db.programs.find({"institution_id": institution_id})
        progs = await progs_cursor.to_list(length=100)
        return [
            {
                "id": str(p["_id"]),
                "name": p.get("program_name"),
                "code": p.get("code")
            }
            for p in progs
        ]

    @staticmethod
    async def get_departments(institution_id: str, program_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists all departments belonging to the institution, optionally filtered by program."""
        query: Dict[str, Any] = {"institution_id": institution_id}
        if program_id:
            query["$or"] = [{"program_id": program_id}, {"program_id": parse_id(program_id)}]

        depts_cursor = db.db.departments.find(query)
        depts = await depts_cursor.to_list(length=200)

        # Fallback to classes or students if departments collection has no records for this tenant
        if not depts:
            dept_ids_found = await db.db.classes.distinct("department_id", {"institution_id": institution_id})
            for did in dept_ids_found:
                if did:
                    cls_sample = await db.db.classes.find_one({"department_id": did, "institution_id": institution_id})
                    name = cls_sample.get("class_name", "").split("-")[0].strip() if cls_sample else "General"
                    depts.append({"_id": parse_id(did), "department_name": name, "program_id": str(cls_sample.get("program_id", "") if cls_sample else "")})

            if not depts:
                st_depts = await db.db.students.distinct("department_name", {"institution_id": institution_id})
                for sdept in st_depts:
                    if sdept:
                        depts.append({"_id": sdept, "department_name": sdept, "program_id": ""})

        return [
            {
                "id": str(d.get("_id") or d.get("id")),
                "name": d.get("department_name") or d.get("name"),
                "program_id": str(d.get("program_id", ""))
            }
            for d in depts
        ]


    @staticmethod
    async def get_classes(institution_id: str, department_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists all classes/sections belonging to the institution."""
        query: Dict[str, Any] = {"institution_id": institution_id}
        if department_id:
            query["$or"] = [{"department_id": department_id}, {"department_id": parse_id(department_id)}]

        classes_cursor = db.db.classes.find(query)
        cls_list = await classes_cursor.to_list(length=500)
        return [
            {
                "id": str(c["_id"]),
                "name": c.get("class_name"),
                "department_id": str(c.get("department_id", "")),
                "program_id": str(c.get("program_id", ""))
            }
            for c in cls_list
        ]

    @staticmethod
    async def get_academic_batches(institution_id: str) -> List[Dict[str, Any]]:
        """Lists active academic batches belonging to the institution."""
        batches_cursor = db.db.academic_batches.find({"institution_id": institution_id})
        batches = await batches_cursor.to_list(length=100)
        return [
            {
                "id": str(b["_id"]),
                "batch_label": b.get("batch_label"),
                "admission_year": b.get("admission_year"),
                "expected_graduation_year": b.get("expected_graduation_year"),
                "program_id": str(b.get("program_id", ""))
            }
            for b in batches
        ]

    @staticmethod
    def get_drive_schema() -> Dict[str, Any]:
        """Returns the authoritative placement drive schema requirements."""
        return {
            "required_fields": [
                "company_name",
                "job_role",
                "package",
                "location",
                "mode",
                "passout_year",
                "drive_deadline"
            ],
            "allowed_modes": ["On-campus", "Remote", "Hybrid"],
            "allowed_gender_filters": ["All", "Male", "Female"],
            "cgpa_range": [0.0, 10.0],
            "percentage_range": [0.0, 100.0]
        }

    @staticmethod
    async def get_conversion_rules(institution_id: str) -> List[Dict[str, Any]]:
        """Retrieves active board conversion rules available to this institution."""
        query = {
            "active": True,
            "$or": [
                {"institution_id": institution_id},
                {"institution_id": None},
                {"institution_id": {"$exists": False}}
            ]
        }
        rules_cursor = db.db.board_conversion_rules.find(query)
        rules = await rules_cursor.to_list(length=50)
        return [
            {
                "id": str(r.get("_id", r.get("id"))),
                "board": r.get("board"),
                "qualification": r.get("qualification"),
                "input_type": r.get("input_type"),
                "output_type": r.get("output_type"),
                "formula": r.get("formula"),
                "multiplier": r.get("multiplier")
            }
            for r in rules
        ]

    @staticmethod
    async def get_student_profile(student_id: str, institution_id: str) -> Optional[Dict[str, Any]]:
        """Fetches student profile strictly within tenant boundaries."""
        query = id_query(student_id)
        query["institution_id"] = institution_id
        student = await db.db.students.find_one(query)
        if not student:
            # Fallback to roll_number
            student = await db.db.students.find_one({
                "student_id": student_id,
                "institution_id": institution_id
            })
        return student

    @staticmethod
    async def get_existing_drive_requirements(drive_id: str, institution_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves existing placement drive details strictly within tenant boundary."""
        query = id_query(drive_id)
        query["institution_id"] = institution_id
        return await db.db.placement_drives.find_one(query)
