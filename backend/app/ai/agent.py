import re
import uuid
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.db.connection import db
from app.ai.llm_client import llm_client
from app.ai.prompts import JD_EXTRACTION_SYSTEM_PROMPT
from app.ai.tools import AITools
from app.ai.validators import AIDriveValidator
from app.ai.schemas import (
    AIDriveDraft, MappingItem, MissingFieldItem, ValidationIssueItem,
    StudentMatchResult, StudentDataIssue
)
from app.services.eligibility_engine import evaluate_student_eligibility_detailed
from app.services.board_conversion_service import find_matching_conversion_rule
from app.services.department_normalizer import are_departments_equivalent


logger = logging.getLogger(__name__)

# Canonical spelling dictionary for technical skills to catch common student typos
KNOWN_TECH_SKILLS = {
    "python": "Python",
    "pyhton": "Python",
    "pyton": "Python",
    "java": "Java",
    "jawa": "Java",
    "javascript": "JavaScript",
    "javscript": "JavaScript",
    "js": "JavaScript",
    "typescript": "TypeScript",
    "typescrip": "TypeScript",
    "ts": "TypeScript",
    "c++": "C++",
    "cpp": "C++",
    "c#": "C#",
    "csharp": "C#",
    "react": "React",
    "reactjs": "React",
    "react.js": "React",
    "reatc": "React",
    "node": "Node.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "angular": "Angular",
    "angularjs": "Angular",
    "vue": "Vue.js",
    "vuejs": "Vue.js",
    "django": "Django",
    "djagno": "Django",
    "fastapi": "FastAPI",
    "fast-api": "FastAPI",
    "flask": "Flask",
    "spring": "Spring Boot",
    "springboot": "Spring Boot",
    "spring boot": "Spring Boot",
    "sql": "SQL",
    "mysql": "MySQL",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mongodb": "MongoDB",
    "mongo": "MongoDB",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "aws": "AWS",
    "git": "Git",
    "github": "GitHub",
    "html": "HTML",
    "htmll": "HTML",
    "css": "CSS",
    "tailwindcss": "TailwindCSS",
    "tailwind": "TailwindCSS"
}

