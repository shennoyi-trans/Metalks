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

from typing import List, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from backend.db.crud import topic as topic_crud
from backend.db.crud import tag as tag_crud
from backend.db.crud import topic_author as author_crud
from backend.db.crud import topic_like as like_crud
from backend.db.crud import electrolyte as electrolyte_crud
from backend.db.crud import user as user_crud
from backend.db.models import Topic, TopicTag, User, Tag
from backend.utils.sensitive_words import check_sensitive_word
from backend.services import notification_service


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
    coauthors: Optional[List[dict]] = None,
    is_official: bool = False
) -> dict:
    """
    创建话题（完整流程）

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

    if not topic:
        return {
            "success": False,
            "message": "话题不存在",
            "topic": None
        }

    if tag_ids is not None:
        await db.execute(delete(TopicTag).where(TopicTag.topic_id == topic_id))
        for tag_id in tag_ids:
            db.add(TopicTag(topic_id=topic_id, tag_id=tag_id))
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
    """审核话题（通过/拒绝后向所有作者写入通知）"""
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

    # 向话题所有作者写入通知
    ntype = "approved" if action == "approve" else "rejected"
    nlabel = "已通过审核" if action == "approve" else "未通过审核"
    await notification_service.notify_topic_authors(
        db, topic_id,
        notification_type=ntype,
        message=nlabel,
    )

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
    user_id: Optional[int] = None,
    include_inactive: bool = False
) -> Optional[dict]:
    """
    获取话题详情

    参数:
        include_inactive: 管理员审核时传 True，允许查看未激活话题
    """
    topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=include_inactive)
    if not topic:
        return None

    authors = await author_crud.get_authors_by_topic(db, topic_id)

    # ✅ 利用 selectinload 预加载的标签（替代逐个查询）
    tag_list = []
    if hasattr(topic, 'tags') and topic.tags:
        for tt in topic.tags:
            if tt.tag:
                tag_list.append({
                    "id": tt.tag.id,
                    "name": tt.tag.name,
                    "slug": tt.tag.slug,
                })
    else:
        # 兜底：如果预加载未生效
        result = await db.execute(
            select(TopicTag).where(TopicTag.topic_id == topic_id)
        )
        for tt in result.scalars().all():
            tag = await tag_crud.get_tag_by_id(db, tt.tag_id)
            if tag:
                tag_list.append({"id": tag.id, "name": tag.name, "slug": tag.slug})

    # ✅ 作者查询：批量 WHERE IN（替代原来逐个 get_user_by_id 的 N+1）
    author_user_ids = [a.user_id for a in authors]
    author_list = []
    if author_user_ids:
        user_result = await db.execute(
            select(User).where(User.id.in_(author_user_ids))
        )
        user_map = {u.id: u for u in user_result.scalars().all()}

        for author in authors:
            user = user_map.get(author.user_id)
            if user:
                author_list.append({
                    "user_id": user.id,
                    "nickname": user.nickname,
                    "is_primary": author.is_primary,
                    "electrolyte_share": author.electrolyte_share,
                })

    has_liked = await like_crud.has_liked(db, topic_id, user_id) if user_id else False

    return {
        "id": topic.id,
        "title": topic.title,
        "content": topic.content,
        "prompt": topic.prompt,
        "likes_count": topic.likes_count,
        "electrolyte_received": topic.electrolyte_received,
        "usage_count": topic.usage_count or 0,
        "status": topic.status,
        "is_active": topic.is_active,
        "is_official": topic.is_official,
        "created_at": topic.created_at.isoformat(),
        "updated_at": topic.updated_at.isoformat(),
        "authors": author_list,
        "tags": tag_list,
        "has_liked": has_liked,
    }


# ============================================================
# 点赞/取消点赞
# ============================================================

async def toggle_like(
    db: AsyncSession,
    user_id: int,
    topic_id: int
) -> dict:
    """切换点赞状态"""
    success, liked = await like_crud.toggle_like(db, topic_id, user_id)

    if not success:
        return {
            "success": False,
            "liked": False,
            "likes_count": 0
        }

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
    """投喂电解液给话题"""
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
            "message": msg,
            "electrolyte_received": 0.0,
            "user_balance": user_balance,
            "distribution": []
        }

    # 增加话题总收入
    # 检查是否为自我投喂
    authors = await author_crud.get_authors_by_topic(db, topic_id)
    author_ids = [a.user_id for a in authors]
    is_self_donation = (user_id in author_ids)

    # 非自我投喂才计入话题收入
    if not is_self_donation:
        topic = await topic_crud.add_electrolyte(db, topic_id, amount)
    else:
        result = await db.execute(select(Topic).where(Topic.id == topic_id))
        topic = result.scalar_one_or_none()
        
    if topic is None:
        return {
            "success": False,
            "message": "话题不存在",
            "electrolyte_received": 0.0,
            "user_balance": user_balance,
            "distribution": []
        }
    # 按权重分配给所有作者
    authors = await author_crud.get_authors_by_topic(db, topic_id)

    distribution = []
    for author in authors:
        author_amount = amount * (author.electrolyte_share / 100.0)

        await electrolyte_crud.add_electrolyte(
            db, author.user_id, author_amount, reason="topic_donation"
        )


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
        "self_donation": is_self_donation,
        "distribution": distribution
    }


# ============================================================
# 话题下架/删除
# ============================================================

async def deactivate_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int,
    is_admin: bool = False
) -> dict:
    """
    下架话题（软删除）

    权限：
        - 主要作者可直接下架
        - 管理员可下架任意话题（向所有作者写入通知，排除管理员自己）

    事务：统一在本函数末尾 commit
    """
    if not is_admin:
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
    # 标记关联 session 不可用
    from backend.db.crud import session as session_crud
    await session_crud.mark_topic_unavailable(
        db, topic_id, reason="该话题已被下架，无法继续使用"
    )

    # 管理员下架 → 通知所有作者（排除管理员自己）
    # notify_topic_authors 末尾 commit 会一并提交下架操作
    if is_admin:
        await notification_service.notify_topic_authors(
            db, topic_id,
            notification_type="deactivated",
            message="已被管理员下架",
            exclude_user_id=user_id,
        )
    else:
        # 主要作者自行下架，无需通知，手动 commit
        await db.commit()

    return {
        "success": True,
        "message": "话题已下架"
    }

# ============================================================
# 删除话题（硬删除）
# ============================================================

async def delete_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int
) -> dict:

    """
    硬删除话题（永久删除）

    流程：
        1. 权限检查（仅主要作者）
        2. 清除删除者自己关于该话题的通知
        3. 删除话题（级联清理 authors / tags / likes）
        4. 统一 commit
    """
    from backend.db.crud import notification as notification_crud

    is_primary = await author_crud.is_primary_author(db, topic_id, user_id)
    if not is_primary:
        return {
            "success": False,
            "message": "只有主要作者可以删除话题"
        }

    # 清除删除者自己关于该话题的通知
    await notification_crud.delete_by_ref(db, user_id, module="topic", ref_id=topic_id)

    # 标记关联 session 不可用（硬删除不可恢复）
    from backend.db.crud import session as session_crud
    await session_crud.mark_topic_unavailable(
        db, topic_id, reason="该话题已被删除，无法继续使用"
    )
    success = await topic_crud.delete_topic(db, topic_id)

    if not success:
        return {
            "success": False,
            "message": "话题不存在"
        }

    await db.commit()

    return {
        "success": True,
        "message": "话题已永久删除"
    }
    
# ============================================================
# 重新上架话题
# ============================================================

async def reactivate_topic(
    db: AsyncSession,
    user_id: int,
    topic_id: int,
    is_admin: bool = False,
) -> dict:
    """重新上架话题"""
    if not is_admin:
        is_primary = await author_crud.is_primary_author(db, topic_id, user_id)
        if not is_primary:
            return {"success": False, "message": "只有主要作者可以重新上架话题"}

    topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic:
        return {"success": False, "message": "话题不存在"}

    if topic.is_active:
        return {"success": False, "message": "话题已处于上架状态"}

    topic.is_active = True

    # 清除关联 session 的不可用标记
    from backend.db.crud import session as session_crud
    await session_crud.clear_topic_unavailable(db, topic_id)

    await db.commit()
    return {"success": True, "message": "话题已重新上架"}

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

    批量查询标签关联和标签名，替代原来的逐个循环查询
    原来 10 个话题 × 平均 3 标签 = ~40 次 SQL → 修复后 3 次 SQL
    """
    topics = await topic_crud.get_recommended_topics(
        db, limit=limit, exclude_user_id=user_id
    )

    if not topics:
        return []

    # 批量查询所有话题的标签关联
    topic_ids = [t.id for t in topics]
    tag_result = await db.execute(
        select(TopicTag).where(TopicTag.topic_id.in_(topic_ids))
    )
    all_topic_tags = tag_result.scalars().all()

    # 批量查询涉及的所有 Tag
    tag_ids = list({tt.tag_id for tt in all_topic_tags})
    if tag_ids:
        tags_result = await db.execute(
            select(Tag).where(Tag.id.in_(tag_ids))
        )
        tag_map = {t.id: t.name for t in tags_result.scalars().all()}
    else:
        tag_map = {}

    # 构建 topic_id → [tag_name] 映射
    topic_tag_map: Dict[int, List[str]] = {}
    for tt in all_topic_tags:
        tag_name = tag_map.get(tt.tag_id)
        if tag_name:
            topic_tag_map.setdefault(tt.topic_id, []).append(tag_name)

    # 组装结果（0 次循环内查询）
    result = []
    for topic in topics:
        result.append({
            "id": topic.id,
            "title": topic.title,
            "content": topic.content,
            "is_official": topic.is_official,
            "likes_count": topic.likes_count,
            "usage_count": topic.usage_count or 0,
            "tags": topic_tag_map.get(topic.id, []),
        })

    return result
