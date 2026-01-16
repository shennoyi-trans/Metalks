# backend/db/crud/tag.py
"""
标签 CRUD 操作
- 标签创建、查询、更新、删除
- 标签统计
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from backend.db.models import Tag, TopicTag


# ============================================================
# 标签创建
# ============================================================

async def create_tag(
    db: AsyncSession,
    name: str,
    slug: str,
    description: Optional[str] = None
) -> Tag:
    """
    创建标签
    
    参数:
        name: 标签名称（如：情感）
        slug: URL友好名称（如：emotion）
        description: 标签描述
    
    返回:
        创建的标签对象
    """
    tag = Tag(
        name=name,
        slug=slug,
        description=description
    )
    
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    
    return tag


# ============================================================
# 标签查询
# ============================================================

async def get_tag_by_id(
    db: AsyncSession,
    tag_id: int
) -> Optional[Tag]:
    """根据ID查询标签"""
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id)
    )
    return result.scalar_one_or_none()


async def get_tag_by_slug(
    db: AsyncSession,
    slug: str
) -> Optional[Tag]:
    """根据slug查询标签"""
    result = await db.execute(
        select(Tag).where(Tag.slug == slug)
    )
    return result.scalar_one_or_none()


async def get_tag_by_name(
    db: AsyncSession,
    name: str
) -> Optional[Tag]:
    """根据名称查询标签"""
    result = await db.execute(
        select(Tag).where(Tag.name == name)
    )
    return result.scalar_one_or_none()


async def get_all_tags(
    db: AsyncSession
) -> List[Tag]:
    """
    获取所有标签
    
    返回:
        标签列表（按创建时间排序）
    """
    result = await db.execute(
        select(Tag).order_by(Tag.created_at.asc())
    )
    return list(result.scalars().all())


async def get_tags_by_ids(
    db: AsyncSession,
    tag_ids: List[int]
) -> List[Tag]:
    """
    根据ID列表批量查询标签
    
    参数:
        tag_ids: 标签ID列表
    
    返回:
        标签列表
    """
    result = await db.execute(
        select(Tag).where(Tag.id.in_(tag_ids))
    )
    return list(result.scalars().all())


# ============================================================
# 标签更新
# ============================================================

async def update_tag(
    db: AsyncSession,
    tag_id: int,
    **kwargs
) -> Optional[Tag]:
    """
    更新标签信息
    
    参数:
        tag_id: 标签ID
        **kwargs: 要更新的字段（name, slug, description）
    
    返回:
        更新后的标签对象
    """
    tag = await get_tag_by_id(db, tag_id)
    if not tag:
        return None
    
    allowed_fields = ['name', 'slug', 'description']
    
    for key, value in kwargs.items():
        if key in allowed_fields and value is not None:
            setattr(tag, key, value)
    
    await db.commit()
    await db.refresh(tag)
    
    return tag


# ============================================================
# 标签删除
# ============================================================

async def delete_tag(
    db: AsyncSession,
    tag_id: int
) -> bool:
    """
    删除标签
    
    返回:
        是否删除成功
    
    注意:
        - 会级联删除关联的topic_tags记录
    """
    tag = await get_tag_by_id(db, tag_id)
    if not tag:
        return False
    
    await db.delete(tag)
    await db.commit()
    
    return True


# ============================================================
# 标签统计
# ============================================================

async def count_topics_by_tag(
    db: AsyncSession,
    tag_id: int
) -> int:
    """
    统计使用该标签的话题数量
    
    参数:
        tag_id: 标签ID
    
    返回:
        话题数量
    """
    result = await db.execute(
        select(func.count())
        .select_from(TopicTag)
        .where(TopicTag.tag_id == tag_id)
    )
    return result.scalar()
