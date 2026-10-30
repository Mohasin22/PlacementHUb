import logging
from pymongo import ASCENDING, DESCENDING, IndexModel

logger = logging.getLogger("app.db.init_indexes")

async def _safe_create_indexes(collection, index_models):
    """Creates indexes one by one, gracefully skipping any index that already exists with a different name or configuration."""
    for model in index_models:
        try:
            await collection.create_indexes([model])
        except Exception as e:
            err_msg = str(e).lower()
            if "already exists" in err_msg or "indexoptionsconflict" in err_msg:
                logger.debug(f"Index on {collection.name} already exists: {e}")
            else:
                logger.warning(f"Note on creating index on {collection.name}: {e}")

async def initialize_database_indexes(database):
    """
    Ensures all required indexes, compound keys, unique constraints,
    and TTL indexes are created in MongoDB. Safe to run idempotently.
    Works seamlessly across real MongoDB (Motor) and in-memory mock clients.
    """
    if database is None:
        logger.warning("No database instance provided to initialize_database_indexes.")
        return

    logger.info("Initializing MongoDB collection indexes...")

    # 1. users
    await _safe_create_indexes(database.users, [
        IndexModel([("email", ASCENDING)], unique=True, name="idx_users_email_unique"),
        IndexModel([("institution_id", ASCENDING), ("role", ASCENDING), ("is_active", ASCENDING)], name="idx_users_tenant_role")
    ])

    # 2. students
    await _safe_create_indexes(database.students, [
        IndexModel([("institution_id", ASCENDING), ("roll_number", ASCENDING)], unique=True, partialFilterExpression={"roll_number": {"$type": "string"}}, name="idx_students_roll_unique"),
        IndexModel([("institution_id", ASCENDING), ("student_id", ASCENDING)], unique=True, partialFilterExpression={"student_id": {"$type": "string"}}, name="idx_students_id_unique"),
        IndexModel([("contact.institutional_email", ASCENDING)], sparse=True, name="idx_students_inst_email"),
        IndexModel([("contact.personal_email", ASCENDING)], sparse=True, name="idx_students_pers_email"),
        IndexModel([("emails.institute", ASCENDING)], sparse=True, name="idx_students_compat_inst_email"),
        IndexModel([("emails.personal", ASCENDING)], sparse=True, name="idx_students_compat_pers_email"),
        IndexModel([("institution_id", ASCENDING), ("status", ASCENDING)], name="idx_students_tenant_status"),
        IndexModel([("institution_id", ASCENDING), ("approval.faculty_status", ASCENDING)], name="idx_students_faculty_queue"),
        IndexModel([("institution_id", ASCENDING), ("department_id", ASCENDING), ("academic_batch_id", ASCENDING), ("class_id", ASCENDING)], name="idx_students_hierarchy"),
        IndexModel([("institution_id", ASCENDING), ("expected_graduation_year", ASCENDING)], name="idx_students_grad_year")
    ])

    # 3. applications
    await _safe_create_indexes(database.applications, [
        IndexModel([("drive_id", ASCENDING), ("student_id", ASCENDING)], unique=True, name="idx_app_drive_student_unique"),
        IndexModel([("institution_id", ASCENDING), ("drive_id", ASCENDING), ("status", ASCENDING)], name="idx_app_tenant_drive_status"),
        IndexModel([("institution_id", ASCENDING), ("student_id", ASCENDING), ("status", ASCENDING)], name="idx_app_tenant_student_status"),
        IndexModel([("drive_id", ASCENDING), ("applied_at", DESCENDING)], name="idx_app_drive_applied")
    ])

    # 4. placement_drives
    await _safe_create_indexes(database.placement_drives, [
        IndexModel([("institution_id", ASCENDING), ("drive_deadline", ASCENDING)], name="idx_drives_tenant_deadline"),
        IndexModel([("institution_id", ASCENDING), ("created_at", DESCENDING)], name="idx_drives_tenant_created")
    ])

    # 5. otp_sessions (Includes TTL Index for automatic expiration)
    await _safe_create_indexes(database.otp_sessions, [
        IndexModel([("email", ASCENDING)], name="idx_otp_email"),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="idx_otp_ttl_expiration")
    ])

    # 6. Academic Hierarchy
    await _safe_create_indexes(database.classes, [
        IndexModel([("department_id", ASCENDING), ("academic_batch_id", ASCENDING)], name="idx_classes_dept_batch"),
        IndexModel([("faculty_coordinator_id", ASCENDING)], sparse=True, name="idx_classes_faculty_coord")
    ])
    await _safe_create_indexes(database.departments, [
        IndexModel([("institution_id", ASCENDING), ("program_id", ASCENDING)], name="idx_dept_tenant_program")
    ])
    await _safe_create_indexes(database.academic_batches, [
        IndexModel([("institution_id", ASCENDING), ("program_id", ASCENDING), ("admission_year", DESCENDING)], name="idx_batches_tenant_program_year")
    ])
    await _safe_create_indexes(database.academic_calendars, [
        IndexModel([("institution_id", ASCENDING), ("active", ASCENDING)], name="idx_cal_tenant_active")
    ])

    # 7. Submissions, Duplicates & Ancillary
    await _safe_create_indexes(database.student_pending_submissions, [
        IndexModel([("institution_id", ASCENDING), ("status", ASCENDING), ("roll_number", ASCENDING)], name="idx_pending_sub_tenant_status"),
        IndexModel([("institute_email", ASCENDING)], sparse=True, name="idx_pending_sub_email")
    ])
    await _safe_create_indexes(database.duplicate_records, [
        IndexModel([("institution_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)], name="idx_dup_tenant_status_created"),
        IndexModel([("institution_id", ASCENDING), ("resolved_at", ASCENDING)], name="idx_dup_resolved")
    ])
    await _safe_create_indexes(database.official_results, [
        IndexModel([("institution_id", ASCENDING), ("roll_number", ASCENDING)], unique=True, name="idx_off_results_tenant_roll_unique")
    ])
    await _safe_create_indexes(database.uploaded_files_metadata, [
        IndexModel([("filename", ASCENDING)], unique=True, name="idx_files_name_unique")
    ])
    await _safe_create_indexes(database.notifications, [
        IndexModel([("student_id", ASCENDING), ("institution_id", ASCENDING), ("status", ASCENDING)], name="idx_notif_student_status")
    ])

    
    # 8. Events, Updates, Requests, Audit, Analytics
    await _safe_create_indexes(database.events, [
        IndexModel([("institution_id", ASCENDING), ("created_at", DESCENDING)], name="idx_events_tenant_created"),
        IndexModel([("institution_id", ASCENDING), ("target_type", ASCENDING), ("target_id", ASCENDING)], name="idx_events_tenant_target")
    ])
    await _safe_create_indexes(database.student_pending_updates, [
        IndexModel([("institution_id", ASCENDING), ("student_id", ASCENDING)], name="idx_pending_upd_tenant_student"),
        IndexModel([("institution_id", ASCENDING), ("status", ASCENDING)], name="idx_pending_upd_tenant_status")
    ])
    await _safe_create_indexes(database.correction_requests, [
        IndexModel([("institution_id", ASCENDING), ("student_id", ASCENDING)], name="idx_corr_req_tenant_student"),
        IndexModel([("institution_id", ASCENDING), ("status", ASCENDING)], name="idx_corr_req_tenant_status")
    ])
    await _safe_create_indexes(database.training_analytics, [
        IndexModel([("institution_id", ASCENDING), ("created_at", DESCENDING)], name="idx_analytics_tenant_created")
    ])
    await _safe_create_indexes(database.audit_logs, [
        IndexModel([("institution_id", ASCENDING), ("timestamp", DESCENDING)], name="idx_audit_tenant_time"),
        IndexModel([("institution_id", ASCENDING), ("actor", ASCENDING)], name="idx_audit_tenant_actor")
    ])

    logger.info("All MongoDB collection indexes successfully established.")
