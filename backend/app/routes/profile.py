from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.db.tenant import get_current_user, get_tenant_id
from app.db.connection import db
from bson import ObjectId
import datetime

router = APIRouter()

class ProfileUpdatePayload(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    personal_email: Optional[EmailStr] = None
    institute_email: Optional[EmailStr] = None
    photo_url: Optional[str] = None

@router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    role = current_user.get("role")
    
    if role == "Student":
        student = await db.db.students.find_one({"_id": ObjectId(user_id)})
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found.")
        return {
            "id": str(student["_id"]),
            "role": role,
            "name": student.get("name"),
            "phone": student.get("mobile") or student.get("phone"),
            "bio": student.get("bio"),
            "personal_email": student.get("emails", {}).get("personal") or student.get("personal_email"),
            "institute_email": student.get("emails", {}).get("institute") or student.get("institute_email"),
            "photo_url": student.get("photo_url"),
            "program_name": student.get("program_name"),
            "department_name": student.get("department_name"),
            "cgpa": student.get("cgpa")
        }
    else:
        # Dean, TPO, Faculty
        user = await db.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User profile not found.")
        return {
            "id": str(user["_id"]),
            "role": role,
            "name": user.get("name"),
            "phone": user.get("phone"),
            "bio": user.get("bio"),
            "personal_email": user.get("personal_email"),
            "institute_email": user.get("email") or user.get("institute_email"),
            "photo_url": user.get("photo_url")
        }

@router.put("/me")
async def update_my_profile(payload: ProfileUpdatePayload, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    role = current_user.get("role")
    
    update_data = {}
    if payload.name is not None: update_data["name"] = payload.name
    if payload.phone is not None: 
        if role == "Student":
            update_data["mobile"] = payload.phone
        update_data["phone"] = payload.phone
    if payload.bio is not None: update_data["bio"] = payload.bio
    if payload.photo_url is not None: update_data["photo_url"] = payload.photo_url
    
    if role == "Student":
        if payload.personal_email is not None:
            update_data["emails.personal"] = payload.personal_email
            update_data["personal_email"] = payload.personal_email
        if payload.institute_email is not None:
            update_data["emails.institute"] = payload.institute_email
            update_data["institute_email"] = payload.institute_email
            
        if update_data:
            update_data["updated_at"] = datetime.datetime.now(datetime.timezone.utc)
            await db.db.students.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    else:
        if payload.personal_email is not None: update_data["personal_email"] = payload.personal_email
        if payload.institute_email is not None: update_data["email"] = payload.institute_email
        
        if update_data:
            update_data["updated_at"] = datetime.datetime.now(datetime.timezone.utc)
            await db.db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
            
    return {"message": "Profile updated successfully.", "updated_fields": list(update_data.keys())}
