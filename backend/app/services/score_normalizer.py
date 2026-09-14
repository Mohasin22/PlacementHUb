import re
from typing import Dict, Any, Optional, Tuple

WORD_NUMBERS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "point": "."
}

def parse_words_to_number(text: str) -> Optional[float]:
    """Converts phrases like 'Eight point two' or 'Nine point five' into floats."""
    clean = text.lower().strip()
    tokens = clean.split()
    if not tokens:
        return None
    
    num_str = ""
    for t in tokens:
        if t in WORD_NUMBERS:
            num_str += str(WORD_NUMBERS[t])
        else:
            return None
    try:
        return float(num_str)
    except ValueError:
        return None

def normalize_academic_score(
    raw_val: Any,
    expected_type: Optional[str] = None  # "Percentage", "CGPA", "Marks", or None
) -> Dict[str, Any]:
    """
    Structured parsing of academic scores preserving raw text, units, scales, and coverage notes.
    Returns:
      raw_value: str
      score_type: "Percentage" | "CGPA" | "Marks" | "GPA" | "Unknown"
      normalized_percentage: float | None
      normalized_cgpa: float | None
      normalized_value: float | None
      coverage: str | None (e.g., "till II-II")
      normalization_method: str | None
      verification_status: "VERIFIED" | "REQUIRES_REVIEW"
    """
    if raw_val is None:
        return {
            "raw_value": None,
            "score_type": None,
            "normalized_percentage": None,
            "normalized_cgpa": None,
            "normalized_value": None,
            "coverage": None,
            "normalization_method": None,
            "verification_status": "VERIFIED"
        }

    raw_str = str(raw_val).strip()
    if not raw_str or raw_str.lower() in ["none", "nan", "null", "undefined", "-", "na", "n/a", "nil"]:
        return {
            "raw_value": raw_str,
            "score_type": None,
            "normalized_percentage": None,
            "normalized_cgpa": None,
            "normalized_value": None,
            "coverage": None,
            "normalization_method": None,
            "verification_status": "VERIFIED"
        }

    # Detect known invalid non-numeric texts like "Don't know", "No", "Pass"
    invalid_patterns = [r"don'?t\s*know", r"^no$", r"^yes$", r"^pass$", r"^failed$", r"^not\s*applicable"]
    for ip in invalid_patterns:
        if re.search(ip, raw_str, re.IGNORECASE):
            return {
                "raw_value": raw_str,
                "score_type": "Unknown",
                "normalized_percentage": None,
                "normalized_cgpa": None,
                "normalized_value": None,
                "coverage": None,
                "normalization_method": "Invalid text value",
                "verification_status": "REQUIRES_REVIEW"
            }

    # Extract coverage notes inside parentheses e.g. "8.38(till II-II)" or "(upto 3-1)"
    coverage = None
    coverage_match = re.search(r"\(([^)]+)\)", raw_str)
    if coverage_match:
        coverage = coverage_match.group(1).strip()
        cleaned_text = re.sub(r"\([^)]+\)", "", raw_str).strip()
    else:
        cleaned_text = raw_str

    # 1. Check for word representation e.g. "Eight point two"
    word_num = parse_words_to_number(cleaned_text)
    if word_num is not None:
        if word_num <= 10.0:
            return {
                "raw_value": raw_str,
                "score_type": "CGPA",
                "normalized_cgpa": round(word_num, 2),
                "normalized_percentage": round(word_num * 9.5, 2),
                "normalized_value": round(word_num, 2),
                "coverage": coverage,
                "normalization_method": "Words to CGPA",
                "verification_status": "VERIFIED"
            }
        else:
            return {
                "raw_value": raw_str,
                "score_type": "Percentage",
                "normalized_cgpa": round(word_num / 9.5, 2),
                "normalized_percentage": round(word_num, 2),
                "normalized_value": round(word_num, 2),
                "coverage": coverage,
                "normalization_method": "Words to Percentage",
                "verification_status": "VERIFIED"
            }

    # 2. Check for Marks fraction e.g. "355/500" or "820 / 1000" or "8.20/10"
    fraction_match = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", cleaned_text)
    if fraction_match:
        obtained = float(fraction_match.group(1))
        max_marks = float(fraction_match.group(2))
        if max_marks > 0:
            if max_marks <= 10.0:
                # e.g. 8.20/10
                return {
                    "raw_value": raw_str,
                    "score_type": "CGPA",
                    "normalized_cgpa": round(obtained, 2),
                    "normalized_percentage": round((obtained / max_marks) * 100, 2),
                    "normalized_value": round(obtained, 2),
                    "coverage": coverage,
                    "normalization_method": "Scale 10 fraction",
                    "verification_status": "VERIFIED"
                }
            else:
                pct = round((obtained / max_marks) * 100, 2)
                return {
                    "raw_value": raw_str,
                    "score_type": "Marks",
                    "normalized_percentage": pct,
                    "normalized_cgpa": round(pct / 9.5, 2),
                    "normalized_value": pct,
                    "coverage": coverage,
                    "normalization_method": f"Marks fraction ({obtained}/{max_marks})",
                    "verification_status": "VERIFIED"
                }

    # 3. Check for Percentage indicators e.g. "95%", "95 percentage", "95 percent", "95 %"
    pct_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?)", cleaned_text, re.IGNORECASE)
    if pct_match:
        val = float(pct_match.group(1))
        return {
            "raw_value": raw_str,
            "score_type": "Percentage",
            "normalized_percentage": round(val, 2),
            "normalized_cgpa": round(val / 9.5, 2),
            "normalized_value": round(val, 2),
            "coverage": coverage,
            "normalization_method": "Percentage string parsing",
            "verification_status": "VERIFIED"
        }

    # 4. Check for CGPA / GPA indicators e.g. "8.7 CGPA", "CGPA - 8.7", "GPA: 9.1"
    cgpa_prefix_match = re.search(r"(?:CGPA|GPA)\s*[-:]?\s*(\d+(?:\.\d+)?)", cleaned_text, re.IGNORECASE)
    if cgpa_prefix_match:
        val = float(cgpa_prefix_match.group(1))
        return {
            "raw_value": raw_str,
            "score_type": "CGPA",
            "normalized_cgpa": round(val, 2),
            "normalized_percentage": round(val * 9.5, 2),
            "normalized_value": round(val, 2),
            "coverage": coverage,
            "normalization_method": "CGPA indicator parsing",
            "verification_status": "VERIFIED"
        }

    cgpa_suffix_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:CGPA|GPA)", cleaned_text, re.IGNORECASE)
    if cgpa_suffix_match:
        val = float(cgpa_suffix_match.group(1))
        return {
            "raw_value": raw_str,
            "score_type": "CGPA",
            "normalized_cgpa": round(val, 2),
            "normalized_percentage": round(val * 9.5, 2),
            "normalized_value": round(val, 2),
            "coverage": coverage,
            "normalization_method": "CGPA suffix parsing",
            "verification_status": "VERIFIED"
        }

    # 5. Extract standalone float / numeric value
    num_match = re.search(r"[-+]?\d*\.?\d+", cleaned_text)
    if num_match:
        val = float(num_match.group(0))

        # Check for decimal percentage e.g. 0.71 -> 71.0, 0.95 -> 95.0
        if 0.0 < val < 1.0:
            pct = round(val * 100, 2)
            return {
                "raw_value": raw_str,
                "score_type": "Percentage",
                "normalized_percentage": pct,
                "normalized_cgpa": round(pct / 9.5, 2),
                "normalized_value": pct,
                "coverage": coverage,
                "normalization_method": "Decimal percentage scaling (*100)",
                "verification_status": "VERIFIED"
            }

        # Value between 1.0 and 10.0 (typically CGPA or GPA, unless expected_type is Percentage)
        if 0.0 <= val <= 10.0:
            if expected_type == "Percentage":
                return {
                    "raw_value": raw_str,
                    "score_type": "Percentage",
                    "normalized_percentage": round(val, 2),
                    "normalized_cgpa": round(val / 9.5, 2),
                    "normalized_value": round(val, 2),
                    "coverage": coverage,
                    "normalization_method": "Explicit Percentage",
                    "verification_status": "VERIFIED"
                }
            return {
                "raw_value": raw_str,
                "score_type": "CGPA",
                "normalized_cgpa": round(val, 2),
                "normalized_percentage": round(val * 9.5, 2),
                "normalized_value": round(val, 2),
                "coverage": coverage,
                "normalization_method": "10-point scale detected",
                "verification_status": "VERIFIED"
            }

        # Value between 10.0 and 100.0 (Percentage)
        if 10.0 < val <= 100.0:
            return {
                "raw_value": raw_str,
                "score_type": "Percentage",
                "normalized_percentage": round(val, 2),
                "normalized_cgpa": round(val / 9.5, 2),
                "normalized_value": round(val, 2),
                "coverage": coverage,
                "normalization_method": "100-point scale detected",
                "verification_status": "VERIFIED"
            }

        # Value > 100 (Marks out of 500, 600, 1000 etc.)
        if val > 100.0:
            # Ambiguous total marks scale unless provided -> flag for review
            return {
                "raw_value": raw_str,
                "score_type": "Marks",
                "normalized_percentage": None,
                "normalized_cgpa": None,
                "normalized_value": round(val, 2),
                "coverage": coverage,
                "normalization_method": "Raw Marks > 100 without max scale",
                "verification_status": "REQUIRES_REVIEW"
            }

    # 6. Fallback if no numeric pattern matched
    return {
        "raw_value": raw_str,
        "score_type": "Unknown",
        "normalized_percentage": None,
        "normalized_cgpa": None,
        "normalized_value": None,
        "coverage": None,
        "normalization_method": "Unrecognized format",
        "verification_status": "REQUIRES_REVIEW"
    }