class AIAgent:
    """
    PlacementHub AI Orchestration Agent.
    Coordinates LLM reasoning with allowlisted tools, deterministic validation,
    and structured database mapping.
    """

    def __init__(self):
        self.llm = llm_client

    async def analyze_job_description(
        self,
        source_jd: str,
        institution_id: str,
        user_id: str
    ) -> AIDriveDraft:
        """
        Takes raw JD text, performs LLM reasoning, queries academic hierarchy tools,
        maps requirements to authoritative DB IDs, detects missing info, runs
        deterministic validation, and constructs an AIDriveDraft.
        """
        logger.info(f"Analyzing JD for institution {institution_id} by user {user_id}")

        # 1. LLM Reasoning / Extraction
        prompt = f"Please extract the placement drive details from this Job Description:\n\n{source_jd}"
        raw_extraction = await self.llm.generate_json(
            prompt=prompt,
            system_instruction=JD_EXTRACTION_SYSTEM_PROMPT
        )
        if raw_extraction.get("drive_deadline"):
            from app.ai.date_utils import normalize_deadline_to_str
            norm_dl = normalize_deadline_to_str(raw_extraction["drive_deadline"])
            if norm_dl:
                raw_extraction["drive_deadline"] = norm_dl


        # 2. Tool Query: Fetch Tenant's Academic Hierarchy
        hierarchy = await AITools.get_academic_hierarchy(institution_id)
        db_programs = hierarchy.get("programs", [])
        db_departments = hierarchy.get("departments", [])
        db_classes = hierarchy.get("classes", [])
        db_batches = hierarchy.get("batches", [])

        # 3. Map Academic Requirements to Database IDs
        raw_prog_names = raw_extraction.get("allowed_programs") or []
        raw_dept_names = raw_extraction.get("allowed_departments") or []

        mapped_dept_ids = []
        mapped_dept_names = []
        mapped_prog_ids = []
        mapped_prog_names = []
        mapping_records: List[MappingItem] = []
        ambiguous_records: List[MappingItem] = []

        # Map Programs
        for raw_prog in raw_prog_names:
            matched = False
            r_prog_clean = str(raw_prog).strip().lower().replace(".", "").replace(" ", "")
            for p in db_programs:
                p_name_clean = p["name"].strip().lower().replace(".", "").replace(" ", "")
                p_code = (p.get("code") or "").strip().lower()

                if r_prog_clean in p_name_clean or (p_code and r_prog_clean == p_code):
                    mapped_prog_ids.append(p["id"])
                    mapped_prog_names.append(p["name"])
                    mapping_records.append(MappingItem(
                        field="program",
                        raw_value=raw_prog,
                        mapped_id=p["id"],
                        mapped_name=p["name"],
                        confidence=0.98,
                        status="matched",
                        evidence=f"Exact match with institution program '{p['name']}'"
                    ))
                    matched = True
                    break

            if not matched:
                mapping_records.append(MappingItem(
                    field="program",
                    raw_value=raw_prog,
                    mapped_id=None,
                    mapped_name=None,
                    confidence=0.40,
                    status="unmatched",
                    evidence="No matching program found in institution records"
                ))

        # Map Departments
        for raw_dept in raw_dept_names:
            matched = False
            r_dept_lower = str(raw_dept).strip().lower()

            for d in db_departments:
                d_name = d.get("name") or d.get("department_name") or ""
                d_name_lower = d_name.strip().lower()

                is_exact = r_dept_lower == d_name_lower or r_dept_lower in d_name_lower or d_name_lower in r_dept_lower
                is_equivalent = are_departments_equivalent(raw_dept, d_name)

                if is_exact or is_equivalent:
                    mapped_dept_ids.append(d["id"])
                    mapped_dept_names.append(d_name)
                    mapping_records.append(MappingItem(
                        field="department",
                        raw_value=raw_dept,
                        mapped_id=d["id"],
                        mapped_name=d_name,
                        confidence=0.98 if is_exact else 0.95,
                        status="matched",
                        evidence=f"Matched to institution department '{d_name}' (abbreviation / full name parity)"
                    ))
                    matched = True
                    break


            if not matched:
                # Check if ambiguous (e.g. "related disciplines", "all branches")
                if any(w in r_dept_lower for w in ["related", "circuital", "all", "any", "allied"]):
                    amb = MappingItem(
                        field="department",
                        raw_value=raw_dept,
                        mapped_id=None,
                        mapped_name=None,
                        confidence=0.60,
                        status="ambiguous",
                        evidence=f"Ambiguous branch requirement: '{raw_dept}'. TPO manual review required."
                    )
                    mapping_records.append(amb)
                    ambiguous_records.append(amb)
                else:
                    mapping_records.append(MappingItem(
                        field="department",
                        raw_value=raw_dept,
                        mapped_id=None,
                        mapped_name=None,
                        confidence=0.30,
                        status="unmatched",
                        evidence="No department with this name found in institution database."
                    ))

        # Target batches mapping based on passout_year
        mapped_target_batches = []
        passout_yr = raw_extraction.get("passout_year")

        # Retrieve active student graduating batches for this tenant
        inst_student_years = await db.db.students.distinct("passout_year", {"institution_id": institution_id})
        inst_student_years = sorted([int(y) for y in inst_student_years if y is not None and str(y).isdigit()])
        batch_grad_years = [b.get("expected_graduation_year") for b in db_batches if b.get("expected_graduation_year")]
        active_grad_years = sorted(list(set(inst_student_years + batch_grad_years)))

        # If passout year was unspecified in the raw JD, intelligently default to the primary graduating batch
        if not passout_yr and active_grad_years:
            passout_yr = active_grad_years[-1]
            raw_extraction["passout_year"] = passout_yr

        if passout_yr:
            for b in db_batches:
                if b.get("expected_graduation_year") == int(passout_yr):
                    mapped_target_batches.append(b["id"])

        mapped_requirements = {
            "program_ids": list(set(mapped_prog_ids)),
            "program_names": list(set(mapped_prog_names)),
            "department_ids": list(set(mapped_dept_ids)),
            "department_names": list(set(mapped_dept_names)),
            "target_batches": mapped_target_batches,
            "mapping_records": [m.model_dump() for m in mapping_records]
        }

        # 4. Deterministic Validation
        is_valid, issues, missing = await AIDriveValidator.validate_draft(
            extracted=raw_extraction,
            mapped=mapped_requirements,
            institution_id=institution_id
        )

        # 5. Lifecycle Status determination
        if len(missing) > 0 or len(ambiguous_records) > 0 or any(i.severity == "error" for i in issues):
            status = "NEEDS_INPUT"
        elif is_valid:
            status = "READY_FOR_REVIEW"
        else:
            status = "DRAFT"

        # 6. Overall Confidence Calculation
        score = 0.5
        if raw_extraction.get("company_name"): score += 0.1
        if raw_extraction.get("job_role"): score += 0.1
        if raw_extraction.get("package"): score += 0.1
        if passout_yr: score += 0.1
        if mapped_dept_ids: score += 0.1
        confidence_score = min(round(score, 2), 1.0)

        draft = AIDriveDraft(
            institution_id=institution_id,
            created_by=user_id,
            status=status,
            source_jd=source_jd,
            extracted_requirements=raw_extraction,
            mapped_requirements=mapped_requirements,
            missing_fields=missing,
            validation_issues=issues,
            ambiguous_fields=ambiguous_records,
            confidence_score=confidence_score
        )

        return draft

    async def match_student_to_drive(
        self,
        student_id: str,
        drive_id: str,
        institution_id: str
    ) -> StudentMatchResult:
        """
        Compares drive requirements with student profile using:
        - Deterministic Eligibility Engine
        - Board Conversion Service
        - Technical skills matching (mandatory vs preferred)
        - Data quality checks
        - Explainable AI reasoning summary
        """
        student = await AITools.get_student_profile(student_id, institution_id)
        drive = await AITools.get_existing_drive_requirements(drive_id, institution_id)

        if not student:
            raise ValueError(f"Student {student_id} not found under institution {institution_id}")
        if not drive:
            raise ValueError(f"Placement drive {drive_id} not found under institution {institution_id}")

        # 1. Deterministic Eligibility Engine
        is_eligible, reasons, breakdown = evaluate_student_eligibility_detailed(student, drive)

        # 2. Board Conversion Rule check
        conversion_info = None
        sec_edu = student.get("education", {}).get("secondary") or {}
        sec_board = sec_edu.get("board")
        sec_type = sec_edu.get("score_type")
        if sec_board and sec_type and sec_type.upper() in ["CGPA", "GPA"]:
            rule = await find_matching_conversion_rule(sec_board, qualification="10th", institution_id=institution_id)
            if rule:
                conversion_info = {
                    "board": sec_board,
                    "qualification": "10th / Secondary",
                    "original_type": sec_type,
                    "original_score": sec_edu.get("raw_score") or sec_edu.get("normalized_cgpa"),
                    "normalized_percentage": sec_edu.get("normalized_percentage"),
                    "rule_used": rule.get("formula") or f"Multiplier {rule.get('multiplier')}",
                    "explanation": f"Converted {sec_board} {sec_type} to normalized percentage using official rule: {rule.get('formula')}"
                }

        # 3. Categorize Mandatory Criteria
        mandatory_criteria = []
        for item in breakdown:
            mandatory_criteria.append({
                "criterion": item["criterion"],
                "status": item["status"],  # "PASS" | "FAIL"
                "detail": item["detail"],
                "mandatory": True
            })

        # 4. Preferred Criteria (Skills, links)
        preferred_criteria = []
        student_skills = [s.strip().lower() for s in student.get("skills", [])]
        drive_skills = drive.get("required_skills") or []
        for sk in drive_skills:
            sk_clean = sk.strip().lower()
            matched = any(sk_clean == st or sk_clean in st or st in sk_clean for st in student_skills)
            preferred_criteria.append({
                "criterion": f"Skill: {sk}",
                "status": "PASS" if matched else "INFO",
                "detail": f"Student has skill '{sk}'" if matched else f"Skill '{sk}' not explicitly listed in profile",
                "mandatory": False
            })

        # Resume check
        has_resume = bool(student.get("resume_url") or student.get("documents", {}).get("resume"))
        preferred_criteria.append({
            "criterion": "Verified Resume",
            "status": "PASS" if has_resume else "WARNING",
            "detail": "Resume attached" if has_resume else "No resume uploaded in profile",
            "mandatory": False
        })

        # 5. Data Quality Checks
        quality_issues = self.inspect_student_data_quality(student)

        # 6. AI Explanation Narrative
        if is_eligible:
            ai_exp = (
                f"Student meets all {len(mandatory_criteria)} mandatory academic criteria for "
                f"{drive.get('company_name', 'Company')} ({drive.get('job_role', 'Role')}). "
                f"Eligible for 1-click snapshot application."
            )
        else:
            ai_exp = (
                f"Student is currently ineligible for {drive.get('company_name', 'Company')}: "
                f"{'; '.join(reasons)}. Please review mandatory requirements."
            )

        if conversion_info:
            ai_exp += f" Note: Academic score normalized via {conversion_info['board']} bylaws."

        return StudentMatchResult(
            student_id=student_id,
            drive_id=drive_id,
            is_eligible=is_eligible,
            eligibility_reasons=reasons,
            mandatory_criteria=mandatory_criteria,
            preferred_criteria=preferred_criteria,
            conversion_details=conversion_info,
            data_quality_issues=[q.model_dump() for q in quality_issues],
            ai_explanation=ai_exp,
            confidence=0.98 if is_eligible else 1.0
        )

    def inspect_student_data_quality(self, student: Dict[str, Any]) -> List[StudentDataIssue]:
        """
        Inspects student profile for typographical errors, inconsistent dates,
        and missing essential fields without modifying authoritative database records.
        """
        issues: List[StudentDataIssue] = []
        student_id = str(student.get("_id", student.get("student_id", "")))

        # 1. Inspect Skills for Typos
        raw_skills = student.get("skills") or []
        for sk in raw_skills:
            sk_clean = str(sk).strip().lower()
            if sk_clean in KNOWN_TECH_SKILLS:
                canonical = KNOWN_TECH_SKILLS[sk_clean]
                if sk != canonical:
                    issues.append(StudentDataIssue(
                        student_id=student_id,
                        field="skills",
                        issue_type="typo",
                        original_value=sk,
                        suggested_value=canonical,
                        explanation=f"Possible typo/casing: '{sk}' is commonly standardized to '{canonical}'.",
                        confidence=0.96
                    ))

        # 2. Check Resume
        resume = student.get("resume_url") or student.get("documents", {}).get("resume")
        if not resume:
            issues.append(StudentDataIssue(
                student_id=student_id,
                field="documents.resume",
                issue_type="missing",
                original_value=None,
                suggested_value="Upload Resume PDF",
                explanation="No resume PDF found in student documents. Adding a resume is highly recommended for campus hiring.",
                confidence=1.0
            ))

        # 3. Check Portfolio / GitHub Links
        links = student.get("links") or {}
        if not links.get("github"):
            issues.append(StudentDataIssue(
                student_id=student_id,
                field="links.github",
                issue_type="missing",
                original_value=None,
                suggested_value="Add GitHub URL",
                explanation="GitHub profile link is missing. Technical recruiters frequently evaluate code repositories.",
                confidence=0.85
            ))

        return issues

ai_agent = AIAgent()
