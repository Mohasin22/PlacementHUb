import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

def is_valid_url(val: str) -> bool:
    if not val or not isinstance(val, str):
        return False
    v = val.strip()
    return v.startswith("http://") or v.startswith("https://") or "drive.google.com" in v or "docs.google.com" in v

async def backfill():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['placementhub']
    cursor = db.students.find({"import_metadata.raw_row_reference": {"$exists": True}})
    updated_count = 0
    
    async for s in cursor:
        raw = s.get("import_metadata", {}).get("raw_row_reference", {})
        
        # 1. Resume / Combined Document PDF Link
        resume_link = None
        for k, v in raw.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ["upload your document", "resume", "single pdf", "cv", "combined document"]):
                v_str = str(v).strip() if v else ""
                if is_valid_url(v_str):
                    resume_link = v_str
                    break
        
        # 2. Technical Certificates URL (Make a single file of all technical certificates...)
        tech_link = None
        for k, v in raw.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ["make a single file of all technical certificates", "technical certificate", "technical"]):
                v_str = str(v).strip() if v else ""
                if is_valid_url(v_str):
                    tech_link = v_str
                    break
                    
        # 3. Achievement Certificates URL
        achieve_link = None
        for k, v in raw.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ["achievement certificate", "achievements certificate", "any other achievements certificates"]):
                v_str = str(v).strip() if v else ""
                if is_valid_url(v_str):
                    achieve_link = v_str
                    break
                    
        # 4. Photo URL
        photo_link = None
        for k, v in raw.items():
            k_lower = k.lower()
            if any(term in k_lower for term in ["upload your photo", "passport photograph", "photo url"]):
                v_str = str(v).strip() if v else ""
                if is_valid_url(v_str):
                    photo_link = v_str
                    break
                    
        existing_docs = s.get("documents") or {}
        if not isinstance(existing_docs, dict):
            existing_docs = {}
            
        cur_resume = existing_docs.get("resume") if is_valid_url(existing_docs.get("resume")) else ""
        cur_tech = existing_docs.get("technical_certificates") if is_valid_url(existing_docs.get("technical_certificates")) else ""
        cur_achieve = existing_docs.get("achievement_certificates") if is_valid_url(existing_docs.get("achievement_certificates")) else ""
        cur_photo = existing_docs.get("profile_photo") if is_valid_url(existing_docs.get("profile_photo")) else ""

        final_resume = cur_resume or (s.get("resume_url") if is_valid_url(s.get("resume_url")) else "") or resume_link or ""
        final_tech = cur_tech or tech_link or ""
        final_achieve = cur_achieve or achieve_link or ""
        final_photo = cur_photo or (s.get("photo_url") if is_valid_url(s.get("photo_url")) else "") or photo_link or ""
        
        set_payload = {
            "resume_url": final_resume,
            "photo_url": final_photo,
            "documents.resume": final_resume,
            "documents.combined_documents": final_resume,
            "documents.technical_certificates": final_tech,
            "documents.achievement_certificates": final_achieve,
            "documents.profile_photo": final_photo
        }
        
        await db.students.update_one({"_id": s["_id"]}, {"$set": set_payload})
        updated_count += 1
        
    print(f"Successfully cleaned and updated document/resume links for {updated_count} students.")

if __name__ == "__main__":
    asyncio.run(backfill())
