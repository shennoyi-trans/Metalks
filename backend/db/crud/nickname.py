# backend/db/crud/nickname.py
"""
昵称相关 CRUD 操作
- 昵称更新
- 昵称历史记录
- 昵称历史查询
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.db.models import User, NicknameHistory


# ============================================================
# 昵称更新
# ============================================================

async def update_user_nickname(
    db: AsyncSession,
    user_id: int,
    new_nickname: str,
    electrolyte_cost: float = 0.0
) -> Optional[User]:
    """
    更新用户昵称
    
    参数:
        user_id: 用户ID
        new_nickname: 新昵称
        electrolyte_cost: 本次修改消耗的电解液
    
    返回:
        更新后的用户对象
    
    注意:
        - 不检查昵称是否已存在（由调用方处理）
        - 不扣除电解液（由 electrolyte.py 处理）
        - 不记录历史（由 add_nickname_history 处理）
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    # 保存旧昵称（用于记录历史）
    old_nickname = user.nickname
    
    # 更新昵称
    user.nickname = new_nickname
    
    await db.commit()
    await db.refresh(user)
    
    return user


# ============================================================
# 昵称历史记录
# ============================================================

async def add_nickname_history(
    db: AsyncSession,
    user_id: int,
    old_nickname: Optional[str],
    new_nickname: str,
    electrolyte_cost: float = 0.0
) -> NicknameHistory:
    """
    添加昵称修改历史记录
    
    参数:
        user_id: 用户ID
        old_nickname: 旧昵称（首次设置时为None）
        new_nickname: 新昵称
        electrolyte_cost: 本次修改消耗的电解液
    
    返回:
        创建的历史记录对象
    """
    history = NicknameHistory(
        user_id=user_id,
        old_nickname=old_nickname,
        new_nickname=new_nickname,
        electrolyte_cost=electrolyte_cost
    )
    
    db.add(history)
    await db.commit()
    await db.refresh(history)
    
    return history


async def get_nickname_history(
    db: AsyncSession,
    user_id: int,
    limit: int = 10,
    offset: int = 0
) -> List[NicknameHistory]:
    """
    查询用户的昵称修改历史
    
    参数:
        user_id: 用户ID
        limit: 返回记录数（默认10条）
        offset: 偏移量（用于分页）
    
    返回:
        历史记录列表（按时间倒序）
    """
    result = await db.execute(
        select(NicknameHistory)
        .where(NicknameHistory.user_id == user_id)
        .order_by(desc(NicknameHistory.created_at))
        .limit(limit)
        .offset(offset)
    )
    
    return list(result.scalars().all())


async def count_nickname_changes(
    db: AsyncSession,
    user_id: int
) -> int:
    """
    统计用户昵称修改次数
    
    参数:
        user_id: 用户ID
    
    返回:
        修改次数
    """
    result = await db.execute(
        select(NicknameHistory)
        .where(NicknameHistory.user_id == user_id)
    )
    
    return len(list(result.scalars().all()))


async def get_latest_nickname_change(
    db: AsyncSession,
    user_id: int
) -> Optional[NicknameHistory]:
    """
    获取用户最近一次昵称修改记录
    
    参数:
        user_id: 用户ID
    
    返回:
        最新的历史记录（如果存在）
    """
    result = await db.execute(
        select(NicknameHistory)
        .where(NicknameHistory.user_id == user_id)
        .order_by(desc(NicknameHistory.created_at))
        .limit(1)
    )
    
    return result.scalar_one_or_none()
