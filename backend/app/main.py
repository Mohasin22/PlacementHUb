from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.connection import connect_to_mongo, close_mongo_connection
from app.routes import auth, institution, student, faculty, drive, tpo, files, dean, profile
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging

limiter = Limiter(key_func=get_remote_address)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.main")

app = FastAPI(
    title="PlacementHub API",
    description="Multi-Tenant Placement Management & Recruitment Automation Platform API",
    version="1.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lifecycle events
@app.on_event("startup")
async def startup_event():
    logger.info("Initializing API services...")
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down API services...")
    await close_mongo_connection()

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(institution.router, prefix="/api/institutions", tags=["Institutions"])
app.include_router(student.router, prefix="/api/students", tags=["Students"])
app.include_router(faculty.router, prefix="/api/faculty", tags=["Faculty"])
app.include_router(drive.router, prefix="/api/drives", tags=["Drives"])
app.include_router(tpo.router, prefix="/api/tpo", tags=["TPO"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(dean.router, prefix="/api/dean", tags=["Dean"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])


@app.get("/")
def read_root():
    return {
        "app": "PlacementHub API",
        "status": "online",
        "version": "1.0.0",
        "message": "Welcome to PlacementHub Multi-Tenant Recruitment API."
    }
