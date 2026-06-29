import jwt
from datetime import datetime, timedelta, timezone
from app.config import settings
import secrets
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def generate_otp() -> str:
    # Generates a 6-digit secure numeric OTP
    return "".join(secrets.choice("0123456789") for _ in range(6))

def create_access_token(data: dict, remember_me: bool = False) -> str:
    to_encode = data.copy()
    
    if remember_me:
        expire = datetime.now(timezone.utc) + timedelta(days=30)
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None
