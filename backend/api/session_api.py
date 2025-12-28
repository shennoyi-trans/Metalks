# backend/api/session_api.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import cast
from datetime import datetime

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.models import Session, Message, TraitProfile

router = APIRouter(tags=["sessions"])


# -------------------------------------------------------
# 1. 获取当前用户的全部对话列表（🔧 过滤已删除）
# -------------------------------------------------------
@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .where(Session.deleted_at == None)  # 🆕 过滤已删除
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    output = []
    for s in sessions:
        # 取最后一条消息作为 preview
        msg_res = await db.execute(
            select(Message).where(Message.session_id == s.id).order_by(Message.created_at.desc())
        )
        last_msg = msg_res.scalars().first()

        output.append({
            "id": s.id,
            "mode": s.mode,
            "topic_id": s.topic_id,
            "status": "completed" if bool(s.is_completed) else "in_progress",
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "last_message": last_msg.content if last_msg else "",
            "report_ready": bool(s.report_ready)
        })
    return output


# -------------------------------------------------------
# 2. 获取某个 session 的全部内容（含 messages）
# -------------------------------------------------------
@router.get("/sessions/{session_id}")
async def session_detail(
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

    msg_res = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())
    )
    messages = msg_res.scalars().all()

    return {
        "id": session.id,
        "mode": session.mode,
        "topic_id": session.topic_id,
        "status": "completed" if bool(session.is_completed) else "in_progress",
        "report_ready": bool(session.report_ready),
        "messages": [
            {"role": m.role, "content": m.content} for m in messages
        ]
    }


# -------------------------------------------------------
# 3. 🆕 软删除会话
# -------------------------------------------------------
@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    软删除会话（设置 deleted_at 时间戳）
    """
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    # 🆕 软删除：设置删除时间
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
    """
    用户主动结束对话时调用
    """
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