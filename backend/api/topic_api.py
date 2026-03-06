# backend/api/topic_api.py - v1.5
"""
话题 API 接口
支持15个接口：
1. 创建话题
2. 获取话题详情
3. 编辑话题
4. 获取话题列表
5. 获取我的话题
6. 搜索话题
7. 获取推荐话题
8. 获取所有标签
8a. 🆕 搜索标签
8b. 🆕 创建标签
9. 审核话题（管理员）
10. 下架话题
11. 删除话题
12. 点赞/取消点赞
13. 投喂电解液
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
    """🆕 创建标签请求体"""
    name: str
    description: Optional[str] = None


router = APIRouter(prefix="/topics", tags=["topics"])


# ============================================================
# 1. 创建话题
# ============================================================

@router.post("")
async def create_topic(
    payload: CreateTopicPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    创建话题
    
    请求体:
        - title: 话题标题
        - content: 话题内容
        - prompt: 对话提示词
        - tag_ids: 标签ID列表
        - coauthors: 共同作者列表（可选）
    
    返回:
        {
            "success": true,
            "message": "话题创建成功，等待审核",
            "topic": {...}
        }
    """
    result = await topic_service.create_topic(
        db=db,
        user_id=user_id,
        title=payload.title,
        content=payload.content,
        prompt=payload.prompt,
        tag_ids=payload.tag_ids,
        coauthors=payload.coauthors
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result


# ============================================================
# 2. 获取话题列表（支持分页、筛选、排序）
# ============================================================

@router.get("")
async def list_topics(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, regex="^(pending|approved|rejected)$"),
    is_active: Optional[bool] = None,
    is_official: Optional[bool] = None,
    tag_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at", regex="^(created_at|likes_count|electrolyte_received)$"),
    order: str = Query("desc", regex="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取话题列表
    """
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
            "likes_count": topic.likes_count,
            "electrolyte_received": topic.electrolyte_received,
            "status": topic.status,
            "is_active": topic.is_active,
            "is_official": topic.is_official,
            "created_at": topic.created_at.isoformat()
        })
    
    return {
        "topics": topic_list,
        "total": total,
        "skip": skip,
        "limit": limit
    }


# ============================================================
# 3. 编辑话题
# ============================================================

@router.put("/{topic_id}")
async def update_topic(
    topic_id: int,
    payload: UpdateTopicPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    编辑话题（编辑后 status 重置为 pending）
    """
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
        raise HTTPException(status_code=403, detail=result["message"])
    
    return result


# ============================================================
# 4. 获取我的话题
# ============================================================

@router.get("/my/list")
async def get_my_topics(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    获取我创建/参与的话题
    """
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
    """
    搜索话题（只返回已审核且启用的）
    """
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
    """
    获取推荐话题（综合算法）
    """
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
async def get_all_tags(
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有标签
    
    返回:
        {
            "tags": [
                {
                    "id": 标签ID,
                    "name": 标签名称,
                    "slug": URL友好名称,
                    "description": 描述
                },
                ...
            ]
        }
    """
    tags = await tag_crud.get_all_tags(db)
    
    tag_list = []
    for tag in tags:
        tag_list.append({
            "id": tag.id,
            "name": tag.name,
            "slug": tag.slug,
            "description": tag.description
        })
    
    return {
        "tags": tag_list
    }


# ============================================================
# 7a. 🆕 搜索标签
# ============================================================

@router.get("/tags/search")
async def search_tags(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """
    搜索标签（按名称模糊匹配）
    
    参数:
        - q: 搜索关键词
        - limit: 返回数量
    
    返回:
        {
            "tags": [标签列表],
            "query": 搜索词
        }
    """
    tags = await tag_crud.search_tags(db, keyword=q, limit=limit)
    
    tag_list = []
    for tag in tags:
        tag_list.append({
            "id": tag.id,
            "name": tag.name,
            "slug": tag.slug,
            "description": tag.description
        })
    
    return {
        "tags": tag_list,
        "query": q
    }


# ============================================================
# 7b. 🆕 创建标签
# ============================================================

@router.post("/tags")
async def create_tag(
    payload: CreateTagPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    创建新标签
    
    请求体:
        - name: 标签名称
        - description: 标签描述（可选）
    
    返回:
        {
            "success": true,
            "tag": {
                "id": 标签ID,
                "name": 标签名称,
                "slug": URL友好名称,
                "description": 描述
            }
        }
    
    说明:
        - slug 由后端根据 name 自动生成（中文用拼音）
        - 如果同名标签已存在，返回已有标签
    """
    name = payload.name.strip()
    
    if not name:
        raise HTTPException(status_code=400, detail="标签名称不能为空")
    
    if len(name) > 50:
        raise HTTPException(status_code=400, detail="标签名称不能超过50个字符")
    
    # 检查是否已存在同名标签
    existing = await tag_crud.get_tag_by_name(db, name)
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
    
    # 生成 slug：中文转拼音，英文转小写横杠
    slug = _generate_slug(name)
    
    # 确保 slug 唯一
    existing_slug = await tag_crud.get_tag_by_slug(db, slug)
    if existing_slug:
        import time
        slug = f"{slug}-{int(time.time()) % 10000}"
    
    tag = await tag_crud.create_tag(
        db=db,
        name=name,
        slug=slug,
        description=payload.description
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


def _generate_slug(name: str) -> str:
    """
    根据标签名称生成 slug
    - 英文：转小写，空格转横杠
    - 中文：直接使用（如果有 pypinyin 则转拼音，否则用原文）
    - 移除特殊字符
    """
    # 先尝试用 pypinyin 转换中文
    try:
        from pypinyin import lazy_pinyin
        slug = "-".join(lazy_pinyin(name))
    except ImportError:
        # 没有 pypinyin，直接用原名
        slug = name.lower()
    
    # 清理：只保留字母、数字、中文、横杠
    slug = re.sub(r'[^\w\u4e00-\u9fff-]', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    
    return slug or "tag"


# ============================================================
# 8. 获取话题详情
# ============================================================

@router.get("/{topic_id}")
async def get_topic(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_current_user)
):
    """
    获取话题详情
    """
    topic = await topic_service.get_topic_detail(
        db=db,
        topic_id=topic_id,
        user_id=user_id
    )
    
    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")
    
    return topic


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
    """
    审核话题（管理员功能）
    """
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
    """
    下架话题（软删除）
    """
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
    """
    删除话题（永久删除）
    """
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
    """
    点赞/取消点赞
    """
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
    """
    投喂电解液给话题
    """
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
