from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid

# ── 1. Mapping & Evidence Schemas ─────────────────────────────────────────────

class MappingItem(BaseModel):
    field: str  # "department" | "program" | "class" | "batch"
    raw_value: str
    mapped_id: Optional[str] = None
    mapped_name: Optional[str] = None
    confidence: float = 1.0  # 0.0 to 1.0
    status: str = "matched"  # "matched" | "ambiguous" | "unmatched"
    evidence: Optional[str] = None

class MissingFieldItem(BaseModel):
    field: str
    label: str
    description: str
    required: bool = True
    suggested_type: str = "text"  # "text" | "number" | "date" | "select"

class ValidationIssueItem(BaseModel):
    field: str
    severity: str = "error"  # "error" | "warning"
    message: str
    rule: str

# ── 2. Extracted Requirements from JD ─────────────────────────────────────────

class ExtractedJDRequirements(BaseModel):
    company_name: Optional[str] = None
    job_role: Optional[str] = None
    package: Optional[str] = None
    location: Optional[str] = None
    mode: str = "On-campus"  # "On-campus", "Remote", "Hybrid"
    min_cgpa: float = 0.0
    min_ug_percentage: Optional[float] = None
    min_tenth_percentage: Optional[float] = None
    min_twelfth_percentage: Optional[float] = None
    max_backlogs: int = 99
    max_total_backlogs: Optional[int] = None
    historical_backlogs_allowed: Optional[bool] = True
    allowed_programs: List[str] = Field(default_factory=list)
    allowed_departments: List[str] = Field(default_factory=list)
    allowed_classes: List[str] = Field(default_factory=list)
    target_batches: List[str] = Field(default_factory=list)
    passout_year: Optional[int] = None
    education_gap_allowed: bool = True
    first_attempt_required: bool = False
    gender_filter: str = "All"  # "All", "Male", "Female"
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    external_apply_link: Optional[str] = None
    drive_deadline: Optional[str] = None  # ISO format string or None
    interview_date: Optional[str] = None
    other_requirements: Optional[str] = None

# ── 3. AI Drive Draft Model & Lifecycle ───────────────────────────────────────

class AIDriveDraft(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    institution_id: str
    created_by: str
    status: str = "DRAFT"  # DRAFT, NEEDS_INPUT, READY_FOR_REVIEW, APPROVED, PUBLISHED, CLOSED
    source_jd: str
    extracted_requirements: Dict[str, Any] = Field(default_factory=dict)
    mapped_requirements: Dict[str, Any] = Field(default_factory=dict)
    missing_fields: List[MissingFieldItem] = Field(default_factory=list)
    validation_issues: List[ValidationIssueItem] = Field(default_factory=list)
    ambiguous_fields: List[MappingItem] = Field(default_factory=list)
    confidence_score: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    published_drive_id: Optional[str] = None

    def to_mongo_dict(self) -> Dict[str, Any]:
        d = self.model_dump()
        d["_id"] = d.pop("id")
        return d

# ── 4. Student AI Matching & Quality Schemas ──────────────────────────────────

class StudentDataIssue(BaseModel):
    issue_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    field: str
    issue_type: str = "typo"  # "typo" | "missing" | "format" | "inconsistent"
    original_value: Any = None
    suggested_value: Any = None
    explanation: str
    confidence: float = 0.95
    status: str = "PENDING"  # "PENDING" | "ACCEPTED" | "DISMISSED"
    detected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StudentMatchResult(BaseModel):
    student_id: str
    drive_id: str
    is_eligible: bool
    eligibility_reasons: List[str] = Field(default_factory=list)
    mandatory_criteria: List[Dict[str, Any]] = Field(default_factory=list)
    preferred_criteria: List[Dict[str, Any]] = Field(default_factory=list)
    conversion_details: Optional[Dict[str, Any]] = None
    data_quality_issues: List[Dict[str, Any]] = Field(default_factory=list)
    ai_explanation: str
    confidence: float = 1.0
