# backend/services/topic_service.py
"""
话题服务层 - 完整业务逻辑
- 话题创建（含作者、标签、权重验证）
- 话题编辑（含审核状态重置）
- 话题审核
- 话题查询（含推荐算法）
- 点赞/取消点赞
- 电解液投喂（含分配）
- 话题下架/删除
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

# CRUD imports
from backend.db.crud import topic as topic_crud
from backend.db.crud import tag as tag_crud
from backend.db.crud import topic_author as author_crud
from backend.db.crud import topic_like as like_crud
from backend.db.crud import electrolyte as electrolyte_crud

# 其他imports
from backend.utils.sensitive_words import check_sensitive_word


# ============================================================
# 话题创建
# ============================================================

async def create_topic(
    db: AsyncSession,
    user_id: int,
    title: str,
    content: str,
    prompt: str,
    tag_ids: List[int],
    coauthors: List[dict] = None,
    is_official: bool = False
) -> dict:
    """
    创建话题（完整流程）
    
    参数:
        user_id: 创建者ID
        title: 话题标题
        content: 话题内容
        prompt: 对话提示词
        tag_ids: 标签ID列表
        coauthors: 共同作者列表 [{"user_id": 10, "share": 30}, ...]
        is_official: 是否官方话题
    
    返回:
        {
            "success": bool,
            "message": str,
            "topic": {...} 或 None
        }
    
    流程:
        1. 验证字段非空
        2. 验证标签是否存在
        3. 验证共同作者权重总和 ≤ 100
        4. 检查敏感词
        5. 创建话题
        6. 创建主要作者关联
        7. 创建共同作者关联
        8. 创建标签关联
    """
    if not title or not content or not prompt:
        return {
            "success": False,
            "message": "标题、内容和提示词不能为空",
            "topic": None
        }
    
    # 验证标签存在
    tags = await tag_crud.get_tags_by_ids(db, tag_ids)
    if len(tags) != len(tag_ids):
        return {
            "success": False,
            "message": "部分标签不存在",
            "topic": None
        }
    
    # 验证共同作者权重
    if coauthors is None:
        coauthors = []
    
    coauthor_total_share = sum(c.get("share", 0) for c in coauthors)
    
    if coauthor_total_share > 100:
        return {
            "success": False,
            "message": "共同作者权重总和不能超过100%",
            "topic": None
        }
    
    primary_share = 100 - coauthor_total_share
    
    if primary_share < 0:
        return {
            "success": False,
            "message": "主要作者权重不能为负",
            "topic": None
        }
    
    # 检查敏感词
    combined_text = f"{title} {content} {prompt}"
    is_sensitive, matched_word = await check_sensitive_word(db, combined_text)
    
    if is_sensitive:
        return {
            "success": False,
            "message": f"内容包含敏感词：{matched_word}",
            "topic": None
        }
    
    # 创建话题
    topic = await topic_crud.create_topic(
        db,
        title=title,
        content=content,
        prompt=prompt,
        is_official=is_official
    )
    
    # 创建主要作者关联
    await author_crud.add_author(
        db,
        topic_id=topic.id,
        user_id=user_id,
        is_primary=True,
        electrolyte_share=primary_share
    )
    
    # 创建共同作者关联
    for coauthor in coauthors:
        coauthor_user_id = coauthor.get("user_id")
        coauthor_share = coauthor.get("share", 0)
        
        if coauthor_user_id and coauthor_share > 0:
            await author_crud.add_author(
                db,
                topic_id=topic.id,
                user_id=coauthor_user_id,
                is_primary=False,
                electrolyte_share=coauthor_share
            )
    
    # 创建标签关联
    from backend.db.models import TopicTag
    for tag_id in tag_ids:
        topic_tag = TopicTag(topic_id=topic.id, tag_id=tag_id)
        db.add(topic_tag)
    
    await db.commit()
    
    return {
        "success": True,
        "message": "话题创建成功，等待审核",
        "topic": {
            "id": topic.id,
            "title": topic.title,
            "status": topic.status,
            "is_active": topic.is_active,
            "created_at": topic.created_at.isoformat()
        }
    }


# ============================================================
# 话题编辑
# ============================================================

async def update_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int,
    title: Optional[str] = None,
    content: Optional[str] = None,
    prompt: Optional[str] = None,
    tag_ids: Optional[List[int]] = None
) -> dict:
    """
    编辑话题
    
    参数:
        user_id: 编辑者ID
        topic_id: 话题ID
        title: 新标题（可选）
        content: 新内容（可选）
        prompt: 新提示词（可选）
        tag_ids: 新标签列表（可选）
    
    返回:
        {
            "success": bool,
            "message": str,
            "topic": {...} 或 None
        }
    
    说明:
        - 只有作者可以编辑
        - 编辑后status变为pending（需要重新审核）
    """
    # 检查权限
    is_author = await author_crud.is_author(db, topic_id, user_id)
    if not is_author:
        return {
            "success": False,
            "message": "您不是该话题的作者",
            "topic": None
        }
    
    # 验证标签（如果提供）
    if tag_ids is not None:
        tags = await tag_crud.get_tags_by_ids(db, tag_ids)
        if len(tags) != len(tag_ids):
            return {
                "success": False,
                "message": "部分标签不存在",
                "topic": None
            }
    
    # 检查敏感词
    if title or content or prompt:
        combined_text = " ".join(filter(None, [title, content, prompt]))
        is_sensitive, matched_word = await check_sensitive_word(db, combined_text)
        
        if is_sensitive:
            return {
                "success": False,
                "message": f"内容包含敏感词：{matched_word}",
                "topic": None
            }
    
    # 更新话题基本信息
    update_data = {}
    if title:
        update_data["title"] = title
    if content:
        update_data["content"] = content
    if prompt:
        update_data["prompt"] = prompt
    
    if update_data:
        topic = await topic_crud.update_topic(db, topic_id, **update_data)
        
        # 重置为pending状态
        await topic_crud.reset_to_pending(db, topic_id)
    else:
        topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=True)
    
    # 更新标签（如果提供）
    if tag_ids is not None:
        # 删除旧标签关联
        from backend.db.models import TopicTag
        from sqlalchemy import delete
        await db.execute(
            delete(TopicTag).where(TopicTag.topic_id == topic_id)
        )
        
        # 创建新标签关联
        for tag_id in tag_ids:
            topic_tag = TopicTag(topic_id=topic_id, tag_id=tag_id)
            db.add(topic_tag)
        
        await db.commit()
    
    return {
        "success": True,
        "message": "话题已更新，等待重新审核",
        "topic": {
            "id": topic.id,
            "title": topic.title,
            "status": topic.status,
            "is_active": topic.is_active
        }
    }


# ============================================================
# 话题审核
# ============================================================

async def review_topic(
    db: AsyncSession,
    topic_id: int,
    action: str
) -> dict:
    """
    审核话题
    
    参数:
        topic_id: 话题ID
        action: 审核动作（"approve" 或 "reject"）
    
    返回:
        {
            "success": bool,
            "message": str,
            "topic": {...}
        }
    """
    if action == "approve":
        topic = await topic_crud.approve_topic(db, topic_id)
        message = "话题已通过审核"
    elif action == "reject":
        topic = await topic_crud.reject_topic(db, topic_id)
        message = "话题已拒绝"
    else:
        return {
            "success": False,
            "message": "无效的审核动作",
            "topic": None
        }
    
    if not topic:
        return {
            "success": False,
            "message": "话题不存在",
            "topic": None
        }
    
    return {
        "success": True,
        "message": message,
        "topic": {
            "id": topic.id,
            "title": topic.title,
            "status": topic.status,
            "is_active": topic.is_active
        }
    }


# ============================================================
# 话题查询（含详情）
# ============================================================

async def get_topic_detail(
    db: AsyncSession,
    topic_id: int,
    user_id: Optional[int] = None
) -> Optional[dict]:
    """
    获取话题详情
    
    参数:
        topic_id: 话题ID
        user_id: 当前用户ID（用于查询点赞状态）
    
    返回:
        话题详情字典（包含作者、标签、点赞状态）
    """
    topic = await topic_crud.get_topic_by_id(db, topic_id)
    if not topic:
        return None
    
    # 获取作者列表
    authors = await author_crud.get_authors_by_topic(db, topic_id)
    
    # 获取标签列表
    from backend.db.models import TopicTag
    from sqlalchemy import select
    result = await db.execute(
        select(TopicTag).where(TopicTag.topic_id == topic_id)
    )
    topic_tags = result.scalars().all()
    
    tag_list = []
    for tt in topic_tags:
        tag = await tag_crud.get_tag_by_id(db, tt.tag_id)
        if tag:
            tag_list.append({
                "id": tag.id,
                "name": tag.name,
                "slug": tag.slug
            })
    
    # 检查点赞状态
    has_liked = False
    if user_id:
        has_liked = await like_crud.has_liked(db, topic_id, user_id)
    
    # 组装返回数据
    author_list = []
    for author in authors:
        from backend.db.crud import user as user_crud
        user = await user_crud.get_user_by_id(db, author.user_id)
        if user:
            author_list.append({
                "user_id": user.id,
                "nickname": user.nickname,
                "is_primary": author.is_primary,
                "electrolyte_share": author.electrolyte_share
            })
    
    return {
        "id": topic.id,
        "title": topic.title,
        "content": topic.content,
        "prompt": topic.prompt,
        "likes_count": topic.likes_count,
        "electrolyte_received": topic.electrolyte_received,
        "status": topic.status,
        "is_active": topic.is_active,
        "is_official": topic.is_official,
        "created_at": topic.created_at.isoformat(),
        "updated_at": topic.updated_at.isoformat(),
        "authors": author_list,
        "tags": tag_list,
        "has_liked": has_liked
    }


# ============================================================
# 点赞/取消点赞
# ============================================================

async def toggle_like(
    db: AsyncSession,
    user_id: int,
    topic_id: int
) -> dict:
    """
    切换点赞状态
    
    参数:
        user_id: 用户ID
        topic_id: 话题ID
    
    返回:
        {
            "success": bool,
            "liked": bool,           # 最终是否点赞
            "likes_count": int       # 更新后的点赞数
        }
    """
    # 切换点赞状态
    success, liked = await like_crud.toggle_like(db, topic_id, user_id)
    
    if not success:
        return {
            "success": False,
            "liked": False,
            "likes_count": 0
        }
    
    # 更新话题的点赞数
    if liked:
        topic = await topic_crud.increment_likes(db, topic_id)
    else:
        topic = await topic_crud.decrement_likes(db, topic_id)
    
    return {
        "success": True,
        "liked": liked,
        "likes_count": topic.likes_count if topic else 0
    }


# ============================================================
# 电解液投喂
# ============================================================

async def donate_electrolyte(
    db: AsyncSession,
    user_id: int,
    topic_id: int,
    amount: float
) -> dict:
    """
    投喂电解液给话题
    
    参数:
        user_id: 投喂者ID
        topic_id: 话题ID
        amount: 投喂数量
    
    返回:
        {
            "success": bool,
            "message": str,
            "electrolyte_received": float,  # 话题总收入
            "user_balance": float,          # 用户剩余余额
            "distribution": [...]           # 分配详情
        }
    
    流程:
        1. 检查用户余额
        2. 扣除用户电解液
        3. 增加话题总收入
        4. 按权重分配给所有作者
    """
    if amount <= 0:
        return {
            "success": False,
            "message": "投喂数量必须大于0",
            "electrolyte_received": 0.0,
            "user_balance": 0.0,
            "distribution": []
        }
    
    # 检查并扣除用户电解液
    success, msg, user_balance = await electrolyte_crud.deduct_electrolyte(
        db, user_id, amount, reason="donate_to_topic"
    )
    
    if not success:
        return {
            "success": False,
            "message": msg,  # "电解液不足"
            "electrolyte_received": 0.0,
            "user_balance": user_balance,
            "distribution": []
        }
    
    # 增加话题总收入
    topic = await topic_crud.add_electrolyte(db, topic_id, amount)
    
    # 按权重分配给所有作者
    authors = await author_crud.get_authors_by_topic(db, topic_id)
    
    distribution = []
    for author in authors:
        author_amount = amount * (author.electrolyte_share / 100.0)
        
        # 增加作者电解液
        await electrolyte_crud.add_electrolyte(
            db, author.user_id, author_amount, reason="topic_donation"
        )
        
        # 获取作者昵称
        from backend.db.crud import user as user_crud
        user = await user_crud.get_user_by_id(db, author.user_id)
        
        distribution.append({
            "user_id": author.user_id,
            "nickname": user.nickname if user else "未知",
            "amount": author_amount
        })
    
    return {
        "success": True,
        "message": f"成功投喂 {amount} 电解液",
        "electrolyte_received": topic.electrolyte_received,
        "user_balance": user_balance,
        "distribution": distribution
    }


# ============================================================
# 话题下架/删除
# ============================================================

async def deactivate_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int
) -> dict:
    """
    下架话题（软删除）
    
    参数:
        user_id: 操作者ID
        topic_id: 话题ID
    
    返回:
        {
            "success": bool,
            "message": str
        }
    """
    # 检查权限（只有主要作者可以下架）
    is_primary = await author_crud.is_primary_author(db, topic_id, user_id)
    if not is_primary:
        return {
            "success": False,
            "message": "只有主要作者可以下架话题"
        }
    
    topic = await topic_crud.deactivate_topic(db, topic_id)
    
    if not topic:
        return {
            "success": False,
            "message": "话题不存在"
        }
    
    return {
        "success": True,
        "message": "话题已下架"
    }


async def delete_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int
) -> dict:
    """
    硬删除话题（永久删除）
    
    参数:
        user_id: 操作者ID
        topic_id: 话题ID
    
    返回:
        {
            "success": bool,
            "message": str
        }
    """
    # 检查权限（只有主要作者可以删除）
    is_primary = await author_crud.is_primary_author(db, topic_id, user_id)
    if not is_primary:
        return {
            "success": False,
            "message": "只有主要作者可以删除话题"
        }
    
    success = await topic_crud.delete_topic(db, topic_id)
    
    if not success:
        return {
            "success": False,
            "message": "话题不存在"
        }
    
    return {
        "success": True,
        "message": "话题已永久删除"
    }


# ============================================================
# 推荐话题
# ============================================================

async def get_recommended_topics(
    db: AsyncSession,
    limit: int = 10,
    user_id: Optional[int] = None
) -> List[dict]:
    """
    获取推荐话题
    
    参数:
        limit: 返回数量
        user_id: 当前用户ID（排除自己创建的话题）
    
    返回:
        推荐话题列表
    """
    topics = await topic_crud.get_recommended_topics(
        db, limit=limit, exclude_user_id=user_id
    )
    
    result = []
    for topic in topics:
        # 获取标签
        from backend.db.models import TopicTag
        from sqlalchemy import select
        tag_result = await db.execute(
            select(TopicTag).where(TopicTag.topic_id == topic.id)
        )
        topic_tags = tag_result.scalars().all()
        
        tags = []
        for tt in topic_tags:
            tag = await tag_crud.get_tag_by_id(db, tt.tag_id)
            if tag:
                tags.append(tag.name)
        
        result.append({
            "id": topic.id,
            "title": topic.title,
            "is_official": topic.is_official,
            "likes_count": topic.likes_count,
            "tags": tags
        })
    
    return result
