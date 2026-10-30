from bson import ObjectId
from typing import Any, Dict, Optional

def parse_id(val: Any) -> Any:
    if not val:
        return val
    if isinstance(val, ObjectId):
        return val
    str_val = str(val)
    if ObjectId.is_valid(str_val):
        return ObjectId(str_val)
    return str_val

def id_query(id_val: Any, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not id_val:
        return extra or {}
    str_val = str(id_val)
    conds = [{"_id": str_val}, {"id": str_val}, {"user_id": str_val}]
    if ObjectId.is_valid(str_val):
        conds.append({"_id": ObjectId(str_val)})
    base = {"$or": conds}
    if extra:
        return {"$and": [base, extra]}
    return base


def sanitize_student_record(doc: Any) -> Any:
    """Explicitly excludes password hashes and plain passwords from student documents."""
    if not isinstance(doc, dict):
        return doc
    doc.pop("password_hash", None)
    doc.pop("password_plain", None)
    if "authentication" in doc and isinstance(doc["authentication"], dict):
        doc["authentication"].pop("password_hash", None)
        doc["authentication"].pop("password_plain", None)
    return doc

def sanitize_user_record(doc: Any) -> Any:
    """Explicitly excludes password hashes and credentials from user documents."""
    if not isinstance(doc, dict):
        return doc
    doc.pop("password_hash", None)
    doc.pop("password_plain", None)
    return doc
