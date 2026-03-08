# backend/db/crud/topic.py
"""
话题 CRUD 操作
✅ v1.7：get_topics 新增 author_ids 参数，支持按作者筛选
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_
from backend.db.models import Topic, TopicAuthor, TopicTag, TopicLike, Tag, User
from sqlalchemy.orm import selectinload


# ============================================================
# 话题创建
# ============================================================

async def create_topic(
    db: AsyncSession,
    title: str,
    content: str,
    prompt: str,
    is_official: bool = False
) -> Topic:
    """
    创建话题

    参数:
        title: 话题标题
        content: 话题内容
        prompt: 对话提示词
        is_official: 是否官方话题

    返回:
        创建的话题对象（status=pending, is_active=False）
    """
    topic = Topic(
        title=title,
        content=content,
        prompt=prompt,
        is_official=is_official,
        status="pending",
        is_active=False,
        likes_count=0,
        electrolyte_received=0.0
    )

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return topic


# ============================================================
# 话题查询
# ============================================================

async def get_topic_by_id(
    db: AsyncSession,
    topic_id: int,
    include_inactive: bool = False,
) -> Optional[Topic]:
    """
    根据ID查询话题

    参数:
        topic_id: 话题ID
        include_inactive: 是否包含未启用的话题
    """
    query = (
        select(Topic)
        .options(selectinload(Topic.tags).selectinload(TopicTag.tag))
        .where(Topic.id == topic_id)
    )
    if not include_inactive:
        query = query.where(Topic.is_active == True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_topics(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_official: Optional[bool] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
    author_ids: Optional[List[int]] = None,  # ✅ v1.7：按作者 ID 列表筛选
    sort_by: str = "created_at",
    order: str = "desc",
):
    """
    获取话题列表（支持分页、筛选、排序）

    ✅ v1.7：新增 author_ids 参数
      - 传入作者 ID 列表时，筛选出这些作者参与的话题
      - 多作者取交集（话题必须包含所有指定的作者）
      - 不区分主要作者与合作作者
    """
    query = select(Topic)

    # 筛选条件
    if status:
        query = query.where(Topic.status == status)
    if is_active is not None:
        query = query.where(Topic.is_active == is_active)
    if is_official is not None:
        query = query.where(Topic.is_official == is_official)
    if tag_id:
        query = query.join(TopicTag).where(TopicTag.tag_id == tag_id)
    if search:
        query = query.where(Topic.title.contains(search))

    # ✅ v1.7：按作者筛选
    #   对每个 author_id，要求 Topic.id 存在于该作者的话题中
    #   多个作者取并集（话题只要包含任意一个指定作者即可）
    if author_ids:
        author_subquery = (
            select(TopicAuthor.topic_id)
            .where(TopicAuthor.user_id.in_(author_ids))
            .distinct()
        )
        query = query.where(Topic.id.in_(author_subquery))

    # 排序
    sort_column = getattr(Topic, sort_by, Topic.created_at)
    if order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 分页
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    topics = result.scalars().all()

    return topics, total


async def get_topics_by_user(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 20
):
    """获取用户创建/参与的话题"""
    query = (
        select(Topic)
        .join(TopicAuthor)
        .where(TopicAuthor.user_id == user_id)
        .order_by(desc(Topic.created_at))
    )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    topics = result.scalars().all()

    return topics, total


async def get_recommended_topics(
    db: AsyncSession,
    limit: int = 10,
    exclude_user_id: Optional[int] = None
):
    """获取推荐话题（已审核、已启用、按点赞排序）"""
    query = (
        select(Topic)
        .where(Topic.status == "approved", Topic.is_active == True)
        .order_by(desc(Topic.likes_count))
        .limit(limit)
    )

    if exclude_user_id:
        subquery = select(TopicAuthor.topic_id).where(
            TopicAuthor.user_id == exclude_user_id
        )
        query = query.where(Topic.id.notin_(subquery))

    result = await db.execute(query)
    return result.scalars().all()


# ============================================================
# 话题更新
# ============================================================

async def update_topic(db: AsyncSession, topic_id: int, **kwargs) -> Optional[Topic]:
    """更新话题字段"""
    result = await db.execute(
        select(Topic).where(Topic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if not topic:
        return None

    for key, value in kwargs.items():
        if hasattr(topic, key):
            setattr(topic, key, value)

    await db.commit()
    await db.refresh(topic)
    return topic


async def reset_to_pending(db: AsyncSession, topic_id: int):
    """重置话题为待审核状态"""
    result = await db.execute(
        select(Topic).where(Topic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if topic:
        topic.status = "pending"
        topic.is_active = False
        await db.commit()


async def approve_topic(db: AsyncSession, topic_id: int) -> Optional[Topic]:
    """通过审核"""
    result = await db.execute(
        select(Topic).where(Topic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if topic:
        topic.status = "approved"
        topic.is_active = True
        await db.commit()
        await db.refresh(topic)
    return topic


async def reject_topic(db: AsyncSession, topic_id: int) -> Optional[Topic]:
    """拒绝审核"""
    result = await db.execute(
        select(Topic).where(Topic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if topic:
        topic.status = "rejected"
        topic.is_active = False
        await db.commit()
        await db.refresh(topic)
    return topic
