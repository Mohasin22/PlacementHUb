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
    SMTP_USER: str = os.getenv("SMTP_USER", "")        # e.g. yourapp@gmail.com
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")  # Gmail App Password
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "PlacementHub")

settings = Settings()
