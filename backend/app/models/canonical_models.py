from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime, timezone
import uuid

# ── 1. Identity & Demographics ────────────────────────────────────────────────
class IdentityData(BaseModel):
    full_name: str
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = "Not Specified"
    nationality: Optional[str] = "Indian"

# ── 2. Contact Information ────────────────────────────────────────────────────
class ContactData(BaseModel):
    institutional_email: str
    personal_email: Optional[str] = None
    mobile: Optional[str] = None

# ── 3. Academic Identity & Hierarchy ──────────────────────────────────────────
class AcademicStatusOverride(BaseModel):
    is_active: bool = True
    study_year: Optional[int] = None
    semester: Optional[int] = None
    reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

class AcademicIdentityData(BaseModel):
    program_id: Optional[str] = None
    department_id: Optional[str] = None
    class_id: Optional[str] = None
    program_name: Optional[str] = None
    department_name: Optional[str] = None
    class_name: Optional[str] = None
    academic_batch_id: Optional[str] = None
    batch_label: Optional[str] = None  # e.g., "2023-2027"
    admission_year: Optional[int] = None
    expected_graduation_year: Optional[int] = None
    actual_graduation_year: Optional[int] = None
    graduation_year: Optional[int] = None  # Backward-compatible alias
    current_study_year: Optional[int] = None  # System-derived (1..4)
    current_semester: Optional[int] = None    # System-derived (1..8)
    academic_status_override: Optional[AcademicStatusOverride] = None

# ── 4. Education Records (Authoritative & Normalized) ─────────────────────────
class ScoreRecord(BaseModel):
    board: Optional[str] = None
    institution: Optional[str] = None
    passing_year: Optional[str] = None
    raw_score: Optional[str] = None
    score_type: Optional[str] = None  # Percentage, CGPA, Marks, GPA
    normalized_percentage: Optional[float] = None
    normalized_cgpa: Optional[float] = None
    normalized_value: Optional[float] = None
    coverage: Optional[str] = None  # e.g., "till II-II"
    normalization_method: Optional[str] = None
    conversion_rule_id: Optional[str] = None
    verification_status: str = "VERIFIED"  # VERIFIED, REQUIRES_REVIEW, MANUAL_OVERRIDE

class UndergraduateEducation(BaseModel):
    institution: Optional[str] = None
    overall_raw_score: Optional[str] = None
    overall_score_type: Optional[str] = None
    normalized_cgpa: Optional[float] = None
    normalized_percentage: Optional[float] = None
    coverage: Optional[str] = None
    semester_sgpa: Dict[str, Optional[float]] = Field(default_factory=lambda: {
        "1-1": None, "1-2": None, "2-1": None, "2-2": None,
        "3-1": None, "3-2": None, "4-1": None, "4-2": None
    })
    raw_sgpas: Dict[str, Optional[str]] = Field(default_factory=dict)
    verification_status: str = "VERIFIED"

class EducationData(BaseModel):
    secondary: Optional[ScoreRecord] = None  # 10th
    higher_secondary_or_diploma: Optional[ScoreRecord] = None  # 12th / Diploma
    undergraduate: Optional[UndergraduateEducation] = None

# ── 5. Eligibility Data (Dynamic / System) ────────────────────────────────────
class EligibilityData(BaseModel):
    current_backlogs: int = 0
    backlog_count: int = 0
    education_gap: str = "No"  # "Yes" or "No"
    first_attempt_status: str = "Yes"  # "Yes" or "No"

# ── 6. Entrance Exams ─────────────────────────────────────────────────────────
class EntranceExamRecord(BaseModel):
    exam_name: str
    rank: Optional[str] = None
    score: Optional[str] = None
    year: Optional[str] = None

# ── 7. Portfolio & Links ──────────────────────────────────────────────────────
class LinksData(BaseModel):
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None

class DocumentsData(BaseModel):
    resume: Optional[str] = None
    profile_photo: Optional[str] = None
    combined_documents: Optional[str] = None
    technical_certificates: Optional[str] = None
    achievement_certificates: Optional[str] = None

# ── 8. Authentication & Approval Lifecycle ────────────────────────────────────
class AuthenticationState(BaseModel):
    account_status: str = "IMPORTED_PENDING_FACULTY"  # IMPORTED_PENDING_FACULTY, READY_FOR_FIRST_LOGIN, ACTIVE, SUSPENDED
    first_login_completed: bool = False
    password_set: bool = False
    password_hash: Optional[str] = None
    password_plain: Optional[str] = None
    verified_institutional_email: bool = False
    verified_personal_email: bool = False
    verified_mobile: bool = False
    last_login: Optional[str] = None

