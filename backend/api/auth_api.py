from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
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

router = APIRouter(prefix="/auth", tags=["auth"])


# ============================
# 注册
# ============================
@router.post("/register")
async def register_user(payload: AuthPayload, db: AsyncSession = Depends(get_db)):
    email=payload.email
    password=payload.password
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
    token = create_access_token({"sub": user.id})

    # HttpOnly Cookie（推荐）
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax"
    )

    return {"message": "Login successful", "user_id": user.id}
