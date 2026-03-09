# backend/core/security.py
"""
安全工具：JWT 令牌 + 密码哈希
"""

import logging
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
import os

logger = logging.getLogger("security")

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30天

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
    return token


def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        # 使用 logging 替代 print，避免泄露安全信息到 stdout
        logger.debug("JWT 解码失败: %s", type(e).__name__)
        return None
    except Exception as e:
        logger.warning("JWT 解码时发生意外错误: %s", type(e).__name__)
        return None