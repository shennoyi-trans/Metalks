# backend/db/crud/user.py
"""
用户基础 CRUD 操作
- 用户查询（按ID、邮箱、昵称）
- 用户创建
- 用户信息更新
- 密码修改
- 登录日期更新
"""

from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import User
from backend.core.security import hash_password, verify_password


# ============================================================
# 用户查询
# ============================================================

async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """根据用户ID查询用户"""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """根据邮箱查询用户"""
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()


async def get_user_by_nickname(db: AsyncSession, nickname: str) -> Optional[User]:
    """根据昵称查询用户（用于验重）"""
    result = await db.execute(
        select(User).where(User.nickname == nickname)
    )
    return result.scalar_one_or_none()


# ============================================================
# 用户创建
# ============================================================

async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    nickname: Optional[str] = None,
    phone_number: Optional[str] = None
) -> User:
    """
    创建新用户
    
    参数:
        email: 邮箱
        password: 明文密码（会自动哈希）
        nickname: 昵称（可选）
        phone_number: 手机号（可选）
    
    返回:
        创建的用户对象
    
    注意:
        - 不检查邮箱/昵称是否已存在（由调用方处理）
        - 初始电解液为 0
    """
    hashed = hash_password(password)
    
    user = User(
        email=email,
        password_hash=hashed,
        nickname=nickname,
        phone_number=phone_number,
        electrolyte_number=0.0,  # 初始电解液为0
        is_plus=False,
        is_admin=False,
        last_login_date=None
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return user


# ============================================================
# 用户信息更新
# ============================================================

async def update_user_profile(
    db: AsyncSession,
    user_id: int,
    **kwargs
) -> Optional[User]:
    """
    更新用户基本信息
    
    参数:
        user_id: 用户ID
        **kwargs: 要更新的字段（email, phone_number等）
    
    返回:
        更新后的用户对象
    
    注意:
        - 不允许通过此方法修改：password_hash, electrolyte_number, nickname
        - 这些字段有专门的方法处理
    """
    user = await get_user_by_id(db, user_id)
    if not user:
        return None
    
    # 只允许更新特定字段
    allowed_fields = ['email', 'phone_number']
    
    for key, value in kwargs.items():
        if key in allowed_fields and value is not None:
            setattr(user, key, value)
    
    await db.commit()
    await db.refresh(user)
    
    return user


async def update_user_password(
    db: AsyncSession,
    user_id: int,
    old_password: str,
    new_password: str
) -> tuple[bool, str]:
    """
    修改用户密码
    
    参数:
        user_id: 用户ID
        old_password: 旧密码（明文）
        new_password: 新密码（明文）
    
    返回:
        (是否成功, 消息)
    """
    user = await get_user_by_id(db, user_id)
    if not user:
        return False, "用户不存在"
    
    # 验证旧密码
    if not verify_password(old_password, user.password_hash):
        return False, "旧密码错误"
    
    # 更新密码
    user.password_hash = hash_password(new_password)
    
    await db.commit()
    
    return True, "密码修改成功"


# ============================================================
# 登录日期更新（用于每日签到）
# ============================================================

async def update_last_login_date(
    db: AsyncSession,
    user_id: int,
    login_date: date = None
) -> Optional[User]:
    """
    更新用户最后登录日期
    
    参数:
        user_id: 用户ID
        login_date: 登录日期（默认为今天）
    
    返回:
        更新后的用户对象
    """
    if login_date is None:
        login_date = date.today()
    
    user = await get_user_by_id(db, user_id)
    if not user:
        return None
    
    user.last_login_date = login_date
    
    await db.commit()
    await db.refresh(user)
    
    return user


async def check_user_login_today(
    db: AsyncSession,
    user_id: int
) -> bool:
    """
    检查用户今天是否已登录
    
    返回:
        True: 今天已登录
        False: 今天未登录
    """
    user = await get_user_by_id(db, user_id)
    if not user:
        return False
    
    if user.last_login_date is None:
        return False
    
    return user.last_login_date == date.today()


# ============================================================
# 用户认证
# ============================================================

async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str
) -> Optional[User]:
    """
    验证用户登录
    
    参数:
        email: 邮箱
        password: 密码（明文）
    
    返回:
        验证成功: User对象
        验证失败: None
    """
    user = await get_user_by_email(db, email)
    
    if not user:
        return None
    
    if not verify_password(password, user.password_hash):
        return None
    
    return user
