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
