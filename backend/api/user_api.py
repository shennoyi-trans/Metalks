# backend/api/user_api.py
"""
用户信息和管理 API
- 用户信息查询/修改
- 昵称管理（修改、历史查询）
- 电解液查询
- 密码修改
- ✅ v1.6：用户搜索（按ID或昵称）
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, cast, String
from pydantic import BaseModel
from typing import Optional, List

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.crud import user as user_crud
from backend.db.crud import nickname as nickname_crud
from backend.db.crud import electrolyte as electrolyte_crud
from backend.services import nickname_service
from backend.utils.validators import validate_password_strength
from backend.db.models import User


class UpdateProfilePayload(BaseModel):
    """更新个人信息请求体"""
    email: Optional[str] = None
    phone_number: Optional[str] = None


class ChangePasswordPayload(BaseModel):
    """修改密码请求体"""
    old_password: str
    new_password: str


class ChangeNicknamePayload(BaseModel):
    """修改昵称请求体"""
    new_nickname: str


router = APIRouter(prefix="/user", tags=["user"])


# ============================================================
# 用户信息查询
# ============================================================

@router.get("/profile")
async def get_user_profile(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    获取当前用户信息
    
    返回:
        {
            "id": 用户ID,
            "email": 邮箱,
            "nickname": 昵称,
            "phone_number": 手机号,
            "electrolyte_balance": 电解液余额,
            "is_plus": 是否Plus会员,
            "created_at": 注册时间
        }
    """
    user = await user_crud.get_user_by_id(db, user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "phone_number": user.phone_number,
        "electrolyte_balance": user.electrolyte_number,
        "is_plus": user.is_plus,
        "is_admin": user.is_admin, 
        "created_at": user.created_at.isoformat()
    }


# ============================================================
# ✅ v1.6：用户搜索（按 ID 或昵称）
# ============================================================

@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=1, description="搜索关键词（用户ID或昵称）"),
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    搜索用户（按ID精确匹配或昵称模糊匹配）
    
    用途：创建话题时搜索共同作者
    
    返回:
        {
            "users": [{"id": 1, "nickname": "xxx"}],
            "query": "搜索词"
        }
    """
    q = q.strip()
    filters = []
    
    # 尝试按 ID 精确匹配
    try:
        search_id = int(q)
        filters.append(User.id == search_id)
    except ValueError:
        pass
    
    # 按昵称模糊匹配
    filters.append(User.nickname.ilike(f"%{q}%"))
    
    query = (
        select(User)
        .where(or_(*filters))
        .where(User.id != user_id)  # 排除自己
        .limit(limit)
    )
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return {
        "users": [
            {"id": u.id, "nickname": u.nickname or f"用户#{u.id}"}
            for u in users
        ],
        "query": q
    }


# ============================================================
# 更新用户信息
# ============================================================

@router.put("/profile")
async def update_profile(
    payload: UpdateProfilePayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """更新用户基本信息"""
    user = await user_crud.update_user_profile(
        db, user_id,
        email=payload.email,
        phone_number=payload.phone_number
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {"success": True, "message": "更新成功"}


# ============================================================
# 密码修改
# ============================================================

@router.put("/password")
async def change_password(
    payload: ChangePasswordPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """修改密码"""
    # 验证新密码强度
    is_valid, error_msg = validate_password_strength(payload.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    success, msg = await user_crud.update_user_password(
        db, user_id, payload.old_password, payload.new_password
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    return {"success": True, "message": msg}


# ============================================================
# 昵称管理
# ============================================================

@router.get("/nickname/check")
async def check_nickname_available(
    nickname: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """检查昵称是否可用"""
    is_valid, error_msg = await nickname_service.validate_nickname(db, nickname, user_id)
    return {"available": is_valid, "message": error_msg if not is_valid else "昵称可用"}


@router.put("/nickname")
async def change_nickname(
    payload: ChangeNicknamePayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """修改昵称（消耗电解液）"""
    result = await nickname_service.change_nickname(db, user_id, payload.new_nickname)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result


@router.get("/nickname/history")
async def get_nickname_history(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """查询昵称修改历史"""
    records = await nickname_crud.get_nickname_history(db, user_id, limit=limit, offset=offset)
    return {
        "records": [
            {
                "id": r.id,
                "old_nickname": r.old_nickname,
                "new_nickname": r.new_nickname,
                "electrolyte_cost": r.electrolyte_cost,
                "created_at": r.created_at.isoformat()
            }
            for r in records
        ]
    }


# ============================================================
# 电解液查询
# ============================================================

@router.get("/electrolyte")
async def get_electrolyte_balance(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """查询电解液余额"""
    user = await user_crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "balance": user.electrolyte_number,
        "message": "查询成功"
    }
