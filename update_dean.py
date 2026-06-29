import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def update_dean_email():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["placementhub"]
    
    # Update the dean user email
    result = await db.users.update_one(
        {"role": "Dean", "email": "dean@iot.edu"},
        {"$set": {"email": "surajneralla2007@gmail.com"}}
    )
    
    if result.modified_count > 0:
        print("Successfully updated Dean email to surajneralla2007@gmail.com")
    else:
        # Check if already updated
        check = await db.users.find_one({"email": "surajneralla2007@gmail.com"})
        if check:
            print("Dean email is already surajneralla2007@gmail.com")
        else:
            print("Could not find Dean user to update.")

asyncio.run(update_dean_email())
