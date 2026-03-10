# backend/db/crud/notification.py
"""
通知 CRUD 操作
- 写入通知
- 按用户查询
- 按关联对象删除（逐条消除）

事务约定：
    所有写操作均不单独 commit，由调用方（service / API 层）统一提交。
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from backend.db.models import Notification


async def create_notification(
    db: AsyncSession,
    user_id: int,
    module: str,
    ref_id: int,
    notification_type: str,
    message: str = "",
) -> Notification:
    """
    写入一条通知
    """
    n = Notification(
        user_id=user_id,
        module=module,
        ref_id=ref_id,
        type=notification_type,
        message=message,
    )
    db.add(n)
    return n


async def get_by_user(
    db: AsyncSession,
    user_id: int,
    module: Optional[str] = None,
) -> List[Notification]:
    """
    查询用户的通知列表

    参数:
        module: 可选，按模块过滤（如 "topic"）
    """
    q = select(Notification).where(Notification.user_id == user_id)
    if module:
        q = q.where(Notification.module == module)
    q = q.order_by(Notification.created_at.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


async def delete_by_ref(
    db: AsyncSession,
    user_id: int,
    module: str,
    ref_id: int,
) -> int:
    """
    删除指定用户在某模块下某关联对象的所有通知

    用于逐条消除：用户查看/编辑某话题时，只删该话题的通知。
    """
    result = await db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.module == module,
            Notification.ref_id == ref_id,
        )
    )
    return result.rowcount
