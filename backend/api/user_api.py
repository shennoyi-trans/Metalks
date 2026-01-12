# backend/api/user_api.py
"""
用户信息和管理 API
- 用户信息查询/修改
- 昵称管理（修改、历史查询）
- 电解液查询
- 密码修改
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.crud import user as user_crud
from backend.db.crud import nickname as nickname_crud
from backend.db.crud import electrolyte as electrolyte_crud
from backend.services import nickname_service
from backend.utils.validators import validate_password_strength


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
        "created_at": user.created_at.isoformat()
    }


# ============================================================
# 用户信息修改
# ============================================================

@router.put("/profile")
async def update_user_profile(
    payload: UpdateProfilePayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    修改用户基本信息
    
    请求体:
        - email: 新邮箱（可选）
        - phone_number: 新手机号（可选）
    
    返回:
        {
            "success": true,
            "message": "信息已更新",
            "user": {...}
        }
    
    注意:
        - 昵称修改请使用 PUT /user/nickname 接口
        - 密码修改请使用 PUT /user/password 接口
    """
    # 检查是否有要更新的字段
    if not payload.email and not payload.phone_number:
        raise HTTPException(status_code=400, detail="没有要更新的字段")
    
    # 如果要修改邮箱，检查是否已被使用
    if payload.email:
        existing = await user_crud.get_user_by_email(db, payload.email)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=400, detail="该邮箱已被使用")
    
    # 更新用户信息
    updated_user = await user_crud.update_user_profile(
        db,
        user_id,
        email=payload.email,
        phone_number=payload.phone_number
    )
    
    if not updated_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "success": True,
        "message": "信息已更新",
        "user": {
            "id": updated_user.id,
            "email": updated_user.email,
            "nickname": updated_user.nickname,
            "phone_number": updated_user.phone_number
        }
    }


# ============================================================
# 密码修改
# ============================================================

@router.put("/password")
async def change_password(
    payload: ChangePasswordPayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    修改密码
    
    请求体:
        - old_password: 旧密码
        - new_password: 新密码（最少6位）
    
    返回:
        {
            "success": true,
            "message": "密码修改成功"
        }
    """
    # 验证新密码强度
    is_valid, error_msg = validate_password_strength(payload.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 修改密码
    success, msg = await user_crud.update_user_password(
        db,
        user_id,
        payload.old_password,
        payload.new_password
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    return {
        "success": True,
        "message": msg
    }


# ============================================================
# 昵称管理
# ============================================================

@router.get("/nickname/check")
async def check_nickname_available(
    nickname: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    检查昵称是否可用
    
    参数:
        - nickname: 昵称（Query参数）
    
    返回:
        {
            "available": bool,
            "message": str
        }
    """
    is_valid, error_msg = await nickname_service.validate_nickname(
        db, nickname, user_id
    )
    
    if not is_valid:
        return {
            "available": False,
            "message": error_msg
        }
    
    return {
        "available": True,
        "message": "昵称可用"
    }


@router.put("/nickname")
async def change_user_nickname(
    payload: ChangeNicknamePayload,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    修改昵称
    
    请求体:
        - new_nickname: 新昵称
    
    返回:
        {
            "success": bool,
            "message": str,
            "balance": float,          # 操作后的电解液余额
            "old_nickname": str,
            "new_nickname": str
        }
    
    说明:
        - 每次修改消耗 6 个电解液
        - Plus会员暂无优惠
        - 电解液不足时返回错误
    """
    result = await nickname_service.change_nickname(
        db,
        user_id,
        payload.new_nickname
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result


@router.get("/nickname/history")
async def get_nickname_history(
    limit: int = 10,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    查询昵称修改历史
    
    参数:
        - limit: 返回数量（默认10条）
        - offset: 偏移量（用于分页）
    
    返回:
        {
            "total_changes": int,      # 总修改次数
            "history": [
                {
                    "id": int,
                    "old_nickname": str,
                    "new_nickname": str,
                    "electrolyte_cost": float,
                    "created_at": str
                },
                ...
            ]
        }
    """
    # 获取历史记录
    history_list = await nickname_crud.get_nickname_history(
        db, user_id, limit, offset
    )
    
    # 统计总修改次数
    total_changes = await nickname_crud.count_nickname_changes(db, user_id)
    
    return {
        "total_changes": total_changes,
        "history": [
            {
                "id": record.id,
                "old_nickname": record.old_nickname,
                "new_nickname": record.new_nickname,
                "electrolyte_cost": record.electrolyte_cost,
                "created_at": record.created_at.isoformat()
            }
            for record in history_list
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
    """
    查询电解液余额
    
    返回:
        {
            "balance": float,
            "message": str
        }
    """
    balance = await electrolyte_crud.get_electrolyte_balance(db, user_id)
    
    if balance is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "balance": balance,
        "message": "查询成功"
    }
