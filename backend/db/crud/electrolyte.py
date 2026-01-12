# backend/db/crud/electrolyte.py
"""
电解液相关 CRUD 操作
- 查询余额
- 增加电解液
- 扣除电解液
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import User


# ============================================================
# 电解液查询
# ============================================================

async def get_electrolyte_balance(
    db: AsyncSession,
    user_id: int
) -> Optional[float]:
    """
    查询用户电解液余额
    
    参数:
        user_id: 用户ID
    
    返回:
        电解液余额（float），用户不存在返回 None
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    return user.electrolyte_number


# ============================================================
# 电解液增加
# ============================================================

async def add_electrolyte(
    db: AsyncSession,
    user_id: int,
    amount: float,
    reason: str = ""
) -> tuple[bool, str, float]:
    """
    增加用户电解液
    
    参数:
        user_id: 用户ID
        amount: 增加数量（必须为正数）
        reason: 原因说明（如 "daily_checkin", "admin_gift"）
    
    返回:
        (是否成功, 消息, 操作后余额)
    """
    if amount <= 0:
        return False, "增加数量必须大于0", 0.0
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return False, "用户不存在", 0.0
    
    # 增加电解液
    user.electrolyte_number += amount
    
    await db.commit()
    await db.refresh(user)
    
    return True, f"成功增加 {amount} 电解液", user.electrolyte_number


# ============================================================
# 电解液扣除
# ============================================================

async def deduct_electrolyte(
    db: AsyncSession,
    user_id: int,
    amount: float,
    reason: str = "",
    allow_negative: bool = False
) -> tuple[bool, str, float]:
    """
    扣除用户电解液
    
    参数:
        user_id: 用户ID
        amount: 扣除数量（必须为正数）
        reason: 原因说明（如 "change_nickname"）
        allow_negative: 是否允许余额为负数（默认不允许）
    
    返回:
        (是否成功, 消息, 操作后余额)
    """
    if amount <= 0:
        return False, "扣除数量必须大于0", 0.0
    
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return False, "用户不存在", 0.0
    
    # 检查余额是否足够
    if not allow_negative and user.electrolyte_number < amount:
        return False, "电解液不足", user.electrolyte_number
    
    # 扣除电解液
    user.electrolyte_number -= amount
    
    await db.commit()
    await db.refresh(user)
    
    return True, f"成功扣除 {amount} 电解液", user.electrolyte_number


# ============================================================
# 电解液设置（管理员功能）
# ============================================================

async def set_electrolyte_balance(
    db: AsyncSession,
    user_id: int,
    new_balance: float
) -> tuple[bool, str, float]:
    """
    直接设置用户电解液余额（管理员功能）
    
    参数:
        user_id: 用户ID
        new_balance: 新余额
    
    返回:
        (是否成功, 消息, 操作后余额)
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return False, "用户不存在", 0.0
    
    user.electrolyte_number = new_balance
    
    await db.commit()
    await db.refresh(user)
    
    return True, f"余额已设置为 {new_balance}", user.electrolyte_number
