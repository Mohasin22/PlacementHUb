from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# Auth schemas
class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False

class SetPasswordRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    institution_id: str
    user_id: str
    user_name: str
    requires_password_setup: bool = False

# Academic Hierarchy Setup schemas
class DepartmentCreate(BaseModel):
    name: str
    classes: List[str]  # e.g., ["CSE-A", "CSE-B"]

class ProgramCreate(BaseModel):
    name: str
    code: Optional[str] = None
    duration_years: int = 4
    total_semesters: int = 8
    departments: List[DepartmentCreate] = []

class DeanCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

class InstitutionOnboardRequest(BaseModel):
    name: str
    address: str
    website: str
    institution_code: str
    logo_url: Optional[str] = None
    programs: List[ProgramCreate]
    dean: DeanCreate

# Academic Batch & Calendar Schemas
class AcademicBatchCreate(BaseModel):
    program_id: str
    admission_year: int
    expected_graduation_year: int
    batch_label: Optional[str] = None

class SemesterPeriodSchema(BaseModel):
    semester_type: str = "Odd"  # "Odd" or "Even"
    start_date: str             # YYYY-MM-DD
    end_date: str               # YYYY-MM-DD

class AcademicCalendarCreate(BaseModel):
    academic_year_label: str  # e.g. "2026-27"
    start_date: str           # YYYY-MM-DD
    end_date: str             # YYYY-MM-DD
    active: bool = True
    semester_periods: List[SemesterPeriodSchema] = []

class AcademicStatusOverridePayload(BaseModel):
    study_year: Optional[int] = None
    semester: Optional[int] = None
    academic_year_label: Optional[str] = None
    reason: str

class ProgramStructureUpdate(BaseModel):
    duration_years: int
    total_semesters: int
    code: Optional[str] = None

class ClassSectionCreate(BaseModel):
    program_id: str
    department_id: str
    academic_batch_id: str
    section_name: str
    faculty_coordinator_id: Optional[str] = None

# Database Entity representations (for API responses)
class InstitutionResponse(BaseModel):
    id: str
    name: str
    address: str
    website: str
    institution_code: str
    logo_url: Optional[str]

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    phone: Optional[str]
    institution_id: str
