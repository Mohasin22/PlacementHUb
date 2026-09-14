from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.connection import db

async def log_audit_event(
    action: str,
    actor: str,
    actor_role: str,
    entity_type: str,
    entity_id: str,
    institution_id: Optional[str] = None,
    old_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    details: Optional[Dict[str, Any]] = None,
    status: str = "success"
) -> str:
    """Inserts a structured audit log entry in MongoDB."""
    entry = {
        "action": action,
        "actor": actor,
        "actor_role": actor_role,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "institution_id": str(institution_id) if institution_id else None,
        "old_value": old_value,
        "new_value": new_value,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status
    }
    res = await db.db.audit_logs.insert_one(entry)
    return str(res.inserted_id)
