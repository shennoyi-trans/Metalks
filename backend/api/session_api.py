# backend/api/session_api.py — 重构版
"""
会话管理 API
- 会话列表查询
- 会话详情
- 软删除会话
- 手动标记会话完成
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import cast
from datetime import datetime

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.crud import session as session_crud  # ✅ 新增
from backend.db.models import Session

router = APIRouter(tags=["sessions"])


# -------------------------------------------------------
# 1. 获取当前用户的全部对话列表
# -------------------------------------------------------
@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    # ✅ 原来这里有 ~20 行 SQL 查询，现在只需 1 行
    return await session_crud.get_user_sessions(db, user_id)


# -------------------------------------------------------
# 2. 获取某个 session 的全部内容（含 messages）
# -------------------------------------------------------
@router.get("/sessions/{session_id}")
async def session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    data = await session_crud.get_session_with_messages(db, session_id, user_id)
    if not data:
        raise HTTPException(404, "Session not found")
    return data


# -------------------------------------------------------
# 3. 🆕 软删除会话
# -------------------------------------------------------
@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """软删除会话（设置 deleted_at 时间戳）"""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    session.deleted_at = datetime.utcnow()
    await db.commit()

    return {"status": "ok", "session_id": session_id}


# -------------------------------------------------------
# 4. 手动标记会话完成（用户点击"结束对话"）
# -------------------------------------------------------
@router.post("/sessions/{session_id}/complete")
async def complete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """用户主动结束对话时调用"""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    session.is_completed = cast(bool, True)
    await db.commit()

    return {"status": "ok", "session_id": session_id}


# -------------------------------------------------------
# 5. 标记 session 已完成（ChatService 触发 - 保留兼容）
# -------------------------------------------------------
@router.post("/sessions/mark_completed")
async def mark_completed(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    session.is_completed = cast(bool, True)
    await db.commit()
    return {"status": "ok"}
