from fastapi import APIRouter, HTTPException, status, Request, Depends
from pydantic import BaseModel, EmailStr
from app.models.schemas import OTPRequest, OTPVerify, TokenResponse, LoginRequest, SetPasswordRequest
from app.db.connection import db
from app.services.security import generate_otp, create_access_token, verify_password, hash_password
from app.services.email import send_otp_email
from app.db.tenant import get_current_user
from app.db.utils import id_query, parse_id
from app.services.audit import log_audit_event
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timezone, timedelta
import logging

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()
logger = logging.getLogger("app.routes.auth")

class FirstLoginRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest):
    email = payload.email.strip().lower()
    
    # 1. Search in users collection (Staff: Dean, TPO, Faculty)
    user = await db.db.users.find_one({"email": email})
    
    user_id = None
    role = None
    institution_id = None
    name = None
    password_hash = None
    
    if user:
        user_id = str(user["_id"])
        role = user.get("role")
        institution_id = user.get("institution_id")
        name = user.get("name")
        password_hash = user.get("password_hash")
    else:
        # 2. Search in students collection (matching institutional email OR personal email)
        student = await db.db.students.find_one({
            "$or": [
                {"contact.institutional_email": email},
                {"contact.personal_email": email},
                {"emails.institute": email},
                {"emails.personal": email},
                {"institute_email": email},
                {"personal_email": email}
            ]
        })
        
        if student:
            user_id = str(student["_id"])
            role = "Student"
            institution_id = student.get("institution_id") or student.get("institute_id")
            name = student.get("name") or student.get("identity", {}).get("full_name")
            password_hash = student.get("password_hash") or student.get("authentication", {}).get("password_hash")
            
            # Check account status & faculty approval
            faculty_status = student.get("approval", {}).get("faculty_status") or student.get("status")
            account_status = student.get("authentication", {}).get("account_status")
            
            if faculty_status == "PENDING" or account_status == "IMPORTED_PENDING_FACULTY":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your registration has been imported and is currently pending Faculty Coordinator approval. You can log in once approved."
                )
            if faculty_status == "REJECTED" or account_status == "SUSPENDED":
                reason = student.get("approval", {}).get("rejection_reason") or "Details could not be verified."
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your account registration was rejected by Faculty: {reason}"
                )
        else:
            # Check temporary submissions collection
            pending = await db.db.student_pending_submissions.find_one({
                "$or": [
                    {"institute_email": email},
                    {"personal_email": email}
                ]
            })
            if pending:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your registration is still pending faculty approval."
                )
            
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    if not password_hash:
        raise HTTPException(
            status_code=401,
            detail="Password not set. Please use 'Login with OTP' to activate your account and set a password."
        )
        
    if not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    # Issue JWT
    token_data = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "institution_id": institution_id,
        "name": name
    }
    
    access_token = create_access_token(token_data, remember_me=payload.remember_me)
    
    await log_audit_event(
        action="password_login",
        actor=email,
        actor_role=role,
        entity_type="User",
        entity_id=user_id,
        institution_id=institution_id,
        status="success"
    )
    
    return TokenResponse(
        access_token=access_token,
        role=role,
        institution_id=institution_id,
        user_id=user_id,
        user_name=name
    )

@router.post("/otp/request")
@limiter.limit("5/minute")
async def request_otp(request: Request, payload: OTPRequest):
    email = payload.email.strip().lower()
    
    # 1. Search in users collection (Dean, TPO, Faculty)
    user = await db.db.users.find_one({"email": email})
    
    user_id = None
    role = None
    institution_id = None
    name = None
    
    if user:
        user_id = str(user["_id"])
        role = user.get("role")
        institution_id = user.get("institution_id")
        name = user.get("name")
    else:
        # 2. Search in students collection
        student = await db.db.students.find_one({
            "$or": [
                {"contact.institutional_email": email},
                {"contact.personal_email": email},
                {"emails.institute": email},
                {"emails.personal": email},
                {"institute_email": email},
                {"personal_email": email}
            ]
        })
        
        if student:
            user_id = str(student["_id"])
            role = "Student"
            institution_id = student.get("institution_id") or student.get("institute_id")
            name = student.get("name") or student.get("identity", {}).get("full_name")
            
            # Check approval lifecycle
            faculty_status = student.get("approval", {}).get("faculty_status") or student.get("status")
            account_status = student.get("authentication", {}).get("account_status")
            
            if faculty_status == "PENDING" or account_status == "IMPORTED_PENDING_FACULTY":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your registration is currently pending Faculty Coordinator approval. You will be able to activate your account once approved."
                )
            if faculty_status == "REJECTED" or account_status == "SUSPENDED":
                reason = student.get("approval", {}).get("rejection_reason") or "Details could not be verified."
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your account registration was rejected by Faculty: {reason}"
                )
        else:
            pending = await db.db.student_pending_submissions.find_one({
                "$or": [
                    {"institute_email": email},
                    {"personal_email": email}
                ]
            })
            if pending:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your registration is still pending faculty approval."
                )
            
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email address not registered in PlacementHub."
        )
        
    otp = generate_otp()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    await db.db.otp_sessions.delete_many({"email": email})
    
    await db.db.otp_sessions.insert_one({
        "email": email,
        "otp": otp,
        "user_id": user_id,
        "role": role,
        "institution_id": institution_id,
        "name": name,
        "created_at": datetime.now(timezone.utc),
        "expires_at": expiry
    })
    
    await send_otp_email(email=email, name=name or email, otp=otp, role=role)
    
    return {"message": "OTP sent successfully to registered email."}

