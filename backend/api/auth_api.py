from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator
from backend.db.database import get_db
from backend.db.crud import (
    create_user, 
    authenticate_user,
    get_user_by_email
)
from backend.core.security import create_access_token


class AuthPayload(BaseModel):
    email: str
    password: str

    @field_validator('password', mode='before')
    @classmethod
    def ensure_string(cls, v):
        """确保密码是字符串类型"""
        if v is None:
            raise ValueError('Password cannot be empty')
        return str(v)  # 强制转换为字符串

router = APIRouter(prefix="/auth", tags=["auth"])


# ============================
# 注册
# ============================
@router.post("/register")
async def register_user(payload: AuthPayload, db: AsyncSession = Depends(get_db)):
    email=payload.email
    password=payload.password
    
    # 额外检查
    if not password or len(password) < 1:
        raise HTTPException(status_code=400, detail="Password is required")
    
    # 查重
    existing = await get_user_by_email(db, email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await create_user(db, email, password)
    return {"id": user.id, "email": user.email}


# ============================
# 登录
# ============================
@router.post("/login")
async def login_user(payload: AuthPayload, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email
    password = payload.password
    user = await authenticate_user(db, email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # 创建 JWT
    token = create_access_token({"sub": str(user.id)})

    # HttpOnly Cookie（推荐）
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,        # 🔥 改为 False（Nginx 已处理 HTTPS）
        samesite="lax",      # 允许跨子域
        path="/",            # 🔥 确保全站可用
        max_age=7*24*3600,   # 7天过期
        domain=None          # 🔥 不限制域名
    )

    return {"message": "Login successful", "user_id": user.id}
