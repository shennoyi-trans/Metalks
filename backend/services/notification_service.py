# backend/services/notification_service.py
"""
通知业务服务
- 向话题所有作者批量写入通知
"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import notification as notification_crud
from backend.db.crud import topic_author as author_crud


async def notify_topic_authors(
    db: AsyncSession,
    topic_id: int,
    notification_type: str,
    message: str,
    exclude_user_id: int = None,
):
    """
    向话题的所有作者写入通知

    参数:
        topic_id:           话题 ID
        notification_type:  通知类型（approved / rejected / deactivated）
        message:            通知文案
        exclude_user_id:    排除的用户 ID（用户自己的操作不通知自己）
    """
    authors = await author_crud.get_authors_by_topic(db, topic_id)

    for author in authors:
        if exclude_user_id and author.user_id == exclude_user_id:
            continue
        await notification_crud.create_notification(
            db,
            user_id=author.user_id,
            module="topic",
            ref_id=topic_id,
            notification_type=notification_type,
            message=message,
        )

    # 统一提交（所有通知一次事务）
    await db.commit()
