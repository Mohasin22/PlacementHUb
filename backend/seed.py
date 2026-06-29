import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
from datetime import datetime, timezone

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.placement_hub
    
    # Let's seed for ALL institutions that have 0 programs
    institutions = await db.institutions.find().to_list(None)
    for inst in institutions:
        inst_id = str(inst['_id'])
        progs = await db.programs.find({"institution_id": inst_id}).to_list(None)
        print(f"Institution {inst['name']} ({inst_id}) has {len(progs)} programs")
        
        if len(progs) == 0:
            print(f"Seeding default programs for {inst['name']}...")
            prog_result = await db.programs.insert_one({
                "program_name": "B.Tech",
                "institution_id": inst_id,
                "created_at": datetime.now(timezone.utc)
            })
            prog_id = str(prog_result.inserted_id)
            
            dept_result = await db.departments.insert_one({
                "department_name": "Computer Science",
                "program_id": prog_id,
                "institution_id": inst_id,
                "created_at": datetime.now(timezone.utc)
            })
            dept_id = str(dept_result.inserted_id)
            
            await db.classes.insert_one({
                "class_name": "CSE-A",
                "department_id": dept_id,
                "program_id": prog_id,
                "institution_id": inst_id,
                "created_at": datetime.now(timezone.utc)
            })
            print(f"Seeded successfully for {inst_id}.")
            
            prog_result2 = await db.programs.insert_one({
                "program_name": "MBA",
                "institution_id": inst_id,
                "created_at": datetime.now(timezone.utc)
            })

if __name__ == '__main__':
    asyncio.run(main())
