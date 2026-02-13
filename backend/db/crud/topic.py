# backend/db/crud/topic.py
"""
话题 CRUD 操作
- 话题创建、查询、更新、删除
- 话题列表查询（支持分页、筛选、排序）
- 话题审核
- 话题统计
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
    
    注意:
        - 不检查标题重复（由调用方处理）
        - 不检查敏感词（由服务层处理）
        - 不创建作者关联（由服务层处理）
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
    include_inactive: bool = False
) -> Optional[Topic]:
    query = (
        select(Topic)
        .options(
            selectinload(Topic.tags).selectinload(TopicTag.tag)  # ✅ 预加载
        )
        .where(Topic.id == topic_id)
    )
    
    """
    根据ID查询话题
    
    参数:
        topic_id: 话题ID
        include_inactive: 是否包含未启用的话题
    
    返回:
        话题对象（如果存在）
    """
    
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
    sort_by: str = "created_at",
    order: str = "desc"
) -> tuple[List[Topic], int]:
    """
    查询话题列表（支持分页、筛选、排序）
    
    参数:
        skip: 跳过记录数（分页）
        limit: 返回记录数（分页）
        status: 筛选状态（pending/approved/rejected）
        is_active: 筛选是否启用
        is_official: 筛选是否官方话题
        tag_id: 筛选标签ID
        search: 搜索关键词（标题）
        sort_by: 排序字段（created_at/likes_count/electrolyte_received）
        order: 排序方向（asc/desc）
    
    返回:
        (话题列表, 总数)
    """
    # 构建查询
    query = select(Topic)
    count_query = select(func.count()).select_from(Topic)
    
    # 筛选条件
    conditions = []
    
    if status:
        conditions.append(Topic.status == status)
    
    if is_active is not None:
        conditions.append(Topic.is_active == is_active)
    
    if is_official is not None:
        conditions.append(Topic.is_official == is_official)
    
    if search:
        conditions.append(Topic.title.like(f"%{search}%"))
    
    # 标签筛选（需要JOIN）
    if tag_id:
        query = query.join(TopicTag).where(TopicTag.tag_id == tag_id)
        count_query = count_query.join(TopicTag).where(TopicTag.tag_id == tag_id)
    
    # 应用筛选条件
    if conditions:
        query = query.where(and_(*conditions))
        count_query = count_query.where(and_(*conditions))
    
    # 排序
    if sort_by == "likes_count":
        order_col = Topic.likes_count
    elif sort_by == "electrolyte_received":
        order_col = Topic.electrolyte_received
    else:  # created_at
        order_col = Topic.created_at
    
    if order == "desc":
        query = query.order_by(desc(order_col))
    else:
        query = query.order_by(order_col)
    
    # 分页
    query = query.offset(skip).limit(limit)
    
    # 执行查询
    result = await db.execute(query)
    topics = list(result.scalars().all())
    
    # 统计总数
    result = await db.execute(count_query)
    total = result.scalar()
    
    return topics, total


async def get_topics_by_user(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 20
) -> tuple[List[Topic], int]:
    """
    查询用户创建/参与的话题
    
    参数:
        user_id: 用户ID
        skip: 跳过记录数
        limit: 返回记录数
    
    返回:
        (话题列表, 总数)
    """
    # 查询用户作为作者的话题
    query = (
        select(Topic)
        .join(TopicAuthor)
        .where(TopicAuthor.user_id == user_id)
        .order_by(desc(Topic.created_at))
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    topics = list(result.scalars().all())
    
    # 统计总数
    count_query = (
        select(func.count())
        .select_from(Topic)
        .join(TopicAuthor)
        .where(TopicAuthor.user_id == user_id)
    )
    
    result = await db.execute(count_query)
    total = result.scalar()
    
    return topics, total


# ============================================================
# 话题更新
# ============================================================

async def update_topic(
    db: AsyncSession,
    topic_id: int,
    **kwargs
) -> Optional[Topic]:
    """
    更新话题信息
    
    参数:
        topic_id: 话题ID
        **kwargs: 要更新的字段
    
    返回:
        更新后的话题对象
    
    注意:
        - 允许更新的字段：title, content, prompt, is_official
        - 编辑后status会变为pending（由调用方处理）
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    # 只允许更新特定字段
    allowed_fields = ['title', 'content', 'prompt', 'is_official']
    
    for key, value in kwargs.items():
        if key in allowed_fields and value is not None:
            setattr(topic, key, value)
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


# ============================================================
# 话题审核
# ============================================================

async def approve_topic(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    审核通过话题
    
    返回:
        更新后的话题对象
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.status = "approved"
    topic.is_active = True
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


async def reject_topic(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    审核拒绝话题
    
    返回:
        更新后的话题对象
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.status = "rejected"
    topic.is_active = False
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


async def reset_to_pending(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    重置为待审核状态（编辑后使用）
    
    返回:
        更新后的话题对象
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.status = "pending"
    topic.is_active = False
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


# ============================================================
# 话题下架/启用
# ============================================================

async def deactivate_topic(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    下架话题（软删除）
    
    返回:
        更新后的话题对象
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.is_active = False
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


async def activate_topic(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    启用话题
    
    返回:
        更新后的话题对象
    
    注意:
        - 只有status=approved的话题才能启用
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    if topic.status != "approved":
        return None  # 未审核通过，不能启用
    
    topic.is_active = True
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


# ============================================================
# 话题删除（硬删除）
# ============================================================

async def delete_topic(
    db: AsyncSession,
    topic_id: int
) -> bool:
    """
    硬删除话题（永久删除）
    
    返回:
        是否删除成功
    
    注意:
        - 会级联删除关联数据（authors, tags, likes）
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return False
    
    await db.delete(topic)
    await db.commit()
    
    return True


# ============================================================
# 话题统计更新
# ============================================================

async def increment_likes(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    增加点赞数
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.likes_count += 1
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


async def decrement_likes(
    db: AsyncSession,
    topic_id: int
) -> Optional[Topic]:
    """
    减少点赞数
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    if topic.likes_count > 0:
        topic.likes_count -= 1
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


async def add_electrolyte(
    db: AsyncSession,
    topic_id: int,
    amount: float
) -> Optional[Topic]:
    """
    增加收到的电解液
    """
    topic = await get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return None
    
    topic.electrolyte_received += amount
    
    await db.commit()
    await db.refresh(topic)
    
    return topic


# ============================================================
# 话题推荐算法
# ============================================================

async def get_recommended_topics(
    db: AsyncSession,
    limit: int = 10,
    exclude_user_id: Optional[int] = None
) -> List[Topic]:
    """
    获取推荐话题（综合算法）
    
    参数:
        limit: 返回数量
        exclude_user_id: 排除该用户创建的话题
    
    算法:
        - 只返回 approved 且 active 的话题
        - 优先级：官方话题 > 点赞数 > 最新
    
    返回:
        推荐话题列表
    """
    query = (
        select(Topic)
        .where(
            and_(
                Topic.status == "approved",
                Topic.is_active == True
            )
        )
        .order_by(
            desc(Topic.is_official),
            desc(Topic.likes_count),
            desc(Topic.created_at)
        )
        .limit(limit)
    )
    
    # 排除用户自己的话题
    if exclude_user_id:
        query = query.where(
            ~Topic.id.in_(
                select(TopicAuthor.topic_id).where(
                    TopicAuthor.user_id == exclude_user_id
                )
            )
        )
    
    result = await db.execute(query)
    return list(result.scalars().all())
