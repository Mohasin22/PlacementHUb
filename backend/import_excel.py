import asyncio
import uuid
import datetime
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
def hash_pw(pw: str) -> str:
    return pwd_context.hash(pw)

MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "placementhub"

async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    
    inst = await db["institutions"].find_one()
    if not inst:
        print("Error: No institution found in DB.")
        return
    inst_id = inst["id"]
    
    prog = await db["programs"].find_one({"institution_id": inst_id})
    if not prog:
        print("Error: No programs found in DB.")
        return
        
    dept = await db["departments"].find_one({"program_id": prog["id"]})
    if not dept:
        print("Error: No departments found in DB.")
        return
        
    cls = await db["classes"].find_one({"department_id": dept["id"]})
    if not cls:
        print("Error: No classes found in DB.")
        return
        
    file_path = "../2023-27 PLACEMENT DATA (Responses).xlsx"
    print(f"Reading {file_path}...")
    df = pd.read_excel(file_path)
    
    users = []
    students = []
    
    for _, row in df.iterrows():
        # Clean data
        first = str(row.get('First Name', '')).strip()
        last = str(row.get('Last Name', '')).strip()
        name = f"{first} {last}".strip()
        if not name or name == 'nan':
            name = str(row.get('Name of Student ( As per 10th certificate)', '')).strip()

        roll_number = str(row.get('Roll Number', '')).strip()
        email = str(row.get('Domain mail id', '')).strip()
        if not email or email == 'nan':
            email = str(row.get('Email Address', '')).strip()
            
        mobile = str(row.get('Student Mobile Number', '')).strip()
        cgpa_str = str(row.get('UG Total CGPA', '0')).strip()
        gender = str(row.get('Gender', 'Not Specified')).strip()
        backlogs_str = str(row.get('No. of Backlogs', '0')).strip()
        
        if not name or name == 'nan' or not email or email == 'nan':
            continue
            
        import math
        try:
            cgpa = float(cgpa_str)
            if math.isnan(cgpa):
                cgpa = 0.0
        except ValueError:
            cgpa = 0.0
            
        try:
            active_backlogs = int(float(backlogs_str))
            if math.isnan(active_backlogs):
                active_backlogs = 0
        except ValueError:
            active_backlogs = 0
            
        student_id = str(uuid.uuid4())
        
        # Extract document links
        resume_link = ""
        for col_name in row.keys():
            col_l = str(col_name).lower()
            if any(term in col_l for term in ["upload your document", "resume", "single pdf", "cv"]):
                v = str(row.get(col_name, '')).strip()
                if v and v not in ["nan", "none", "-", "--"]:
                    resume_link = v
                    break

        photo_link = ""
        for col_name in row.keys():
            col_l = str(col_name).lower()
            if any(term in col_l for term in ["upload your photo", "passport photograph", "photo url"]):
                v = str(row.get(col_name, '')).strip()
                if v and v not in ["nan", "none", "-", "--"]:
                    photo_link = v
                    break

        tech_link = ""
        for col_name in row.keys():
            col_l = str(col_name).lower()
            if any(term in col_l for term in ["technical certificate", "technical"]):
                v = str(row.get(col_name, '')).strip()
                if v and v not in ["nan", "none", "-", "--"]:
                    tech_link = v
                    break

        achieve_link = ""
        for col_name in row.keys():
            col_l = str(col_name).lower()
            if any(term in col_l for term in ["achievement certificate", "achievements certificate"]):
                v = str(row.get(col_name, '')).strip()
                if v and v not in ["nan", "none", "-", "--"]:
                    achieve_link = v
                    break

        # Create verified student profile
        student = {
            "institution_id": inst_id,
            "class_id": cls["id"],
            "name": name,
            "roll_number": roll_number,
            "department_name": dept["name"],
            "program_name": prog["name"],
            "emails": {
                "institute": email.lower(),
                "personal": str(row.get('E mail ID ( Personal )', '')).strip()
            },
            "mobile": mobile,
            "gender": gender,
            "date_of_birth": None,
            "cgpa": cgpa,
            "active_backlogs": active_backlogs,
            "total_backlogs": active_backlogs,
            "skills": [],
            "resume_url": resume_link,
            "photo_url": photo_link,
            "documents": {
                "resume": resume_link,
                "profile_photo": photo_link,
                "combined_documents": resume_link,
                "technical_certificates": tech_link,
                "achievement_certificates": achieve_link
            },
            "portfolio_links": {},
            "status": "verified",
            "verified_by": "System",
            "verified_at": datetime.datetime.now(datetime.UTC).isoformat(),
            "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
            "password_hash": hash_pw("student123"),
            "requires_password_setup": False
        }
        students.append(student)
        
    if students:
        await db["students"].insert_many(students)
        print(f"Successfully imported {len(students)} students and set their status to VERIFIED.")
        print(f"They can log in with their email and password: student123")
    else:
        print("No valid student records found in the Excel sheet.")

if __name__ == "__main__":
    asyncio.run(main())