@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(payload: OTPVerify):
    email = payload.email.strip().lower()
    otp = payload.otp.strip()
    
    session = await db.db.otp_sessions.find_one({"email": email})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active login session found. Request a new OTP."
        )
        
    now = datetime.now(timezone.utc)
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if now > expires_at:
        await db.db.otp_sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new OTP."
        )
        
    if session["otp"] != otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP. Please try again."
        )
        
    await db.db.otp_sessions.delete_one({"_id": session["_id"]})
    
    token_data = {
        "user_id": session["user_id"],
        "email": session["email"],
        "role": session["role"],
        "institution_id": session["institution_id"],
        "name": session["name"]
    }
    
    access_token = create_access_token(token_data)
    
    # Check if user needs to set password
    requires_password_setup = False
    if session["role"] == "Student":
        user_doc = await db.db.students.find_one(id_query(session["user_id"]))
        if user_doc and (not user_doc.get("password_hash") or not user_doc.get("authentication", {}).get("password_set")):
            requires_password_setup = True
    else:
        user_doc = await db.db.users.find_one(id_query(session["user_id"]))
        if user_doc and not user_doc.get("password_hash"):
            requires_password_setup = True
            
    await log_audit_event(
        action="otp_login",
        actor=email,
        actor_role=session["role"],
        entity_type="User",
        entity_id=session["user_id"],
        institution_id=session["institution_id"],
        status="success"
    )
        
    return TokenResponse(
        access_token=access_token,
        role=session["role"],
        institution_id=session["institution_id"],
        user_id=session["user_id"],
        user_name=session["name"],
        requires_password_setup=requires_password_setup
    )

@router.post("/set-password")
async def set_password(
    payload: SetPasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    role = current_user["role"]
    hashed_password = hash_password(payload.password)
    
    if role == "Student":
        update_doc = {
            "password_hash": hashed_password,
            "password_plain": payload.password,
            "authentication.password_set": True,
            "authentication.password_hash": hashed_password,
            "authentication.password_plain": payload.password,
            "authentication.account_status": "ACTIVE",
            "authentication.first_login_completed": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.db.students.update_one(id_query(user_id), {"$set": update_doc})
    else:
        await db.db.users.update_one(
            id_query(user_id),
            {"$set": {"password_hash": hashed_password, "requires_password_setup": False}}
        )
        
    await log_audit_event(
        action="password_set",
        actor=current_user["email"],
        actor_role=role,
        entity_type="User",
        entity_id=user_id,
        institution_id=current_user.get("institution_id"),
        status="success"
    )
        
    return {"message": "Password updated successfully. You can now login with your password."}

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.put("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    role = current_user["role"]

    if role == "Student":
        user_record = await db.db.students.find_one(id_query(user_id))
    else:
        user_record = await db.db.users.find_one(id_query(user_id))

    if not user_record:
        raise HTTPException(status_code=404, detail="User not found.")

    pw_hash = user_record.get("password_hash") or user_record.get("authentication", {}).get("password_hash", "")
    if not verify_password(payload.current_password, pw_hash):
        raise HTTPException(status_code=401, detail="Incorrect current password.")

    hashed_password = hash_password(payload.new_password)

    if role == "Student":
        await db.db.students.update_one(
            id_query(user_id),
            {"$set": {
                "password_hash": hashed_password,
                "password_plain": payload.new_password,
                "authentication.password_hash": hashed_password,
                "authentication.password_plain": payload.new_password,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        await db.db.users.update_one(
            id_query(user_id),
            {"$set": {"password_hash": hashed_password}}
        )

    return {"message": "Password changed successfully."}

@router.get("/otp/debug/{email}")
async def get_otp_debug(email: str):
    email = email.strip().lower()
    session = await db.db.otp_sessions.find_one({"email": email})
    if not session:
        raise HTTPException(status_code=404, detail="No OTP session found.")
    return {"otp": session["otp"]}
