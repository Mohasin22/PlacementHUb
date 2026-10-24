import asyncio
from app.db.connection import connect_to_mongo, close_mongo_connection, db
from app.db.utils import parse_id, id_query
from app.services.excel_importer import match_registered_class

async def run_cleanup():
    await connect_to_mongo()
    print("Starting cleanup of auto-created bulk upload duplicate classes...")
    
    all_classes = await db.db.classes.find().to_list(1000)
    
    # Identify auto-created classes (created with display_name containing '|' and academic_batch_id)
    auto_classes = [
        c for c in all_classes
        if c.get("academic_batch_id") and "|" in str(c.get("display_name", ""))
    ]
    
    print(f"Found {len(auto_classes)} auto-created duplicate classes in database.")
    
    remap_count = 0
    student_update_count = 0
    faculty_update_count = 0
    
    for ac in auto_classes:
        ac_id = str(ac["_id"])
        inst_id = ac.get("institution_id")
        dept_id = ac.get("department_id")
        prog_id = ac.get("program_id")
        sec_name = ac.get("section_name") or ac.get("class_name")
        
        # Find registered classes for this institution
        inst_classes = [
            c for c in all_classes
            if str(c.get("institution_id")) == str(inst_id) and not c.get("academic_batch_id") and "|" not in str(c.get("display_name", ""))
        ]
        
        target = match_registered_class(sec_name, dept_id, prog_id, inst_classes)
        if not target and inst_classes:
            target = inst_classes[0]
            
        if target:
            target_id = str(target.get("id") or target["_id"])
            target_name = target.get("class_name") or target.get("name", "Registered Class")
            print(f"Remapping AutoClass '{ac.get('display_name')}' ({ac_id}) -> Registered Class '{target_name}' ({target_id})")
            
            # 1. Update students
            st_res = await db.db.students.update_many(
                {"$or": [{"class_id": ac_id}, {"academic_identity.class_id": ac_id}, {"class_id": parse_id(ac_id)}]},
                {"$set": {
                    "class_id": target_id,
                    "class_name": target_name,
                    "academic_identity.class_id": target_id,
                    "academic_identity.class_name": target_name
                }}
            )
            student_update_count += st_res.modified_count
            
            # 2. Update faculty
            fc_res = await db.db.users.update_many(
                {"class_id": ac_id},
                {"$set": {"class_id": target_id}}
            )
            faculty_update_count += fc_res.modified_count
            
            # 3. Update faculty_coordinator_id on target class if needed
            if ac.get("faculty_coordinator_id") and not target.get("faculty_coordinator_id"):
                await db.db.classes.update_one(
                    id_query(target_id),
                    {"$set": {"faculty_coordinator_id": ac["faculty_coordinator_id"]}}
                )
            
            # 4. Remove auto-created duplicate class
            await db.db.classes.delete_one({"_id": ac["_id"]})
            remap_count += 1
        else:
            print(f"Warning: No registered class found for auto-class {ac.get('display_name')} ({ac_id})")
            
    print(f"\nCleanup finished:")
    print(f"  - Deleted {remap_count} duplicate classes")
    print(f"  - Remapped {student_update_count} student records")
    print(f"  - Remapped {faculty_update_count} faculty user assignments")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_cleanup())
