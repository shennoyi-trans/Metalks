# backend/api/topic_api.py - v1.6
"""
话题 API 接口
支持接口：
1.  创建话题（✅ 官方账号自动成为官方话题）
2.  获取话题详情（✅ 作者可查看自己 pending 状态的话题）
3.  编辑话题
4.  获取话题列表
4a. 获取我的话题
5.  搜索话题
6.  获取推荐话题
7.  获取所有标签
8a. 搜索标签
8b. 创建标签
9.  审核话题（管理员）
10. 下架话题
11. 删除话题
12. 点赞/取消点赞
13. 投喂电解液
14. ✅ v1.6 敏感词预检
15. ✅ v1.6 话题状态通知
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
import re

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.services import topic_service
from backend.db.crud import tag as tag_crud
from backend.db.crud import topic_author as author_crud
from backend.utils.sensitive_words import check_sensitive_words_detailed


# ============================================================
# 请求体模型
# ============================================================

class CreateTopicPayload(BaseModel):
    """创建话题请求体"""
    title: str
    content: str
    prompt: str
    tag_ids: List[int]
    coauthors: Optional[List[dict]] = None  # [{"user_id": 10, "share": 30}, ...]


class UpdateTopicPayload(BaseModel):
    """编辑话题请求体"""
    title: Optional[str] = None
    content: Optional[str] = None
    prompt: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class ReviewTopicPayload(BaseModel):
    """审核话题请求体"""
    action: str  # "approve" 或 "reject"


class DonatePayload(BaseModel):
    """投喂电解液请求体"""
    amount: float


class CreateTagPayload(BaseModel):
    """创建标签请求体"""
    name: str
    description: Optional[str] = None


class SensitiveCheckPayload(BaseModel):
    """✅ v1.6 敏感词预检请求体"""
    title: str = ""
    content: str = ""
    prompt: str = ""


router = APIRouter(prefix="/topics", tags=["topics"])


# ============================================================
# 1. 创建话题（✅ 官方账号自动成为官方话题）
# ============================================================

@router.post("")
async def create_topic(
    payload: CreateTopicPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    创建话题

    - ✅ 官方账号（is_admin）创建的话题自动标记为官方话题
    """
    # ✅ v1.6：检查是否为管理员，自动设为官方话题
    from backend.db.crud import user as user_crud
    user = await user_crud.get_user_by_id(db, user_id)
    is_official = bool(user and user.is_admin)

    result = await topic_service.create_topic(
        db=db,
        user_id=user_id,
        title=payload.title,
        content=payload.content,
        prompt=payload.prompt,
        tag_ids=payload.tag_ids,
        coauthors=payload.coauthors,
        is_official=is_official
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ============================================================
# 2. 获取话题详情（✅ 作者可查看自己的 pending 话题）
# ============================================================

@router.get("/{topic_id}")
async def get_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_current_user)
):
    """
    获取话题详情
    - 管理员可查看未激活（pending/rejected）的话题
    - ✅ v1.6：话题作者也可查看自己 pending/rejected 的话题
    - 普通用户只能查看已激活的话题
    """
    include_inactive = False

    if user_id:
        from backend.db.crud import user as user_crud
        user = await user_crud.get_user_by_id(db, user_id)

        # 管理员可查看所有话题
        if user and user.is_admin:
            include_inactive = True
        else:
            # ✅ v1.6：检查是否为话题作者
            is_author = await author_crud.is_author(db, topic_id, user_id)
            if is_author:
                include_inactive = True

    topic = await topic_service.get_topic_detail(
        db=db,
        topic_id=topic_id,
        user_id=user_id,
        include_inactive=include_inactive
    )

    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")

    return topic


# ============================================================
# 3. 编辑话题（✅ 仅允许编辑 pending 状态的话题）
# ============================================================