class ApprovalState(BaseModel):
    faculty_status: str = "PENDING"  # PENDING, APPROVED, REJECTED, CORRECTION_REQUESTED, MAPPING_REVIEW
    faculty_id: Optional[str] = None
    faculty_name: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None

class ImportMetadata(BaseModel):
    source_file: Optional[str] = None
    import_batch_id: Optional[str] = None
    imported_at: Optional[str] = None
    raw_row_reference: Optional[Dict[str, Any]] = None

# ── 9. Canonical Student Model ────────────────────────────────────────────────
class CanonicalStudent(BaseModel):
    id: Optional[str] = None
    institute_id: str
    student_id: str  # Roll Number / Primary Identifier

    identity: IdentityData
    contact: ContactData
    academic_identity: AcademicIdentityData
    education: EducationData
    eligibility_data: EligibilityData = Field(default_factory=EligibilityData)
    
    entrance_exams: List[EntranceExamRecord] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    projects: List[str] = Field(default_factory=list)
    internships: List[str] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)
    career_preferences: Dict[str, Any] = Field(default_factory=dict)
    
    links: LinksData = Field(default_factory=LinksData)
    documents: DocumentsData = Field(default_factory=DocumentsData)
    authentication: AuthenticationState = Field(default_factory=AuthenticationState)
    approval: ApprovalState = Field(default_factory=ApprovalState)
    import_metadata: ImportMetadata = Field(default_factory=ImportMetadata)

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_mongo_dict(self) -> Dict[str, Any]:
        """Produces a canonical Mongo document with backward-compatible top-level properties."""
        doc = self.dict()
        if doc.get("id"):
            doc["_id"] = doc.pop("id")
        
        # ── Backward-compatible top-level keys for existing queries/frontend ──
        doc["name"] = self.identity.full_name
        doc["first_name"] = self.identity.first_name
        doc["last_name"] = self.identity.last_name
        doc["roll_number"] = self.student_id
        doc["gender"] = self.identity.gender
        doc["dob"] = self.identity.date_of_birth
        doc["mobile"] = self.contact.mobile
        doc["institution_id"] = self.institute_id
        doc["program_id"] = self.academic_identity.program_id
        doc["department_id"] = self.academic_identity.department_id
        doc["class_id"] = self.academic_identity.class_id
        doc["program_name"] = self.academic_identity.program_name
        doc["department_name"] = self.academic_identity.department_name
        doc["class_name"] = self.academic_identity.class_name
        
        # Academic Batch & Timeline fields
        doc["academic_batch_id"] = self.academic_identity.academic_batch_id
        doc["batch_label"] = self.academic_identity.batch_label
        doc["admission_year"] = self.academic_identity.admission_year
        doc["expected_graduation_year"] = self.academic_identity.expected_graduation_year or self.academic_identity.graduation_year
        doc["passout_year"] = doc["expected_graduation_year"]
        doc["graduation_year"] = doc["expected_graduation_year"]
        doc["current_study_year"] = self.academic_identity.current_study_year
        doc["current_semester"] = self.academic_identity.current_semester

        doc["emails"] = {
            "institute": (self.contact.institutional_email or "").strip().lower(),
            "personal": (self.contact.personal_email or "").strip().lower()
        }
        doc["institute_email"] = doc["emails"]["institute"]
        doc["personal_email"] = doc["emails"]["personal"]
        
        # UG CGPA & backlogs
        ug_cgpa = self.education.undergraduate.normalized_cgpa if self.education.undergraduate else 0.0
        doc["cgpa"] = ug_cgpa or 0.0
        doc["active_backlogs"] = self.eligibility_data.current_backlogs
        doc["total_backlogs"] = self.eligibility_data.backlog_count
        doc["status"] = "verified" if self.approval.faculty_status == "APPROVED" else self.approval.faculty_status.lower()
        
        doc["resume_url"] = self.documents.resume or ""
        doc["photo_url"] = self.documents.profile_photo or ""
        doc["password_hash"] = self.authentication.password_hash
        doc["password_plain"] = self.authentication.password_plain
        doc["requires_password_setup"] = not self.authentication.password_set

        return doc

# ── 10. Academic Hierarchy Entities (Programs, Batches, Classes, Calendars) ───

class ProgramStructureModel(BaseModel):
    id: Optional[str] = None
    institute_id: str
    program_name: str
    code: Optional[str] = None  # e.g. "BTECH", "MBA", "MCA"
    duration_years: int = 4
    total_semesters: int = 8
    active: bool = True

