# backend/db/crud/topic_author.py
"""
话题作者关联 CRUD 操作
- 作者添加、查询、更新、删除
- 权重管理
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from backend.db.models import TopicAuthor, User


# ============================================================
# 作者添加
# ============================================================

async def add_author(
    db: AsyncSession,
    topic_id: int,
    user_id: int,
    is_primary: bool = False,
    electrolyte_share: float = 0.0
) -> TopicAuthor:
    """
    添加话题作者
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
        is_primary: 是否为主要作者
        electrolyte_share: 电解液分配比例（0-100）
    
    返回:
        创建的作者关联对象
    
    注意:
        - 不检查权重总和（由服务层处理）
        - 不检查是否已存在（由服务层处理）
    """
    author = TopicAuthor(
        topic_id=topic_id,
        user_id=user_id,
        is_primary=is_primary,
        electrolyte_share=electrolyte_share
    )
    
    db.add(author)
    await db.commit()
    await db.refresh(author)
    
    return author


# ============================================================
# 作者查询
# ============================================================

async def get_author_by_id(
    db: AsyncSession,
    author_id: int
) -> Optional[TopicAuthor]:
    """根据ID查询作者关联"""
    result = await db.execute(
        select(TopicAuthor).where(TopicAuthor.id == author_id)
    )
    return result.scalar_one_or_none()


async def get_author(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> Optional[TopicAuthor]:
    """
    查询指定话题的指定用户的作者关联
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        作者关联对象（如果存在）
    """
    result = await db.execute(
        select(TopicAuthor).where(
            and_(
                TopicAuthor.topic_id == topic_id,
                TopicAuthor.user_id == user_id
            )
        )
    )
    return result.scalar_one_or_none()


async def get_primary_author(
    db: AsyncSession,
    topic_id: int
) -> Optional[TopicAuthor]:
    """
    获取主要作者
    
    参数:
        topic_id: 话题ID
    
    返回:
        主要作者关联对象
    """
    result = await db.execute(
        select(TopicAuthor).where(
            and_(
                TopicAuthor.topic_id == topic_id,
                TopicAuthor.is_primary == True
            )
        )
    )
    return result.scalar_one_or_none()


async def get_authors_by_topic(
    db: AsyncSession,
    topic_id: int
) -> List[TopicAuthor]:
    """
    获取话题的所有作者
    
    参数:
        topic_id: 话题ID
    
    返回:
        作者关联列表（主要作者排在前面）
    """
    result = await db.execute(
        select(TopicAuthor)
        .where(TopicAuthor.topic_id == topic_id)
        .order_by(TopicAuthor.is_primary.desc())
    )
    return list(result.scalars().all())


async def get_topics_by_author(
    db: AsyncSession,
    user_id: int
) -> List[TopicAuthor]:
    """
    获取用户参与的所有话题
    
    参数:
        user_id: 用户ID
    
    返回:
        作者关联列表
    """
    result = await db.execute(
        select(TopicAuthor)
        .where(TopicAuthor.user_id == user_id)
        .order_by(TopicAuthor.created_at.desc())
    )
    return list(result.scalars().all())


# ============================================================
# 作者权限检查
# ============================================================

async def is_author(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> bool:
    """
    检查用户是否为话题作者（主要作者或共同作者）
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        是否为作者
    """
    author = await get_author(db, topic_id, user_id)
    return author is not None


async def is_primary_author(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> bool:
    """
    检查用户是否为主要作者
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        是否为主要作者
    """
    primary = await get_primary_author(db, topic_id)
    return primary is not None and primary.user_id == user_id


# ============================================================
# 作者更新
# ============================================================

async def update_author_share(
    db: AsyncSession,
    author_id: int,
    new_share: float
) -> Optional[TopicAuthor]:
    """
    更新作者的电解液分配比例
    
    参数:
        author_id: 作者关联ID
        new_share: 新的分配比例（0-100）
    
    返回:
        更新后的作者关联对象
    """
    author = await get_author_by_id(db, author_id)
    if not author:
        return None
    
    author.electrolyte_share = new_share
    
    await db.commit()
    await db.refresh(author)
    
    return author


async def update_shares_batch(
    db: AsyncSession,
    shares: List[dict]
) -> bool:
    """
    批量更新多个作者的分配比例
    
    参数:
        shares: [{"author_id": 1, "share": 50}, ...]
    
    返回:
        是否更新成功
    """
    for item in shares:
        author_id = item.get("author_id")
        share = item.get("share")
        
        if author_id and share is not None:
            author = await get_author_by_id(db, author_id)
            if author:
                author.electrolyte_share = share
    
    await db.commit()
    return True


# ============================================================
# 作者删除
# ============================================================

async def remove_author(
    db: AsyncSession,
    author_id: int
) -> bool:
    """
    移除作者
    
    返回:
        是否删除成功
    
    注意:
        - 不允许删除主要作者（由服务层检查）
    """
    author = await get_author_by_id(db, author_id)
    if not author:
        return False
    
    await db.delete(author)
    await db.commit()
    
    return True


async def remove_author_by_user(
    db: AsyncSession,
    topic_id: int,
    user_id: int
) -> bool:
    """
    移除指定用户的作者身份
    
    参数:
        topic_id: 话题ID
        user_id: 用户ID
    
    返回:
        是否删除成功
    """
    author = await get_author(db, topic_id, user_id)
    if not author:
        return False
    
    await db.delete(author)
    await db.commit()
    
    return True


# ============================================================
# 权重计算
# ============================================================

async def calculate_total_share(
    db: AsyncSession,
    topic_id: int,
    exclude_author_id: Optional[int] = None
) -> float:
    """
    计算话题所有作者的权重总和
    
    参数:
        topic_id: 话题ID
        exclude_author_id: 排除的作者ID（可选）
    
    返回:
        权重总和
    """
    authors = await get_authors_by_topic(db, topic_id)
    
    total = 0.0
    for author in authors:
        if exclude_author_id and author.id == exclude_author_id:
            continue
        total += author.electrolyte_share
    
    return total
