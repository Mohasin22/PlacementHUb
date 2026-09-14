import asyncio
import datetime
import uuid
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

# Using standard hardcoded URI as per config.py
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "placementhub"

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def seed_db():
    print("Starting mock data seed...")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    
    # Clear existing collections to start fresh
    print("Clearing collections...")
    for coll in ["institutions", "users", "programs", "departments", "classes", "students", "drives", "applications", "submissions", "notifications"]:
        await db[coll].delete_many({})

    print("Inserting Institution...")
    inst_id = str(uuid.uuid4())
    await db["institutions"].insert_one({
        "id": inst_id,
        "name": "Global Tech University",
        "address": "123 Tech Lane, Innovation City",
        "website": "https://gtu.edu",
        "institution_code": "GTU01"
    })

    # Hierarchies
    print("Inserting Hierarchy...")
    prog_btech_id = str(uuid.uuid4())
    await db["programs"].insert_one({"id": prog_btech_id, "institution_id": inst_id, "name": "B.Tech"})
    
    dept_cse_id = str(uuid.uuid4())
    await db["departments"].insert_one({"id": dept_cse_id, "program_id": prog_btech_id, "name": "Computer Science"})
    
    class_cse_a_id = str(uuid.uuid4())
    await db["classes"].insert_one({"id": class_cse_a_id, "department_id": dept_cse_id, "name": "CSE-A"})

    # Users
    print("Inserting Users...")
    users = [
        {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "dean@gtu.edu", "name": "Dr. Alan Turing", "role": "Dean", "password_hash": hash_pw("dean123"), "requires_password_setup": False},
        {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "tpo@gtu.edu", "name": "Alice Smith", "role": "TPO", "password_hash": hash_pw("tpo123"), "requires_password_setup": False},
        {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "faculty@gtu.edu", "name": "Bob Jones", "role": "Faculty", "password_hash": hash_pw("faculty123"), "class_id": class_cse_a_id, "requires_password_setup": False}
    ]
    
    student_user_1 = {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "student1@gtu.edu", "name": "Charlie Brown", "role": "Student", "password_hash": hash_pw("student123"), "requires_password_setup": False}
    student_user_2 = {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "student2@gtu.edu", "name": "Diana Prince", "role": "Student", "password_hash": hash_pw("student123"), "requires_password_setup": False}
    student_user_3 = {"id": str(uuid.uuid4()), "institution_id": inst_id, "email": "student3@gtu.edu", "name": "Ethan Hunt", "role": "Student", "password_hash": hash_pw("student123"), "requires_password_setup": False}
    
    users.extend([student_user_1, student_user_2, student_user_3])
    await db["users"].insert_many(users)

    # Students profiles
    print("Inserting Students Profiles...")
    s1_id = student_user_1["id"]
    s2_id = student_user_2["id"]
    s3_id = student_user_3["id"]

    students = [
        {
            "user_id": s1_id,
            "institution_id": inst_id,
            "roll_number": "GTU-CSE-001",
            "name": "Charlie Brown",
            "emails": {"institute": "student1@gtu.edu", "personal": "charlie@gmail.com"},
            "mobile": "9876543210",
            "gender": "Male",
            "dob": "2000-01-01",
            "program_id": prog_btech_id,
            "department_id": dept_cse_id,
            "class_id": class_cse_a_id,
            "cgpa": 8.5,
            "active_backlogs": 0,
            "total_backlogs": 0,
            "skills": ["Python", "React", "Node.js"],
            "projects": ["E-Commerce Site", "Chatbot"],
            "placement_info": {"placed": True, "company_name": "Google", "package": "24 LPA", "role": "SDE"},
            "extra_data": {"10th Marks": "95%", "12th Marks": "92%", "Address": "City Center"}
        },
        {
            "user_id": s2_id,
            "institution_id": inst_id,
            "roll_number": "GTU-CSE-002",
            "name": "Diana Prince",
            "emails": {"institute": "student2@gtu.edu", "personal": "diana@gmail.com"},
            "mobile": "9876543211",
            "gender": "Female",
            "dob": "2001-05-15",
            "program_id": prog_btech_id,
            "department_id": dept_cse_id,
            "class_id": class_cse_a_id,
            "cgpa": 9.2,
            "active_backlogs": 0,
            "total_backlogs": 0,
            "skills": ["Java", "Spring Boot", "AWS"],
            "projects": ["Cloud storage"],
            "extra_data": {"10th Marks": "98%", "12th Marks": "96%"}
        },
        {
            "user_id": s3_id,
            "institution_id": inst_id,
            "roll_number": "GTU-CSE-003",
            "name": "Ethan Hunt",
            "emails": {"institute": "student3@gtu.edu", "personal": "ethan@gmail.com"},
            "mobile": "9876543212",
            "gender": "Male",
            "dob": "1999-11-20",
            "program_id": prog_btech_id,
            "department_id": dept_cse_id,
            "class_id": class_cse_a_id,
            "cgpa": 7.1,
            "active_backlogs": 1,
            "total_backlogs": 2,
            "skills": ["C++", "Linux", "Networking"],
            "projects": ["Spy gadget interface"],
            "extra_data": {"10th Marks": "85%", "12th Marks": "80%"}
        }
    ]
    await db["students"].insert_many(students)

    # Drives
    print("Inserting Drives...")
    d1_id = str(uuid.uuid4())
    d2_id = str(uuid.uuid4())
    drives = [
        {
            "id": d1_id,
            "institution_id": inst_id,
            "company_name": "Google",
            "job_role": "Software Development Engineer",
            "package": "24 LPA",
            "location": "Bangalore",
            "mode": "On-Campus",
            "drive_deadline": (datetime.datetime.utcnow() + datetime.timedelta(days=5)).isoformat(),
            "min_cgpa": 8.0,
            "max_backlogs": 0,
            "gender_filter": "All",
            "created_at": datetime.datetime.utcnow().isoformat()
        },
        {
            "id": d2_id,
            "institution_id": inst_id,
            "company_name": "Amazon",
            "job_role": "Cloud Architect",
            "package": "30 LPA",
            "location": "Hyderabad",
            "mode": "Virtual",
            "drive_deadline": (datetime.datetime.utcnow() - datetime.timedelta(days=2)).isoformat(), # expired
            "min_cgpa": 7.5,
            "max_backlogs": 1,
            "gender_filter": "All",
            "created_at": datetime.datetime.utcnow().isoformat()
        }
    ]
    await db["placement_drives"].insert_many(drives)

    # Applications
    print("Inserting Applications...")
    apps = [
        {
            "application_id": str(uuid.uuid4()),
            "drive_id": d1_id,
            "student_id": s1_id,
            "institution_id": inst_id,
            "status": "Placed",
            "ctc_offered": "24 LPA",
            "applied_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat()
        },
        {
            "application_id": str(uuid.uuid4()),
            "drive_id": d1_id,
            "student_id": s2_id,
            "institution_id": inst_id,
            "status": "Shortlisted",
            "applied_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat()
        },
        {
            "application_id": str(uuid.uuid4()),
            "drive_id": d2_id,
            "student_id": s3_id,
            "institution_id": inst_id,
            "status": "Applied",
            "applied_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat()
        }
    ]
    await db["applications"].insert_many(apps)

    # Submissions (Google Form queue for Faculty)
    print("Inserting Pending Submissions (Faculty View)...")
    await db["student_pending_submissions"].insert_one({
        "id": str(uuid.uuid4()),
        "institution_id": inst_id,
        "class_id": class_cse_a_id,
        "roll_number": "GTU-CSE-004",
        "name": "Fiona Gallagher",
        "institute_email": "student4@gtu.edu",
        "mobile": "9998887776",
        "cgpa": 6.8,
        "active_backlogs": 2,
        "total_backlogs": 2,
        "extra_data": {"Hobby": "Coding"},
        "status": "pending",
        "created_at": datetime.datetime.utcnow().isoformat()
    })
    
    # Notifications
    print("Inserting Notifications...")
    await db["notifications"].insert_many([
        {
            "id": str(uuid.uuid4()),
            "user_id": s1_id,
            "title": "Application Update",
            "message": "Congratulations! You have been Placed at Google.",
            "read": False,
            "created_at": datetime.datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": s2_id,
            "title": "Drive Shortlisted",
            "message": "You have been shortlisted for Google.",
            "read": False,
            "created_at": datetime.datetime.utcnow().isoformat()
        }
    ])

    print("Done seeding the mock data!")
    print("\n--- TEST CREDENTIALS ---")
    print("Dean: dean@gtu.edu / dean123")
    print("TPO: tpo@gtu.edu / tpo123")
    print("Faculty: faculty@gtu.edu / faculty123")
    print("Student 1 (Placed): student1@gtu.edu / student123")
    print("Student 2 (Shortlisted): student2@gtu.edu / student123")
    print("Student 3 (Active Backlogs): student3@gtu.edu / student123")

if __name__ == "__main__":
    asyncio.run(seed_db())
