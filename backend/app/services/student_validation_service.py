import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import os

class StudentValidationService:
    """
    Centralized Student Data Validation Engine.
    Validates personal data, academic data, 10th/12th/diploma records,
    skills, projects, internships, documents (resume/photo), social links,
    and backlog history.
    Detects missing items and invalid/suspicious values.
    Returns categorized reports with VALID, WARNING, ERROR, MISSING flags.
    """

    SAFE_PROTOCOLS = ("http://", "https://")
    DANGEROUS_PROTOCOLS = ("javascript:", "data:", "file:", "vbscript:")
    SUPPORTED_RESUME_EXTENSIONS = (".pdf", ".docx", ".doc")

    @classmethod
    def is_safe_url(cls, url: Optional[str]) -> bool:
        if not url:
            return True
        u = str(url).strip().lower()
        if any(u.startswith(p) for p in cls.DANGEROUS_PROTOCOLS):
            return False
        # Must start with http:// or https:// or be an internal relative path starting with /api/
        return any(u.startswith(p) for p in cls.SAFE_PROTOCOLS) or u.startswith("/api/")

    @classmethod
    def validate_resume_format(cls, url_or_filename: Optional[str]) -> Dict[str, Any]:
        """Validates resume file format, existence, and safe protocol."""
        if not url_or_filename or not str(url_or_filename).strip():
            return {
                "available": False,
                "status": "MISSING",
                "message": "Resume Missing ✕",
                "is_pdf": False
            }

        url_str = str(url_or_filename).strip()
        if not cls.is_safe_url(url_str):
            return {
                "available": False,
                "status": "ERROR",
                "message": "Insecure or unsafe resume link protocol",
                "is_pdf": False
            }

        lower_url = url_str.lower()
        has_supported_ext = any(lower_url.endswith(ext) or ext in lower_url for ext in cls.SUPPORTED_RESUME_EXTENSIONS)
        is_pdf = lower_url.endswith(".pdf") or ".pdf" in lower_url

        # Check google drive or storage link
        is_drive_or_cloud = "drive.google.com" in lower_url or "docs.google.com" in lower_url or "/api/files/" in lower_url

        if not has_supported_ext and not is_drive_or_cloud:
            return {
                "available": True,
                "status": "WARNING",
                "message": "Resume format may not be standard PDF/DOCX",
                "is_pdf": is_pdf
            }

        return {
            "available": True,
            "status": "VALID",
            "message": "Resume Available ✓",
            "is_pdf": is_pdf
        }

    @classmethod
    def validate_student(cls, student: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs comprehensive validation across all 10 student data categories.
        Returns:
            overall_status: 'COMPLETE' | 'INCOMPLETE'
            categories: Dict[category_name, CategoryValidationResult]
            missing_items: List[str]
            error_items: List[str]
            warning_items: List[str]
            valid_items: List[str]
        """
        categories = {}
        missing_list = []
        error_list = []
        warning_list = []
        valid_list = []

        # ── 1. PERSONAL DATA ──────────────────────────────────────────────────
        personal_checks = []
        name = student.get("name") or student.get("identity", {}).get("full_name")
        if name and len(str(name).strip()) >= 2:
            personal_checks.append({"field": "Full Name", "status": "VALID", "message": "Valid name"})
            valid_list.append("Full Name")
        else:
            personal_checks.append({"field": "Full Name", "status": "ERROR", "message": "Full Name missing or too short"})
            missing_list.append("Full Name")

        roll = student.get("roll_number") or student.get("student_id")
        if roll and len(str(roll).strip()) >= 2:
            personal_checks.append({"field": "Roll Number", "status": "VALID", "message": "Valid roll number"})
            valid_list.append("Roll Number")
        else:
            personal_checks.append({"field": "Roll Number", "status": "ERROR", "message": "Roll Number missing"})
            missing_list.append("Roll Number")

        dob = student.get("dob") or student.get("identity", {}).get("date_of_birth")
        if dob:
            personal_checks.append({"field": "Date of Birth", "status": "VALID", "message": f"DOB: {dob}"})
            valid_list.append("Date of Birth")
        else:
            personal_checks.append({"field": "Date of Birth", "status": "WARNING", "message": "Date of birth missing"})
            warning_list.append("Date of Birth Missing")

        gender = student.get("gender") or student.get("identity", {}).get("gender")
        if gender and str(gender).lower() not in ["not specified", ""]:
            personal_checks.append({"field": "Gender", "status": "VALID", "message": str(gender)})
            valid_list.append("Gender")
        else:
            personal_checks.append({"field": "Gender", "status": "WARNING", "message": "Gender not specified"})
            warning_list.append("Gender Not Specified")

        mobile = student.get("mobile") or student.get("contact", {}).get("mobile")
        if mobile:
            clean_digits = re.sub(r"\D", "", str(mobile))
            if len(clean_digits) in [10, 11, 12]:
                personal_checks.append({"field": "Mobile Number", "status": "VALID", "message": str(mobile)})
                valid_list.append("Mobile Number")
            else:
                personal_checks.append({"field": "Mobile Number", "status": "ERROR", "message": "Invalid mobile length"})
                error_list.append("Invalid Mobile Number")
        else:
            personal_checks.append({"field": "Mobile Number", "status": "ERROR", "message": "Mobile number missing"})
            missing_list.append("Mobile Number")

        inst_email = student.get("institute_email") or student.get("contact", {}).get("institutional_email") or student.get("emails", {}).get("institute")
        if inst_email and "@" in str(inst_email):
            personal_checks.append({"field": "Institute Email", "status": "VALID", "message": str(inst_email)})
            valid_list.append("Institute Email")
        else:
            personal_checks.append({"field": "Institute Email", "status": "WARNING", "message": "Institutional email missing"})
            warning_list.append("Institute Email Missing")

        personal_email = student.get("personal_email") or student.get("contact", {}).get("personal_email") or student.get("emails", {}).get("personal")
        if personal_email and "@" in str(personal_email):
            personal_checks.append({"field": "Personal Email", "status": "VALID", "message": str(personal_email)})
            valid_list.append("Personal Email")
        else:
            personal_checks.append({"field": "Personal Email", "status": "WARNING", "message": "Personal email missing"})
            warning_list.append("Personal Email Missing")

        categories["Personal Information"] = {
            "checks": personal_checks,
            "status": "ERROR" if any(c["status"] == "ERROR" for c in personal_checks) else "COMPLETE"
        }

        # ── 2. ACADEMIC DATA ──────────────────────────────────────────────────
        acad_checks = []
        prog = student.get("program_name") or student.get("academic_identity", {}).get("program_name")
        if prog:
            acad_checks.append({"field": "Program", "status": "VALID", "message": str(prog)})
            valid_list.append("Program")
        else:
            acad_checks.append({"field": "Program", "status": "ERROR", "message": "Degree / Program missing"})
            missing_list.append("Program")

        dept = student.get("department_name") or student.get("academic_identity", {}).get("department_name")
        if dept:
            acad_checks.append({"field": "Department", "status": "VALID", "message": str(dept)})
            valid_list.append("Department")
        else:
            acad_checks.append({"field": "Department", "status": "ERROR", "message": "Department missing"})
            missing_list.append("Department")

        cgpa = student.get("cgpa") if student.get("cgpa") is not None else student.get("education", {}).get("undergraduate", {}).get("normalized_cgpa")
        if cgpa is not None:
            try:
                cgpa_val = float(cgpa)
                if 0.0 <= cgpa_val <= 10.0:
                    acad_checks.append({"field": "UG CGPA", "status": "VALID", "message": f"{cgpa_val:.2f} / 10.0"})
                    valid_list.append("UG CGPA")
                else:
                    acad_checks.append({"field": "UG CGPA", "status": "ERROR", "message": f"CGPA {cgpa_val} out of standard 0-10 range"})
                    error_list.append("CGPA out of range (0-10)")
            except (ValueError, TypeError):
                acad_checks.append({"field": "UG CGPA", "status": "ERROR", "message": f"Invalid CGPA value '{cgpa}'"})
                error_list.append("Invalid CGPA value")
        else:
            acad_checks.append({"field": "UG CGPA", "status": "ERROR", "message": "CGPA Missing"})
            missing_list.append("UG CGPA")

        active_backlogs = student.get("active_backlogs") if student.get("active_backlogs") is not None else student.get("eligibility_data", {}).get("current_backlogs")
        if active_backlogs is not None:
            acad_checks.append({"field": "Active Backlogs", "status": "VALID", "message": f"{active_backlogs} active backlogs"})
            valid_list.append("Active Backlogs")
        else:
            acad_checks.append({"field": "Active Backlogs", "status": "WARNING", "message": "Active backlog count not specified"})
            warning_list.append("Active Backlogs Not Specified")

        categories["Academic Information"] = {
            "checks": acad_checks,
            "status": "ERROR" if any(c["status"] == "ERROR" for c in acad_checks) else "COMPLETE"
        }

        # ── 3. 10TH DATA ──────────────────────────────────────────────────────
        tenth_checks = []
        sec_edu = student.get("education", {}).get("secondary") if isinstance(student.get("education"), dict) else None
        tenth_pct = sec_edu.get("normalized_percentage") if sec_edu else student.get("tenth_percentage")
        tenth_board = sec_edu.get("board") if sec_edu else student.get("tenth_board")

        if tenth_board:
            tenth_checks.append({"field": "10th Board", "status": "VALID", "message": str(tenth_board)})
            valid_list.append("10th Board")
        else:
            tenth_checks.append({"field": "10th Board", "status": "WARNING", "message": "10th board missing"})
            warning_list.append("10th Board Missing")

        if tenth_pct is not None:
            try:
                t_pct = float(tenth_pct)
                if 0 <= t_pct <= 100:
                    tenth_checks.append({"field": "10th Percentage", "status": "VALID", "message": f"{t_pct:.2f}%"})
                    valid_list.append("10th Percentage")
                else:
                    tenth_checks.append({"field": "10th Percentage", "status": "ERROR", "message": f"10th score {t_pct}% out of range (0-100)"})
                    error_list.append("10th score out of range")
            except (ValueError, TypeError):
                tenth_checks.append({"field": "10th Percentage", "status": "ERROR", "message": "Invalid 10th score value"})
                error_list.append("Invalid 10th score value")
        else:
            tenth_checks.append({"field": "10th Percentage", "status": "WARNING", "message": "10th percentage missing"})
            missing_list.append("10th Percentage")

        categories["10th Information"] = {
            "checks": tenth_checks,
            "status": "ERROR" if any(c["status"] == "ERROR" for c in tenth_checks) else ("COMPLETE" if tenth_pct is not None else "INCOMPLETE")
        }

        # ── 4. 12TH / DIPLOMA DATA ────────────────────────────────────────────
        twelfth_checks = []
        twelfth_edu = student.get("education", {}).get("higher_secondary_or_diploma") if isinstance(student.get("education"), dict) else None
        twelfth_pct = twelfth_edu.get("normalized_percentage") if twelfth_edu else student.get("twelfth_percentage")
        twelfth_board = twelfth_edu.get("board") if twelfth_edu else student.get("twelfth_board")

        if twelfth_board:
            twelfth_checks.append({"field": "12th/Diploma Board", "status": "VALID", "message": str(twelfth_board)})
            valid_list.append("12th/Diploma Board")
        else:
            twelfth_checks.append({"field": "12th/Diploma Board", "status": "WARNING", "message": "12th/Diploma board missing"})
            warning_list.append("12th/Diploma Board Missing")

        if twelfth_pct is not None:
            try:
                tw_pct = float(twelfth_pct)
                if 0 <= tw_pct <= 100:
                    twelfth_checks.append({"field": "12th/Diploma Percentage", "status": "VALID", "message": f"{tw_pct:.2f}%"})
                    valid_list.append("12th/Diploma Percentage")
                else:
                    twelfth_checks.append({"field": "12th/Diploma Percentage", "status": "ERROR", "message": f"12th score {tw_pct}% out of range (0-100)"})
                    error_list.append("12th score out of range")
            except (ValueError, TypeError):
                twelfth_checks.append({"field": "12th/Diploma Percentage", "status": "ERROR", "message": "Invalid 12th score value"})
                error_list.append("Invalid 12th score value")
        else:
            twelfth_checks.append({"field": "12th/Diploma Percentage", "status": "WARNING", "message": "12th/Diploma percentage missing"})
            missing_list.append("12th Percentage")

        categories["12th Information"] = {
            "checks": twelfth_checks,
            "status": "ERROR" if any(c["status"] == "ERROR" for c in twelfth_checks) else ("COMPLETE" if twelfth_pct is not None else "INCOMPLETE")
        }

        # ── 5. RESUME & DOCUMENTS ─────────────────────────────────────────────
        doc_checks = []
        resume_url = student.get("resume_url") or student.get("documents", {}).get("resume")
        resume_status = cls.validate_resume_format(resume_url)
        doc_checks.append({
            "field": "Resume Document",
            "status": resume_status["status"],
            "message": resume_status["message"]
        })
        if resume_status["status"] == "VALID":
            valid_list.append("Resume")
        elif resume_status["status"] == "MISSING":
            missing_list.append("Resume Missing")
        else:
            error_list.append("Resume Error: " + resume_status["message"])

        photo_url = student.get("photo_url") or student.get("documents", {}).get("profile_photo")
        if photo_url:
            if cls.is_safe_url(photo_url):
                doc_checks.append({"field": "Profile Photo", "status": "VALID", "message": "Photo uploaded ✓"})
                valid_list.append("Profile Photo")
            else:
                doc_checks.append({"field": "Profile Photo", "status": "ERROR", "message": "Unsafe photo URL"})
                error_list.append("Unsafe photo URL")
        else:
            doc_checks.append({"field": "Profile Photo", "status": "WARNING", "message": "Photo not uploaded"})
            warning_list.append("Profile Photo Missing")

        categories["Resume & Documents"] = {
            "checks": doc_checks,
            "status": "COMPLETE" if resume_status["status"] == "VALID" else "INCOMPLETE"
        }

        # ── 6. SOCIAL & PROFESSIONAL LINKS ────────────────────────────────────
        links = student.get("links") or {}
        link_checks = []
        for lk_name, lk_key in [("LinkedIn", "linkedin"), ("GitHub", "github"), ("Portfolio", "portfolio")]:
            lk_val = links.get(lk_key)
            if lk_val:
                if cls.is_safe_url(lk_val):
                    link_checks.append({"field": lk_name, "status": "VALID", "message": str(lk_val)})
                    valid_list.append(lk_name)
                else:
                    link_checks.append({"field": lk_name, "status": "ERROR", "message": f"Unsafe protocol in {lk_name} link"})
                    error_list.append(f"Unsafe protocol in {lk_name}")
            else:
                link_checks.append({"field": lk_name, "status": "WARNING", "message": f"{lk_name} link not provided"})
                warning_list.append(f"{lk_name} Missing")

        categories["Professional Links"] = {
            "checks": link_checks,
            "status": "COMPLETE" if any(c["status"] == "VALID" for c in link_checks) else "INCOMPLETE"
        }

        # ── 7. SKILLS & PROJECTS ──────────────────────────────────────────────
        skills = student.get("skills") or []
        projects = student.get("projects") or []
        content_checks = []
        if skills and len(skills) > 0:
            content_checks.append({"field": "Technical Skills", "status": "VALID", "message": f"{len(skills)} skills listed"})
            valid_list.append("Technical Skills")
        else:
            content_checks.append({"field": "Technical Skills", "status": "WARNING", "message": "No skills entered"})
            warning_list.append("Skills Missing")

        if projects and len(projects) > 0:
            content_checks.append({"field": "Projects", "status": "VALID", "message": f"{len(projects)} projects listed"})
            valid_list.append("Projects")
        else:
            content_checks.append({"field": "Projects", "status": "WARNING", "message": "No projects entered"})
            warning_list.append("Projects Missing")

        categories["Skills & Projects"] = {
            "checks": content_checks,
            "status": "COMPLETE" if (skills and projects) else "INCOMPLETE"
        }

        # ── 8. BACKLOG HISTORY ────────────────────────────────────────────────
        history = student.get("backlog_history") or []
        backlog_checks = [
            {
                "field": "Backlog History",
                "status": "VALID",
                "message": f"{len(history)} backlog entries recorded in timeline" if history else "No backlogs recorded (Clean record)"
            }
        ]
        categories["Backlog History"] = {
            "checks": backlog_checks,
            "status": "COMPLETE"
        }

        overall_status = "COMPLETE"
        if len(error_list) > 0 or len(missing_list) > 0:
            overall_status = "INCOMPLETE"

        return {
            "overall_status": overall_status,
            "categories": categories,
            "summary": {
                "total_checks": len(valid_list) + len(warning_list) + len(error_list) + len(missing_list),
                "valid_count": len(valid_list),
                "warning_count": len(warning_list),
                "error_count": len(error_list),
                "missing_count": len(missing_list)
            },
            "valid_items": valid_list,
            "warning_items": warning_list,
            "error_items": error_list,
            "missing_items": missing_list
        }
