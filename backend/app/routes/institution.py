from fastapi import APIRouter, HTTPException, status, Depends
from app.models.schemas import InstitutionOnboardRequest
from app.db.connection import db
from app.db.tenant import RoleChecker, get_tenant_id
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr
from typing import Optional
from bson import ObjectId
from app.services.security import hash_password

router = APIRouter()

class TpoRegisterPayload(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    program_id: str


@router.post("/onboard", status_code=status.HTTP_201_CREATED)
async def onboard_institution(payload: InstitutionOnboardRequest):
    # Check if institution code already exists
    code_exists = await db.db.institutions.find_one({"institution_code": payload.institution_code.strip()})
    if code_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Institution with code {payload.institution_code} already onboarded."
        )
        
    # Check if Dean's email is already registered
    dean_email = payload.dean.email.strip().lower()
    user_exists = await db.db.users.find_one({"email": dean_email})
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dean email {dean_email} is already registered to another user."
        )
        
    # 1. Create Institution
    inst_doc = {
        "name": payload.name.strip(),
        "address": payload.address.strip(),
        "website": payload.website.strip(),
        "institution_code": payload.institution_code.strip(),
        "logo_url": payload.logo_url,
        "created_at": datetime.now(timezone.utc)
    }
    
    inst_result = await db.db.institutions.insert_one(inst_doc)
    inst_id = str(inst_result.inserted_id)
    
    # 2. Onboard Academic Hierarchy
    for program in payload.programs:
        prog_doc = {
            "program_name": program.name.strip(),
            "institution_id": inst_id,
            "created_at": datetime.now(timezone.utc)
        }
        prog_result = await db.db.programs.insert_one(prog_doc)
        prog_id = str(prog_result.inserted_id)
        
        for dept in program.departments:
            dept_doc = {
                "department_name": dept.name.strip(),
                "program_id": prog_id,
                "institution_id": inst_id,
                "created_at": datetime.now(timezone.utc)
            }
            dept_result = await db.db.departments.insert_one(dept_doc)
            dept_id = str(dept_result.inserted_id)
            
            for class_name in dept.classes:
                class_doc = {
                    "class_name": class_name.strip(),
                    "department_id": dept_id,
                    "program_id": prog_id,
                    "institution_id": inst_id,
                    "created_at": datetime.now(timezone.utc)
                }
                await db.db.classes.insert_one(class_doc)
                
    # 3. Create Dean Account
    dean_doc = {
        "name": payload.dean.name.strip(),
        "email": dean_email,
        "password_hash": hash_password(payload.dean.password),
        "phone": payload.dean.phone.strip() if payload.dean.phone else None,
        "role": "Dean",
        "institution_id": inst_id,
        "created_at": datetime.now(timezone.utc)
    }
    
    dean_result = await db.db.users.insert_one(dean_doc)
    dean_id = str(dean_result.inserted_id)
    
    # 4. Audit Log
    await db.db.audit_logs.insert_one({
        "action": "institution_onboarding",
        "institution_id": inst_id,
        "email": dean_email,
        "user_id": dean_id,
        "role": "Dean",
        "timestamp": datetime.now(timezone.utc),
        "status": "success"
    })
    
    return {
        "message": "Institution and academic hierarchy onboarded successfully.",
        "institution_id": inst_id,
        "dean_id": dean_id
    }

from app.db.utils import id_query, parse_id

@router.get("/public/hierarchy")
async def get_public_hierarchy():
    # Fetch the first institution (assuming single-tenant or default tenant for public registration)
    institution = await db.db.institutions.find_one({})
    if not institution:
        raise HTTPException(status_code=404, detail="No institution found.")
        
    institution_id = institution.get("id") or str(institution["_id"])
    return await get_institution_hierarchy(institution_id)

@router.get("/{institution_id}/hierarchy")
async def get_institution_hierarchy(institution_id: str):
    # Fetch programs, batches, departments, and classes for this institution
    programs_cursor = db.db.programs.find({"$or": [{"institution_id": institution_id}, {"institution_id": parse_id(institution_id)}]})
    programs = await programs_cursor.to_list(length=100)
    
    hierarchy = []
    for prog in programs:
        prog_id = prog.get("id") or str(prog["_id"])
        prog_obj_id = str(prog["_id"])

        # Fetch academic batches for this program
        batches_cursor = db.db.academic_batches.find({
            "$or": [{"program_id": prog_id}, {"program_id": prog_obj_id}]
        }).sort("admission_year", -1)
        batches = await batches_cursor.to_list(length=50)
        batches_data = [{"id": str(b.get("id") or b["_id"]), "batch_label": b.get("batch_label"), "admission_year": b.get("admission_year"), "expected_graduation_year": b.get("expected_graduation_year")} for b in batches]

        depts_cursor = db.db.departments.find({
            "$or": [{"program_id": prog_id}, {"program_id": prog_obj_id}]
        })
        depts = await depts_cursor.to_list(length=100)
        
        departments_data = []
        for dept in depts:
            dept_id = dept.get("id") or str(dept["_id"])
            dept_obj_id = str(dept["_id"])
            classes_cursor = db.db.classes.find({
                "$or": [{"department_id": dept_id}, {"department_id": dept_obj_id}]
            })
            classes = await classes_cursor.to_list(length=100)
            
            departments_data.append({
                "id": dept_id,
                "name": dept.get("department_name") or dept.get("name", "Unknown"),
                "classes": [
                    {
                        "id": str(c.get("id") or c["_id"]),
                        "name": c.get("display_name") or c.get("class_name") or c.get("name", "Unknown"),
                        "section_name": c.get("section_name") or c.get("class_name"),
                        "academic_batch_id": str(c.get("academic_batch_id") or ""),
                        "faculty_coordinator_id": str(c.get("faculty_coordinator_id") or "")
                    }
                    for c in classes
                ]
            })
            
        hierarchy.append({
            "id": prog_id,
            "name": prog.get("program_name") or prog.get("name", "Unknown"),
            "code": prog.get("code"),
            "duration_years": int(prog.get("duration_years") or 4),
            "total_semesters": int(prog.get("total_semesters") or 8),
            "batches": batches_data,
            "departments": departments_data
        })
        
    return {"institution_id": institution_id, "hierarchy": hierarchy}

@router.post("/tpo", status_code=status.HTTP_201_CREATED, dependencies=[Depends(RoleChecker(["Dean"]))])
async def register_tpo(payload: TpoRegisterPayload, institution_id: str = Depends(get_tenant_id)):
    # Verify program exists
    prog = await db.db.programs.find_one(id_query(payload.program_id))
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found under this institution.")
        
    # Check if email is already taken
    email_check = payload.email.strip().lower()
    existing_user = await db.db.users.find_one({"email": email_check})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")
        
    # Create TPO user
    tpo_doc = {
        "name": payload.name.strip(),
        "email": email_check,
        "password_hash": hash_password(payload.password),
        "phone": payload.phone.strip() if payload.phone else None,
        "role": "TPO",
        "program_id": payload.program_id,
        "institution_id": institution_id,
        "created_at": datetime.now(timezone.utc)
    }
    
    res = await db.db.users.insert_one(tpo_doc)
    return {"message": "TPO registered successfully.", "tpo_id": str(res.inserted_id)}

