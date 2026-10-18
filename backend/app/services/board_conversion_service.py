import re
from typing import Dict, Any, Optional, List
from app.db.connection import db
from app.models.canonical_models import BoardConversionRule

DEFAULT_BOARD_RULES: List[Dict[str, Any]] = [
    {
        "board": "CBSE",
        "qualification": "Applicable CGPA scheme",
        "academic_year_from": None,
        "academic_year_to": None,
        "input_type": "CGPA",
        "input_scale": 10.0,
        "output_type": "Percentage",
        "formula": "CGPA * 9.5",
        "multiplier": 9.5,
        "official_source": "CBSE Official Examination Bylaws",
        "active": True,
        "requires_manual_verification": False
    },
    {
        "board": "BSE Andhra Pradesh",
        "qualification": "SSC (2012-2019 GPA scheme)",
        "academic_year_from": 2012,
        "academic_year_to": 2019,
        "input_type": "GPA",
        "input_scale": 10.0,
        "output_type": "Percentage",
        "formula": "GPA * 10",
        "multiplier": 10.0,
        "official_source": "AP Directorate of Government Examinations Circular",
        "active": True,
        "requires_manual_verification": False
    },
    {
        "board": "BSE Telangana",
        "qualification": "SSC (GPA scheme)",
        "academic_year_from": 2014,
        "academic_year_to": 2020,
        "input_type": "GPA",
        "input_scale": 10.0,
        "output_type": "Percentage",
        "formula": "GPA * 10",
        "multiplier": 10.0,
        "official_source": "TS DGE Official Notification",
        "active": True,
        "requires_manual_verification": False
    },
    {
        "board": "Any recognized board",
        "qualification": "Marks-based qualification",
        "academic_year_from": None,
        "academic_year_to": None,
        "input_type": "Marks",
        "input_scale": None,
        "output_type": "Percentage",
        "formula": "obtained_marks / max_marks * 100",
        "multiplier": None,
        "official_source": "Standard Mathematical Proportion",
        "active": True,
        "requires_manual_verification": False
    }
]

async def ensure_default_board_rules():
    """Initializes default board conversion rules in MongoDB if not already present."""
    count = await db.db.board_conversion_rules.count_documents({})
    if count == 0:
        await db.db.board_conversion_rules.insert_many(DEFAULT_BOARD_RULES)

