from dotenv import load_dotenv
load_dotenv()

import os

class Settings:
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB: str = os.getenv("MONGO_DB", "placementhub")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "supersecretjwtkey_change_me_in_production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRY_MINUTES: int = int(os.getenv("JWT_EXPIRY_MINUTES", "1440"))  # 24 hours
    OTP_EXPIRY_MINUTES: int = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))

    # SMTP Email Delivery (optional — falls back to console if not set)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "5241411066@gvpcdpgc.edu.in")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")  # Gmail App Password
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "PlacementHub")

    # AI Configuration (Agentic AI Layer)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "auto")  # "gemini", "openai", "mock", "auto"
    AI_MODEL: str = os.getenv("AI_MODEL", "gemini-1.5-flash")
    AI_API_KEY: str = os.getenv("AI_API_KEY", os.getenv("GEMINI_API_KEY", os.getenv("OPENAI_API_KEY", "")))

    # URLs for OAuth Callbacks & Frontend Navigation
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    BACKEND_PUBLIC_URL: str = os.getenv("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")

    # CORS Allowed Origins (Avoid wildcard with credentials)
    CORS_ORIGINS: list = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000").split(",")
        if origin.strip()
    ]

    # Webhook Shared Secret
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "")

    # Professional Account Verification: GitHub OAuth
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI: str = os.getenv(
        "GITHUB_REDIRECT_URI",
        f"{os.getenv('BACKEND_PUBLIC_URL', 'http://127.0.0.1:8000').rstrip('/')}/api/auth/github/callback"
    )

    # Professional Account Verification: LinkedIn OAuth (OIDC)
    LINKEDIN_CLIENT_ID: str = os.getenv("LINKEDIN_CLIENT_ID", "")
    LINKEDIN_CLIENT_SECRET: str = os.getenv("LINKEDIN_CLIENT_SECRET", "")
    LINKEDIN_REDIRECT_URI: str = os.getenv(
        "LINKEDIN_REDIRECT_URI",
        f"{os.getenv('BACKEND_PUBLIC_URL', 'http://127.0.0.1:8000').rstrip('/')}/api/auth/linkedin/callback"
    )

settings = Settings()
