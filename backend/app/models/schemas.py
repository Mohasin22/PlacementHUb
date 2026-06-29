from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Any
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

# Academic Hierarchy Setup schemas
class DepartmentCreate(BaseModel):
    name: str
    classes: List[str]  # e.g., ["CSE-A", "CSE-B"]

class ProgramCreate(BaseModel):
    name: str
    departments: List[DepartmentCreate]

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
