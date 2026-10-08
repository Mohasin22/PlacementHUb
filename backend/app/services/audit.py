from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.db.connection import db

# Sensitive keys that must NEVER be written to audit logs
SENSITIVE_KEYS = {"password", "password_hash", "password_plain", "otp", "otp_code", "secret", "token"}

def sanitize_audit_payload(data: Any) -> Any:
    """Recursively removes passwords, OTPs, and secrets from audit payloads."""
    if isinstance(data, dict):
        clean = {}
        for k, v in data.items():
            if str(k).lower() in SENSITIVE_KEYS:
                clean[k] = "[REDACTED]"
            else:
                clean[k] = sanitize_audit_payload(v)
        return clean
    elif isinstance(data, list):
        return [sanitize_audit_payload(item) for item in data]
    return data

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
    status: str = "success",
    ip: Optional[str] = None
) -> str:
    """
    Inserts a production-grade structured audit log entry in MongoDB.
    Strictly redacts any secrets, passwords, or OTPs.
    """
    clean_details = sanitize_audit_payload(details or {})
    clean_old = sanitize_audit_payload(old_value) if old_value is not None else None
    clean_new = sanitize_audit_payload(new_value) if new_value is not None else None

    entry = {
        "action": action,
        "actor": actor,
        "actor_role": actor_role,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "institution_id": str(institution_id) if institution_id else None,
        "old_value": clean_old,
        "new_value": clean_new,
        "details": clean_details,
        "ip": ip,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status
    }
    res = await db.db.audit_logs.insert_one(entry)
    return str(res.inserted_id)