@router.put("/{topic_id}")
async def update_topic(
    topic_id: int,
    payload: UpdateTopicPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    编辑话题
    - ✅ v1.6：仅允许编辑 pending 状态的话题
    """
    # ✅ v1.6：检查话题状态
    from backend.db.crud import topic as topic_crud_mod
    topic_obj = await topic_crud_mod.get_topic_by_id(db, topic_id, include_inactive=True)
    if not topic_obj:
        raise HTTPException(status_code=404, detail="话题不存在")
    if topic_obj.status != "pending":
        raise HTTPException(status_code=400, detail="只能编辑待审核状态的话题")

    result = await topic_service.update_topic(
        db=db,
        user_id=user_id,
        topic_id=topic_id,
        title=payload.title,
        content=payload.content,
        prompt=payload.prompt,
        tag_ids=payload.tag_ids
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ============================================================
# 4. 获取话题列表
# ============================================================

@router.get("")
async def get_topics(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_official: Optional[bool] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    order: str = "desc",
    db: AsyncSession = Depends(get_db)
):
    """获取话题列表（支持分页/筛选/排序）"""
    from backend.db.crud import topic as topic_crud

    topics, total = await topic_crud.get_topics(
        db=db,
        skip=skip,
        limit=limit,
        status=status,
        is_active=is_active,
        is_official=is_official,
        tag_id=tag_id,
        search=search,
        sort_by=sort_by,
        order=order
    )

    topic_list = []
    for topic in topics:
        topic_list.append({
            "id": topic.id,
            "title": topic.title,
            "content": topic.content,
            "is_official": topic.is_official,
            "likes_count": topic.likes_count,
            "electrolyte_received": topic.electrolyte_received,
            "status": topic.status,
            "is_active": topic.is_active,
            "created_at": topic.created_at.isoformat()
        })

    return {
        "topics": topic_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }


# ============================================================
# 4a. 获取我的话题（✅ v1.6 包含 electrolyte_received 字段）
# ============================================================

@router.get("/my/list")
async def get_my_topics(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """获取我创建/参与的话题"""
    from backend.db.crud import topic as topic_crud

    topics, total = await topic_crud.get_topics_by_user(
        db=db,
        user_id=user_id,
        skip=skip,
        limit=limit
    )

    topic_list = []
    for topic in topics:
        topic_list.append({
            "id": topic.id,
            "title": topic.title,
            "status": topic.status,
            "is_active": topic.is_active,
            "likes_count": topic.likes_count,
            "electrolyte_received": getattr(topic, 'electrolyte_received', 0),
            "created_at": topic.created_at.isoformat()
        })

    return {
        "topics": topic_list,
        "total": total
    }


# ============================================================
# 5. 搜索话题
# ============================================================

@router.get("/search")
async def search_topics(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """搜索话题（只返回已审核且启用的）"""
    from backend.db.crud import topic as topic_crud

    topics, _ = await topic_crud.get_topics(
        db=db,
        skip=0,
        limit=limit,
        status="approved",
        is_active=True,
        search=q,
        sort_by="likes_count",
        order="desc"
    )

    topic_list = []
    for topic in topics:
        topic_list.append({
            "id": topic.id,
            "title": topic.title,
            "likes_count": topic.likes_count
        })

    return {
        "topics": topic_list,
        "query": q
    }


# ============================================================
# 6. 获取推荐话题
# ============================================================

@router.get("/recommended")
async def get_recommended_topics(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_current_user)
):
    """获取推荐话题（综合算法）"""
    topics = await topic_service.get_recommended_topics(
        db=db,
        limit=limit,
        user_id=user_id
    )

    return {
        "topics": topics
    }


# ============================================================
# 7. 获取所有标签
# ============================================================

@router.get("/tags/all")
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    """获取所有标签"""
    tags = await tag_crud.get_all_tags(db)
    return {
        "tags": [
            {
                "id": tag.id,
                "name": tag.name,
                "slug": tag.slug,
                "description": tag.description
            }
            for tag in tags
        ]
    }


# ============================================================
# 8a. 搜索标签
# ============================================================

@router.get("/tags/search")
async def search_tags(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """搜索标签（按名称模糊匹配）"""
    tags = await tag_crud.search_tags(db, keyword=q, limit=limit)
    return {
        "tags": [
            {
                "id": tag.id,
                "name": tag.name,
                "slug": tag.slug,
                "description": tag.description
            }
            for tag in tags
        ],
        "query": q
    }


# ============================================================
# 8b. 创建标签
# ============================================================

@router.post("/tags")
async def create_tag(
    payload: CreateTagPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """创建新标签"""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="标签名称不能为空")

    slug = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fff]+', '-', name).strip('-').lower()

    existing = await tag_crud.get_tag_by_slug(db, slug)
    if existing:
        return {
            "success": True,
            "message": "标签已存在",
            "tag": {
                "id": existing.id,
                "name": existing.name,
                "slug": existing.slug,
                "description": existing.description
            }
        }

    tag = await tag_crud.create_tag(
        db, name=name, slug=slug,
        description=payload.description or ""
    )

    return {
        "success": True,
        "message": "标签创建成功",
        "tag": {
            "id": tag.id,
            "name": tag.name,
            "slug": tag.slug,
            "description": tag.description
        }
    }


# ============================================================
# 9. 审核话题（管理员）
# ============================================================

@router.post("/{topic_id}/review")
async def review_topic(
    topic_id: int,
    payload: ReviewTopicPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """审核话题（管理员功能）"""
    from backend.db.crud import user as user_crud
    user = await user_crud.get_user_by_id(db, user_id)

    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")

    result = await topic_service.review_topic(
        db=db,
        topic_id=topic_id,
        action=payload.action
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ============================================================
# 10. 下架话题
# ============================================================

@router.post("/{topic_id}/deactivate")
async def deactivate_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """下架话题（软删除）"""
    result = await topic_service.deactivate_topic(
        db=db,
        user_id=user_id,
        topic_id=topic_id
    )

    if not result["success"]:
        raise HTTPException(status_code=403, detail=result["message"])

    return result


# ============================================================
# 11. 删除话题（硬删除）
# ============================================================

@router.delete("/{topic_id}")
async def delete_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """删除话题（永久删除）"""
    result = await topic_service.delete_topic(
        db=db,
        user_id=user_id,
        topic_id=topic_id
    )

    if not result["success"]:
        raise HTTPException(status_code=403, detail=result["message"])

    return result


# ============================================================
# 12. 点赞/取消点赞
# ============================================================

@router.post("/{topic_id}/like")
async def toggle_like(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """切换点赞状态"""
    result = await topic_service.toggle_like(
        db=db,
        user_id=user_id,
        topic_id=topic_id
    )
    return result


# ============================================================
# 13. 投喂电解液
# ============================================================

@router.post("/{topic_id}/donate")
async def donate_electrolyte(
    topic_id: int,
    payload: DonatePayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """投喂电解液"""
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="投喂金额必须大于0")

    result = await topic_service.donate_electrolyte(
        db=db,
        user_id=user_id,
        topic_id=topic_id,
        amount=payload.amount
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ============================================================
# 14. ✅ v1.6 敏感词预检
# ============================================================

@router.post("/check-sensitive")
async def check_sensitive_words(
    payload: SensitiveCheckPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    敏感词预检（创建/编辑话题前调用）

    返回:
        {
            "has_sensitive": bool,
            "matches": [
                {
                    "word": "敏感词",
                    "field": "title" | "content" | "prompt",
                    "positions": [{"start": 0, "end": 3}]
                }
            ]
        }
    """
    all_matches = []

    # 分别检查每个字段
    fields = [
        ("title", payload.title),
        ("content", payload.content),
        ("prompt", payload.prompt),
    ]

    for field_name, field_text in fields:
        if not field_text:
            continue
        has_sensitive, matches = await check_sensitive_words_detailed(db, field_text)
        if has_sensitive:
            for match in matches:
                all_matches.append({
                    "word": match["word"],
                    "field": field_name,
                    "positions": match["positions"]
                })

    return {
        "has_sensitive": bool(all_matches),
        "matches": all_matches
    }


# ============================================================
# 15. ✅ v1.6 话题状态通知（我的话题中有状态变更）
# ============================================================

@router.get("/my/notifications")
async def get_topic_notifications(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    获取话题状态通知

    检查用户的话题是否有状态变更：
    - approved: 已通过审核
    - rejected: 未通过审核
    - deactivated: 已被下架（is_active=False 且 status=approved）

    返回:
        {
            "has_updates": bool,
            "notifications": [
                {"topic_id": 1, "title": "...", "status": "approved", "label": "已通过审核"}
            ]
        }
    """
    from backend.db.crud import topic as topic_crud

    topics, _ = await topic_crud.get_topics_by_user(
        db=db,
        user_id=user_id,
        skip=0,
        limit=100
    )

    notifications = []
    for topic in topics:
        if topic.status == "approved" and topic.is_active:
            notifications.append({
                "topic_id": topic.id,
                "title": topic.title,
                "status": "approved",
                "label": "已通过审核"
            })
        elif topic.status == "rejected":
            notifications.append({
                "topic_id": topic.id,
                "title": topic.title,
                "status": "rejected",
                "label": "未通过审核"
            })
        elif topic.status == "approved" and not topic.is_active:
            notifications.append({
                "topic_id": topic.id,
                "title": topic.title,
                "status": "deactivated",
                "label": "已被下架"
            })

    # 只返回 approved/rejected/deactivated 的（pending 不算通知）
    has_updates = any(
        n["status"] in ("approved", "rejected", "deactivated")
        for n in notifications
    )

    return {
        "has_updates": has_updates,
        "notifications": notifications
    }
