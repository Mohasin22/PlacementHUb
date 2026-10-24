import re
from datetime import datetime, timezone
from typing import Optional, Any
from dateutil import parser


def parse_and_normalize_deadline(raw_val: Any) -> Optional[datetime]:
    """
    Parses any human or ISO/standard date-time representation into a timezone-aware UTC datetime.
    - If hours/time are not specified (e.g. '25 November 2026', '2026-11-25', '25/11/2026'),
      the time defaults to 23:59:59 (end of that day), ensuring students have the entire day to apply.
    - If hours/time are specified (e.g. '5:00 PM', '18:00', '11:59 PM'), parses the exact time accurately.
    """
    if not raw_val:
        return None

    if isinstance(raw_val, datetime):
        if raw_val.tzinfo is None:
            return raw_val.replace(tzinfo=timezone.utc)
        return raw_val.astimezone(timezone.utc)

    s = str(raw_val).strip()
    if not s or s.lower() in ("null", "none", ""):
        return None

    # Handle standard ISO format directly
    if "T" in s or s.endswith("Z"):
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            pass

    # Strip conversational prefixes if present (e.g. "Application Deadline: 25 Nov 2026")
    s = re.sub(r"^(?:application\s+deadline|deadline|last\s+date|apply\s+before|due\s+date)\s*[:\-]?\s*", "", s, flags=re.IGNORECASE).strip()

    # Clean ordinals (25th -> 25, 1st -> 1, 2nd -> 2, 3rd -> 3)
    s_clean = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', s, flags=re.IGNORECASE)

    # Detect if explicit time hours/minutes were provided
    has_time = bool(re.search(r'\b(\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\s*(?:am|pm)|midnight|noon)\b', s_clean, re.IGNORECASE))

    # Check common explicit format strings
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
    ):
        try:
            return datetime.strptime(s_clean, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # dateutil fuzzy parser for natural language strings
    try:
        dt = parser.parse(s_clean, fuzzy=True, dayfirst=False)
        if not has_time and dt.hour == 0 and dt.minute == 0 and dt.second == 0:
            dt = dt.replace(hour=23, minute=59, second=59)
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass

    # Fallback to dayfirst=True for date structures like 25/11/2026
    try:
        dt = parser.parse(s_clean, fuzzy=True, dayfirst=True)
        if not has_time and dt.hour == 0 and dt.minute == 0 and dt.second == 0:
            dt = dt.replace(hour=23, minute=59, second=59)
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def normalize_deadline_to_str(raw_val: Any) -> Optional[str]:
    """
    Returns the normalized deadline formatted strictly as 'YYYY-MM-DD HH:MM:SS'.
    Returns None if parsing fails.
    """
    dt = parse_and_normalize_deadline(raw_val)
    if dt:
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return None
