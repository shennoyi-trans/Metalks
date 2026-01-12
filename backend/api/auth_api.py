# backend/api/auth_api.py
"""
用户认证相关 API
- 注册（支持可选昵称，自动生成默认昵称）
- 登录（登录后自动每日签到）
- 登出
- 验证接口（检查邮箱、昵称是否可用）
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator
from typing import Optional

from backend.db.database import get_db
from backend.db.crud import user as user_crud
from backend.core.security import create_access_token
from backend.services import nickname_service, electrolyte_service
from backend.utils.validators import validate_email_format, validate_password_strength


class RegisterPayload(BaseModel):
    """注册请求体"""
    email: str
    password: str
    nickname: Optional[str] = None  # 可选昵称

    @field_validator('password', mode='before')
    @classmethod
    def ensure_string(cls, v):
        """确保密码是字符串类型"""
        if v is None:
            raise ValueError('密码不能为空')
        return str(v)


class LoginPayload(BaseModel):
    """登录请求体"""
    email: str
    password: str

    @field_validator('password', mode='before')
    @classmethod
    def ensure_string(cls, v):
        """确保密码是字符串类型"""
        if v is None:
            raise ValueError('密码不能为空')
        return str(v)


router = APIRouter(prefix="/auth", tags=["auth"])


# ============================
# 注册
# ============================
@router.post("/register")
async def register_user(
    payload: RegisterPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册
    
    请求体:
        - email: 邮箱（必填）
        - password: 密码（必填，最少6位）
        - nickname: 昵称（可选）
    
    返回:
        {
            "id": 用户ID,
            "email": 邮箱,
            "nickname": 昵称,
            "electrolyte_balance": 电解液余额
        }
    
    说明:
        - 如果不提供昵称，自动使用邮箱前缀作为昵称
        - 如果邮箱前缀昵称已被占用，自动添加随机后缀
        - 初始电解液为 0
    """
    email = payload.email
    password = payload.password
    nickname = payload.nickname
    
    # 1. 验证邮箱格式
    is_valid_email, email_error = validate_email_format(email)
    if not is_valid_email:
        raise HTTPException(status_code=400, detail=email_error)
    
    # 2. 验证密码强度
    is_valid_password, password_error = validate_password_strength(password)
    if not is_valid_password:
        raise HTTPException(status_code=400, detail=password_error)
    
    # 3. 检查邮箱是否已注册
    existing_email = await user_crud.get_user_by_email(db, email)
    if existing_email:
        raise HTTPException(status_code=400, detail="该邮箱已被注册")
    
    # 4. 处理昵称
    if nickname:
        # 用户提供了昵称，验证是否可用
        is_valid, error_msg = await nickname_service.validate_nickname(db, nickname)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
    else:
        # 用户未提供昵称，自动生成
        nickname = await nickname_service.generate_default_nickname(db, email)
    
    # 5. 创建用户
    user = await user_crud.create_user(
        db,
        email=email,
        password=password,
        nickname=nickname
    )
    
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "electrolyte_balance": user.electrolyte_number
    }


# ============================
# 登录
# ============================
@router.post("/login")
async def login_user(
    payload: LoginPayload,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录
    
    请求体:
        - email: 邮箱
        - password: 密码
    
    返回:
        {
            "message": "登录成功",
            "user_id": 用户ID,
            "nickname": 昵称,
            "checkin": {
                "already_checked": 今天是否已签到,
                "gained": 本次获得的电解液,
                "balance": 签到后的余额
            }
        }
    
    说明:
        - 登录成功后，自动进行每日签到
        - 一天内首次登录，给予 1 个电解液
        - 已签到则不重复给予
    """
    email = payload.email
    password = payload.password
    
    # 验证用户
    user = await user_crud.authenticate_user(db, email, password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="邮箱或密码错误"
        )
    
    # 创建 JWT Token
    token = create_access_token({"sub": str(user.id)})
    
    # 设置 HttpOnly Cookie
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,        # 如果使用HTTPS，改为True
        samesite="lax",
        path="/",
        max_age=7*24*3600,   # 7天过期
        domain=None
    )
    
    # 🆕 每日签到
    checkin_result = await electrolyte_service.process_daily_checkin(db, user.id)
    
    return {
        "message": "登录成功",
        "user_id": user.id,
        "nickname": user.nickname,
        "checkin": checkin_result
    }


# ============================
# 登出
# ============================
@router.post("/logout")
async def logout_user(response: Response):
    """
    用户登出
    
    说明:
        - 清除 Cookie 中的 access_token
    """
    response.delete_cookie(
        key="access_token",
        path="/",
        domain=None
    )
    
    return {"message": "登出成功"}


# ============================
# 验证接口：检查邮箱是否可用
# ============================
@router.get("/check-email")
async def check_email_available(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """
    检查邮箱是否可用
    
    参数:
        - email: 邮箱地址（Query参数）
    
    返回:
        {
            "available": bool,  # 是否可用
            "message": str      # 提示信息
        }
    """
    # 验证邮箱格式
    is_valid_format, format_error = validate_email_format(email)
    if not is_valid_format:
        return {
            "available": False,
            "message": format_error
        }
    
    # 检查是否已注册
    existing = await user_crud.get_user_by_email(db, email)
    
    if existing:
        return {
            "available": False,
            "message": "该邮箱已被注册"
        }
    
    return {
        "available": True,
        "message": "邮箱可用"
    }


# ============================
# 验证接口：检查昵称是否可用
# ============================
@router.get("/check-nickname")
async def check_nickname_available(
    nickname: str,
    db: AsyncSession = Depends(get_db)
):
    """
    检查昵称是否可用
    
    参数:
        - nickname: 昵称（Query参数）
    
    返回:
        {
            "available": bool,  # 是否可用
            "message": str      # 提示信息
        }
    """
    # 验证昵称（格式、重复、敏感词）
    is_valid, error_msg = await nickname_service.validate_nickname(db, nickname)
    
    if not is_valid:
        return {
            "available": False,
            "message": error_msg
        }
    
    return {
        "available": True,
        "message": "昵称可用"
    }
