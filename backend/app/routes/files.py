from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from fastapi.responses import FileResponse
from app.db.tenant import get_current_user
import uuid
import os

router = APIRouter()

# Setup local uploads directory
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = "resume"  # "resume" or "photo"
):
    # Determine rules based on type
    max_size = 5 * 1024 * 1024 if file_type == "resume" else 2 * 1024 * 1024
    allowed_extensions = [".pdf", ".docx"] if file_type == "resume" else [".jpg", ".jpeg", ".png"]
    
    # Read size and content
    contents = await file.read()
    file_size = len(contents)
    
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum size of {max_size / (1024 * 1024)}MB."
        )
        
    _, ext = os.path.splitext(file.filename)
    ext = ext.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension. Allowed: {', '.join(allowed_extensions)}"
        )
        
    # Generate unique non-overlapping filename
    unique_filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Save file
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {e}"
        )
        
    return {
        "filename": unique_filename,
        "original_name": file.filename,
        "url": f"http://localhost:8000/api/files/download/{unique_filename}"
    }

@router.get("/download/{filename}")
async def download_file(filename: str, current_user: dict = Depends(get_current_user)):
    # Protect against path traversal attacks by extracting base name only
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file could not be found."
        )
        
    # Serve file response
    return FileResponse(filepath)
