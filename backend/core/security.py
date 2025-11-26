from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

# 建议重新设置一个随机字符串作为密钥
SECRET_KEY = "metalks_super_secret_jwt_key_please_change"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # token 有效期 7 天

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# =======================
# 密码哈希
# =======================
def verify_password(plain_password, hashed):
    plain_password = str(plain_password) if plain_password else ""
    return pwd_context.verify(plain_password, hashed)


def hash_password(password: str):
    password = str(password) if password else ""

    if not password:
        raise ValueError("Password cannot be empty")
    
    # 限制长度（虽然不太可能超）
    if len(password.encode('utf-8')) > 72:
        # bcrypt 限制，截断或用 SHA256 预处理
        import hashlib
        password = hashlib.sha256(password.encode('utf-8')).hexdigest()
        
    return pwd_context.hash(password)

# =======================
# 创建 JWT token
# =======================
def create_access_token(data: dict, expires_delta=None):
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# =======================
# 验证 JWT
# =======================
def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
