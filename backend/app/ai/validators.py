import re
from typing import Dict, Any, List, Tuple
from datetime import datetime, timezone
from app.ai.schemas import ValidationIssueItem, MissingFieldItem
from app.db.connection import db
from app.db.utils import id_query, parse_id

class AIDriveValidator:
    """
    Deterministic safety and correctness validation layer for AI-generated drives.
    Ensures numeric ranges, dates, required fields, and academic IDs are 100% valid.
    """

    @staticmethod
    async def validate_draft(
        extracted: Dict[str, Any],
        mapped: Dict[str, Any],
        institution_id: str
    ) -> Tuple[bool, List[ValidationIssueItem], List[MissingFieldItem]]:
        """
        Validates draft against schema and institution database records.
        Returns:
            (is_valid: bool, issues: List[ValidationIssueItem], missing_fields: List[MissingFieldItem])
        """
        issues: List[ValidationIssueItem] = []
        missing: List[MissingFieldItem] = []

        # ── 1. Check Required Top-Level Fields ────────────────────────────────
        required_fields = [
            ("company_name", "Company Name", "Name of hiring organization", "text"),
            ("job_role", "Job Role", "Designation/Title being offered", "text"),
            ("package", "Package / CTC", "Offered compensation (e.g. 12 LPA)", "text"),
            ("location", "Job Location", "Work location or base city", "text"),
            ("passout_year", "Passout Year", "Target graduation year (e.g. 2026)", "number"),
            ("drive_deadline", "Application Deadline", "Last date and time for student registration", "date")
        ]

        for field_key, label, desc, field_type in required_fields:
            val = extracted.get(field_key)
            if val is None or str(val).strip() == "" or str(val).lower() == "null":
                missing.append(MissingFieldItem(
                    field=field_key,
                    label=label,
                    description=desc,
                    required=True,
                    suggested_type=field_type
                ))

        # ── 2. Numeric Range Validations ──────────────────────────────────────
        min_cgpa = extracted.get("min_cgpa")
        if min_cgpa is not None:
            try:
                cgpa_val = float(min_cgpa)
                if not (0.0 <= cgpa_val <= 10.0):
                    issues.append(ValidationIssueItem(
                        field="min_cgpa",
                        severity="error",
                        message=f"CGPA must be between 0.0 and 10.0 (received {cgpa_val}).",
                        rule="numeric_range_cgpa"
                    ))
            except (ValueError, TypeError):
                issues.append(ValidationIssueItem(
                    field="min_cgpa",
                    severity="error",
                    message="Invalid numeric format for minimum CGPA.",
                    rule="numeric_type"
                ))

        for pct_field, name in [
            ("min_ug_percentage", "UG Percentage"),
            ("min_tenth_percentage", "10th Percentage"),
            ("min_twelfth_percentage", "12th Percentage")
        ]:
            val = extracted.get(pct_field)
            if val is not None:
                try:
                    pct_val = float(val)
                    if not (0.0 <= pct_val <= 100.0):
                        issues.append(ValidationIssueItem(
                            field=pct_field,
                            severity="error",
                            message=f"{name} must be between 0.0% and 100.0% (received {pct_val}).",
                            rule="numeric_range_percentage"
                        ))
                except (ValueError, TypeError):
                    issues.append(ValidationIssueItem(
                        field=pct_field,
                        severity="error",
                        message=f"Invalid numeric format for {name}.",
                        rule="numeric_type"
                    ))

        max_backlogs = extracted.get("max_backlogs")
        if max_backlogs is not None:
            try:
                bl_val = int(max_backlogs)
                if bl_val < 0:
                    issues.append(ValidationIssueItem(
                        field="max_backlogs",
                        severity="error",
                        message="Active backlogs allowed cannot be negative.",
                        rule="numeric_non_negative"
                    ))
            except (ValueError, TypeError):
                issues.append(ValidationIssueItem(
                    field="max_backlogs",
                    severity="error",
                    message="Invalid integer format for max active backlogs.",
                    rule="integer_type"
                ))

        passout = extracted.get("passout_year")
        if passout is not None:
            try:
                yr_val = int(passout)
                current_year = datetime.now(timezone.utc).year
                if not (2000 <= yr_val <= current_year + 10):
                    issues.append(ValidationIssueItem(
                        field="passout_year",
                        severity="error",
                        message=f"Passout year {yr_val} is outside a reasonable range (2000 - {current_year + 10}).",
                        rule="reasonable_year_range"
                    ))
                else:
                    inst_student_years = await db.db.students.distinct("passout_year", {"institution_id": institution_id})
                    inst_student_years = sorted([int(y) for y in inst_student_years if y is not None and str(y).isdigit()])
                    if inst_student_years and yr_val not in inst_student_years:
                        issues.append(ValidationIssueItem(
                            field="passout_year",
                            severity="warning",
                            message=f"Batch mismatch: 0 students enrolled for passout year {yr_val}. Active college graduating batch is {inst_student_years[-1]}.",
                            rule="batch_student_availability"
                        ))
            except (ValueError, TypeError):
                issues.append(ValidationIssueItem(
                    field="passout_year",
                    severity="error",
                    message="Passout year must be a valid 4-digit integer.",
                    rule="integer_type"
                ))

        # ── 3. Date & Deadline Validation ─────────────────────────────────────
        deadline_raw = extracted.get("drive_deadline")
        if deadline_raw:
            from app.ai.date_utils import parse_and_normalize_deadline
            parsed_dt = parse_and_normalize_deadline(deadline_raw)

            if not parsed_dt:
                issues.append(ValidationIssueItem(
                    field="drive_deadline",
                    severity="error",
                    message=f"Could not parse application deadline: '{deadline_raw}'. Please provide a valid date/time.",
                    rule="valid_datetime"
                ))
            else:
                extracted["drive_deadline"] = parsed_dt.strftime("%Y-%m-%d %H:%M:%S")
                now_utc = datetime.now(timezone.utc)
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                if parsed_dt <= now_utc:
                    issues.append(ValidationIssueItem(
                        field="drive_deadline",
                        severity="warning",
                        message=f"Deadline ({parsed_dt.strftime('%d %b %Y %H:%M:%S')}) is in the past. Ensure this is intentional.",
                        rule="future_deadline"
                    ))

        # ── 4. Verify Academic Hierarchy Existence in MongoDB ─────────────────
        dept_ids = mapped.get("department_ids") or []
        if dept_ids:
            all_inst_depts = await db.db.departments.find({"institution_id": institution_id}).to_list(length=200)
            valid_dept_keys = set()
            for d in all_inst_depts:
                valid_dept_keys.add(str(d.get("_id")))
                if "id" in d: valid_dept_keys.add(str(d["id"]))
                if "department_name" in d: valid_dept_keys.add(str(d["department_name"]).lower())
                if "name" in d: valid_dept_keys.add(str(d["name"]).lower())
                if "code" in d: valid_dept_keys.add(str(d["code"]).lower())

            for did in dept_ids:
                if str(did).lower() not in valid_dept_keys and str(did) not in valid_dept_keys:
                    issues.append(ValidationIssueItem(
                        field="allowed_departments",
                        severity="error",
                        message=f"Department '{did}' does not exist under your institution records.",
                        rule="db_foreign_key_existence"
                    ))

        prog_ids = mapped.get("program_ids") or []
        if prog_ids:
            all_inst_progs = await db.db.programs.find({"institution_id": institution_id}).to_list(length=100)
            valid_prog_keys = set()
            for p in all_inst_progs:
                valid_prog_keys.add(str(p.get("_id")))
                if "id" in p: valid_prog_keys.add(str(p["id"]))
                if "program_name" in p: valid_prog_keys.add(str(p["program_name"]).lower())
                if "name" in p: valid_prog_keys.add(str(p["name"]).lower())
                if "code" in p: valid_prog_keys.add(str(p["code"]).lower())

            for pid in prog_ids:
                if str(pid).lower() not in valid_prog_keys and str(pid) not in valid_prog_keys:
                    issues.append(ValidationIssueItem(
                        field="allowed_programs",
                        severity="error",
                        message=f"Program '{pid}' does not exist under your institution records.",
                        rule="db_foreign_key_existence"
                    ))

        has_errors = any(i.severity == "error" for i in issues)
        is_valid = (not has_errors) and (len(missing) == 0)

        return is_valid, issues, missing