async def find_matching_conversion_rule(
    board: Optional[str],
    qualification: Optional[str] = None,
    passing_year: Optional[Any] = None,
    input_type: Optional[str] = None,
    institution_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Searches for an active board conversion rule (tenant-scoped or default)."""
    if not board:
        return None

    board_clean = board.strip()
    year_int = None
    if passing_year:
        try:
            year_int = int(re.sub(r"\D", "", str(passing_year))[:4])
        except Exception:
            year_int = None

    # 1. Search tenant-specific or global rules in database
    board_regex = f"^{re.escape(board_clean)}"
    query: Dict[str, Any] = {
        "active": True,
        "board": {"$regex": board_regex, "$options": "i"}
    }
    if institution_id:
        query["$or"] = [
            {"institution_id": institution_id},
            {"institution_id": None},
            {"institution_id": {"$exists": False}}
        ]

    rules = await db.db.board_conversion_rules.find(query).to_list(length=10)
    if not rules and "cbse" in board_clean.lower():
        rules = await db.db.board_conversion_rules.find({"active": True, "board": "CBSE"}).to_list(length=10)
    elif not rules and ("ap" in board_clean.lower() or "andhra" in board_clean.lower() or "bseap" in board_clean.lower()):
        rules = await db.db.board_conversion_rules.find({"active": True, "board": {"$regex": "Andhra", "$options": "i"}}).to_list(length=10)

    # 2. Filter by passing year if range is specified
    for rule in rules:
        from_yr = rule.get("academic_year_from")
        to_yr = rule.get("academic_year_to")

        if year_int:
            if from_yr and year_int < from_yr:
                continue
            if to_yr and year_int > to_yr:
                continue

        return rule

    return None

def apply_conversion_rule(
    rule: Optional[Dict[str, Any]],
    raw_score: Any,
    normalized_cgpa: Optional[float],
    normalized_percentage: Optional[float]
) -> Dict[str, Any]:
    """Applies board-specific conversion rule multiplier or returns REQUIRES_REVIEW."""
    if not rule:
        return {
            "normalized_percentage": normalized_percentage,
            "normalized_cgpa": normalized_cgpa,
            "conversion_rule_id": None,
            "verification_status": "VERIFIED" if (normalized_percentage is not None or normalized_cgpa is not None) else "REQUIRES_REVIEW",
            "conversion_method": "Default Direct Normalization"
        }

    rule_id = str(rule.get("_id", rule.get("id", "")))
    multiplier = rule.get("multiplier")
    formula = rule.get("formula", "")

    if multiplier and normalized_cgpa is not None:
        converted_pct = round(normalized_cgpa * multiplier, 2)
        return {
            "normalized_percentage": converted_pct,
            "normalized_cgpa": normalized_cgpa,
            "conversion_rule_id": rule_id,
            "verification_status": "VERIFIED" if not rule.get("requires_manual_verification") else "REQUIRES_REVIEW",
            "conversion_method": f"{rule.get('board')}: {formula or f'CGPA * {multiplier}'}"
        }

    return {
        "normalized_percentage": normalized_percentage,
        "normalized_cgpa": normalized_cgpa,
        "conversion_rule_id": rule_id,
        "verification_status": "VERIFIED" if not rule.get("requires_manual_verification") else "REQUIRES_REVIEW",
        "conversion_method": f"{rule.get('board')}: {formula or 'Standard'}"
    }

async def normalize_academic_record_entry(
    raw_value: Any,
    raw_type: str,  # "percentage", "cgpa", "marks"
    board: Optional[str] = None,
    passing_year: Optional[Any] = None,
    institution_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Standardized normalizer for Requirement 6.
    Ensures percentage, cgpa, and marks are handled correctly without blind interchange.
    Returns:
    {
        "raw_value": ...,
        "raw_type": "percentage"|"cgpa"|"marks",
        "board": ...,
        "normalized_percentage": ...,
        "normalized_cgpa": ...,
        "conversion_rule": ...,
        "conversion_method": ...
    }
    """
    clean_type = (raw_type or "").strip().lower()
    val_float = None
    try:
        val_float = float(re.sub(r"[^\d\.]", "", str(raw_value)))
    except (ValueError, TypeError):
        val_float = None

    rule = await find_matching_conversion_rule(board=board, passing_year=passing_year, institution_id=institution_id)

    if clean_type in ["cgpa", "gpa"]:
        norm_cgpa = val_float
        converted = apply_conversion_rule(rule, raw_score=raw_value, normalized_cgpa=norm_cgpa, normalized_percentage=None)
        return {
            "raw_value": val_float,
            "raw_type": "cgpa",
            "board": board,
            "normalized_cgpa": norm_cgpa,
            "normalized_percentage": converted.get("normalized_percentage"),
            "conversion_rule": str(rule.get("_id") or rule.get("id")) if rule else None,
            "conversion_method": converted.get("conversion_method")
        }
    elif clean_type in ["percentage", "percent", "%"]:
        return {
            "raw_value": val_float,
            "raw_type": "percentage",
            "board": board,
            "normalized_percentage": val_float,
            "normalized_cgpa": None,
            "conversion_rule": None,
            "conversion_method": "Percentage (Direct 0-100)"
        }
    else:
        # Default interpretation
        if val_float is not None:
            if val_float <= 10.0:
                converted = apply_conversion_rule(rule, raw_score=raw_value, normalized_cgpa=val_float, normalized_percentage=None)
                return {
                    "raw_value": val_float,
                    "raw_type": "cgpa",
                    "board": board,
                    "normalized_cgpa": val_float,
                    "normalized_percentage": converted.get("normalized_percentage"),
                    "conversion_rule": str(rule.get("_id") or rule.get("id")) if rule else None,
                    "conversion_method": converted.get("conversion_method")
                }
            else:
                return {
                    "raw_value": val_float,
                    "raw_type": "percentage",
                    "board": board,
                    "normalized_percentage": val_float,
                    "normalized_cgpa": None,
                    "conversion_rule": None,
                    "conversion_method": "Percentage (Direct 0-100)"
                }

    return {
        "raw_value": raw_value,
        "raw_type": clean_type or "unknown",
        "board": board,
        "normalized_percentage": None,
        "normalized_cgpa": None,
        "conversion_rule": None,
        "conversion_method": "Unknown"
    }
