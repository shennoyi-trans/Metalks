# backend/db/crud/topic_like.py
"""
话题点赞 CRUD 操作
- 点赞、取消点赞
- 点赞状态查询
- 点赞统计
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from backend.db.models import TopicLike, Topic


# ============================================================
# 点赞操作
# ============================================================

async def like_topic(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> TopicLike:
    """
    点赞话题
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        创建的点赞记录
    
    注意:
        - 不检查是否已点赞（由服务层处理）
        - 不更新话题的likes_count（由服务层处理）
    """
    like = TopicLike(
        topic_id=topic_id,
        user_id=user_id
    )
    
    db.add(like)
    await db.commit()
    await db.refresh(like)
    
    return like


async def unlike_topic(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> bool:
    """
    取消点赞
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        是否取消成功
    
    注意:
        - 不更新话题的likes_count（由服务层处理）
    """
    result = await db.execute(
        select(TopicLike).where(
            and_(
                TopicLike.topic_id == topic_id,
                TopicLike.user_id == user_id
            )
        )
    )
    like = result.scalar_one_or_none()
    
    if not like:
        return False
    
    await db.delete(like)
    await db.commit()
    
    return True


async def toggle_like(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> tuple[bool, bool]:
    """
    切换点赞状态（已点赞则取消，未点赞则点赞）
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        (操作是否成功, 最终是否点赞)
    
    注意:
        - 不更新话题的likes_count（由服务层处理）
    """
    result = await db.execute(
        select(TopicLike).where(
            and_(
                TopicLike.topic_id == topic_id,
                TopicLike.user_id == user_id
            )
        )
    )
    like = result.scalar_one_or_none()
    
    if like:
        # 已点赞，取消点赞
        await db.delete(like)
        await db.commit()
        return True, False
    else:
        # 未点赞，添加点赞
        new_like = TopicLike(topic_id=topic_id, user_id=user_id)
        db.add(new_like)
        await db.commit()
        return True, True


# ============================================================
# 点赞状态查询
# ============================================================

async def has_liked(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> bool:
    """
    检查用户是否已点赞
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        是否已点赞
    """
    result = await db.execute(
        select(TopicLike).where(
            and_(
                TopicLike.topic_id == topic_id,
                TopicLike.user_id == user_id
            )
        )
    )
    like = result.scalar_one_or_none()
    
    return like is not None


async def get_user_likes(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 20
) -> List[TopicLike]:
    """
    获取用户点赞的所有话题
    
    参数:
        user_id: 用户ID
        skip: 跳过记录数
        limit: 返回记录数
    
    返回:
        点赞记录列表（按时间倒序）
    """
    result = await db.execute(
        select(TopicLike)
        .where(TopicLike.user_id == user_id)
        .order_by(TopicLike.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_topic_likers(
    db: AsyncSession,
    topic_id: int,
    skip: int = 0,
    limit: int = 20
) -> List[TopicLike]:
    """
    获取点赞该话题的所有用户
    
    参数:
        topic_id: 话题ID
        skip: 跳过记录数
        limit: 返回记录数
    
    返回:
        点赞记录列表（按时间倒序）
    """
    result = await db.execute(
        select(TopicLike)
        .where(TopicLike.topic_id == topic_id)
        .order_by(TopicLike.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


# ============================================================
# 点赞统计
# ============================================================

async def count_likes(
    db: AsyncSession,
    topic_id: int
) -> int:
    """
    统计话题的点赞数
    
    参数:
        topic_id: 话题ID
    
    返回:
        点赞数
    """
    result = await db.execute(
        select(func.count())
        .select_from(TopicLike)
        .where(TopicLike.topic_id == topic_id)
    )
    return result.scalar()


async def count_user_likes(
    db: AsyncSession,
    user_id: int
) -> int:
    """
    统计用户点赞的话题数量
    
    参数:
        user_id: 用户ID
    
    返回:
        点赞数量
    """
    result = await db.execute(
        select(func.count())
        .select_from(TopicLike)
        .where(TopicLike.user_id == user_id)
    )
    return result.scalar()


# ============================================================
# 批量查询点赞状态
# ============================================================

async def check_likes_batch(
    db: AsyncSession,
    user_id: int,
    topic_ids: List[int]
) -> dict:
    """
    批量查询用户对多个话题的点赞状态
    
    参数:
        user_id: 用户ID
        topic_ids: 话题ID列表
    
    返回:
        {topic_id: is_liked} 字典
    """
    result = await db.execute(
        select(TopicLike.topic_id)
        .where(
            and_(
                TopicLike.user_id == user_id,
                TopicLike.topic_id.in_(topic_ids)
            )
        )
    )
    liked_ids = set(result.scalars().all())
    
    return {
        topic_id: (topic_id in liked_ids)
        for topic_id in topic_ids
    }