class AcademicBatchModel(BaseModel):
    id: Optional[str] = None
    institute_id: str
    program_id: str
    admission_year: int
    expected_graduation_year: int
    batch_label: str  # e.g. "2023-2027"
    active: bool = True

class ClassSectionModel(BaseModel):
    id: Optional[str] = None
    institute_id: str
    program_id: str
    department_id: str
    academic_batch_id: str
    section_name: str  # e.g. "A", "B", "CSE-A"
    display_name: str  # e.g. "CSE-A | 2023-2027"
    faculty_coordinator_id: Optional[str] = None
    active: bool = True

class SemesterPeriod(BaseModel):
    semester: int  # 1..8
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD

class AcademicCalendarModel(BaseModel):
    id: Optional[str] = None
    institute_id: str
    academic_year_label: str  # e.g. "2026-27"
    start_date: str           # YYYY-MM-DD
    end_date: str             # YYYY-MM-DD
    active: bool = True
    semester_periods: List[SemesterPeriod] = Field(default_factory=list)

# ── 11. Board Conversion Rule Schema ──────────────────────────────────────────
class BoardConversionRule(BaseModel):
    id: Optional[str] = None
    board: str
    qualification: str  # SSC, 10th, 12th, Intermediate, Diploma, UG
    academic_year_from: Optional[int] = None
    academic_year_to: Optional[int] = None
    input_type: str  # CGPA, GPA, Marks, Percentage
    input_scale: Optional[float] = 10.0  # 10, 100, 500, etc.
    output_type: str = "Percentage"  # Percentage, CGPA
    formula: str  # e.g., "CGPA * 9.5", "GPA * 10", "marks / max_marks * 100"
    multiplier: Optional[float] = None
    official_source: Optional[str] = None
    active: bool = True
    requires_manual_verification: bool = False

# ── 12. Structured Drive Requirements & Eligibility ───────────────────────────
class DriveRequirementRule(BaseModel):
    graduation_year: Optional[int] = None
    target_batches: List[str] = Field(default_factory=list)  # Batch IDs or labels e.g. ["2023-2027"]
    min_study_year: Optional[int] = None  # e.g. 3 (3rd year and above)
    max_study_year: Optional[int] = None
    specific_semesters: List[int] = Field(default_factory=list)  # e.g. [7, 8]
    allowed_programs: List[str] = Field(default_factory=list)  # Program IDs or Names
    allowed_departments: List[str] = Field(default_factory=list)  # Dept IDs or Names
    allowed_classes: List[str] = Field(default_factory=list)
    min_cgpa: float = 0.0
    min_ug_percentage: Optional[float] = None
    min_tenth_percentage: Optional[float] = None
    min_twelfth_percentage: Optional[float] = None
    max_active_backlogs: int = 99
    max_total_backlogs: Optional[int] = None
    education_gap_allowed: Optional[bool] = True
    first_attempt_required: Optional[bool] = False
    gender_filter: str = "All"  # All, Male, Female

# ── 13. Application Snapshot Schema ───────────────────────────────────────────
class ApplicationSnapshot(BaseModel):
    application_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    drive_id: str
    student_id: str
    institution_id: str
    
    # Profile Snapshot at time of application
    profile_snapshot: Dict[str, Any]
    academic_snapshot: Dict[str, Any]
    resume_version_url: Optional[str] = None
    
    status: str = "Applied"  # Applied, Shortlisted, Selected, Placed, Rejected, On-Hold
    ctc_offered: Optional[str] = None
    offer_letter_url: Optional[str] = None
    joining_date: Optional[str] = None
    applied_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ── 14. Resume Intelligence Models ────────────────────────────────────────────
class ExtractedEntity(BaseModel):
    value: str
    confidence: float = 1.0
    status: str = "DETECTED"  # DETECTED, REQUIRES_REVIEW

class ResumeStructuredData(BaseModel):
    skills: List[ExtractedEntity] = Field(default_factory=list)
    programming_languages: List[ExtractedEntity] = Field(default_factory=list)
    frameworks: List[ExtractedEntity] = Field(default_factory=list)
    tools: List[ExtractedEntity] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    internships: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[ExtractedEntity] = Field(default_factory=list)
    achievements: List[ExtractedEntity] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    links: Dict[str, Optional[str]] = Field(default_factory=lambda: {
        "linkedin": None, "github": None, "portfolio": None
    })
    raw_text: Optional[str] = None
    extracted_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
