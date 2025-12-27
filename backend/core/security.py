from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

SECRET_KEY = "metalks_super_secret_jwt_key_please_change"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password, hashed):
    plain_password = str(plain_password) if plain_password else ""
    return pwd_context.verify(plain_password, hashed)


def hash_password(password: str):
    password = str(password) if password else ""
    if not password:
        raise ValueError("Password cannot be empty")
    if len(password.encode('utf-8')) > 72:
        import hashlib
        password = hashlib.sha256(password.encode('utf-8')).hexdigest()
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta=None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    print(f"🔑 Token created: {token[:50]}...")  # 🔥 调试
    return token


def decode_access_token(token: str):
    try:
        print(f"🔍 Trying to decode: {token[:50]}...")  # 🔥 调试
        print(f"🔑 Using SECRET_KEY: {SECRET_KEY[:20]}...")  # 🔥 调试
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        print(f"✅ Decode success: {payload}")  # 🔥 调试
        return payload
    except JWTError as e:
        print(f"❌ JWT Error: {type(e).__name__}: {str(e)}")  # 🔥 关键：看具体错误
        return None
    except Exception as e:
        print(f"❌ Unexpected Error: {type(e).__name__}: {str(e)}")  # 🔥 调试
        return None