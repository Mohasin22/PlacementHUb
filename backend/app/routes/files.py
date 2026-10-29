from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends, Query, Request
from fastapi.responses import FileResponse
from typing import Optional
from app.db.tenant import get_current_user, get_tenant_id
from app.db.connection import db
from app.config import settings
from jose import jwt, JWTError
import uuid
import os

router = APIRouter()

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "resume": [".pdf", ".docx", ".doc"],
    "photo": [".jpg", ".jpeg", ".png"],
    "document": [".pdf", ".docx", ".doc", ".xlsx", ".csv"]
}

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = "resume",
    current_user: dict = Depends(get_current_user),
    institution_id: str = Depends(get_tenant_id)
):
    max_size = 15 * 1024 * 1024 if file_type in ["resume", "document"] else 3 * 1024 * 1024
    allowed = ALLOWED_EXTENSIONS.get(file_type, [".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png"])
    
    contents = await file.read()
    file_size = len(contents)
    
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum size of {max_size / (1024 * 1024):.0f}MB."
        )
        
    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(allowed)}"
        )
        
    unique_filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, unique_filename)
    
    try:
        with open(filepath, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {e}"
        )
        
    # Associate uploaded file with tenant metadata
    await db.db.uploaded_files_metadata.insert_one({
        "filename": unique_filename,
        "original_name": file.filename,
        "institution_id": institution_id,
        "uploaded_by_user_id": current_user.get("user_id"),
        "uploaded_by_role": current_user.get("role"),
        "file_type": file_type,
        "file_size": file_size
    })

    return {
        "filename": unique_filename,
        "original_name": file.filename,
        "url": f"/api/files/secure-download/{unique_filename}"
    }

def verify_token_or_param(request: Request, token_param: Optional[str] = None) -> dict:
    """Extracts and verifies JWT token from Authorization header or URL query parameter."""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif token_param:
        token = token_param

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access file."
        )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication credentials."
        )

@router.get("/secure-download/{filename}")
async def secure_download_file(
    filename: str,
    request: Request,
    token: Optional[str] = Query(None)
):
    """
    Authenticated and tenant-isolated endpoint for accessing uploaded documents and resumes.
    Verifies user token and ensures cross-tenant data leakage is prevented.
    """
    user_payload = verify_token_or_param(request, token)
    user_inst_id = user_payload.get("institution_id")
    user_role = user_payload.get("role")
    user_id = user_payload.get("user_id")

    safe_filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested file could not be found."
        )

    # Check file tenant metadata if recorded
    meta = await db.db.uploaded_files_metadata.find_one({"filename": safe_filename})
    if meta:
        if meta.get("institution_id") and meta["institution_id"] != user_inst_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Cross-institution access is strictly prohibited."
            )
        # If student role, ensure they are requesting their own file or an open drive document
        if user_role == "Student" and meta.get("uploaded_by_user_id"):
            if str(meta["uploaded_by_user_id"]) != str(user_id):
                # Verify if file is their resume in student profile
                st = await db.db.students.find_one({"_id": user_id})
                if not st or safe_filename not in str(st.get("resume_url", "")) + str(st.get("photo_url", "")):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Students may only view their own uploaded files."
                    )

    _, ext = os.path.splitext(safe_filename)
    ext = ext.lower()
    media_type = "application/pdf" if ext == ".pdf" else "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png" if ext == ".png" else "application/octet-stream"

    return FileResponse(filepath, media_type=media_type)

@router.get("/download/{filename}")
async def download_file_compat(
    filename: str,
    request: Request,
    token: Optional[str] = Query(None)
):
    """
    Backward-compatible download endpoint. Enforces secure download verification and tenant isolation.
    """
    return await secure_download_file(filename=filename, request=request, token=token)
