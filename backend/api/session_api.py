from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import cast

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.models import Session, Message, TraitProfile

router = APIRouter(tags=["sessions"])


# -------------------------------------------------------
# 1. 获取当前用户的全部对话列表
# -------------------------------------------------------
@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    result = await db.execute(
        select(Session).where(Session.user_id == user_id).order_by(Session.created_at.desc())
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
            "last_message": last_msg.content if last_msg else ""
        })
    return output

# 🔥 添加带尾斜杠的别名
@router.get("/sessions/")
async def list_sessions_slash(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    # 直接调用上面的函数
    return await list_sessions(db, user_id)


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
        "messages": [
            {"role": m.role, "content": m.content} for m in messages
        ]
    }


# -------------------------------------------------------
# 3. 标记 session 已完成（ChatService 触发）
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