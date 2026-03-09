# backend/db/crud/session.py
"""
会话 CRUD 操作
- 从 session_api.py 提取的数据库查询逻辑
"""

from typing import List, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import Session, Message


async def get_user_sessions(db: AsyncSession, user_id: int) -> List[Dict]:
    """获取用户的所有未删除会话"""
    result = await db.execute(
        select(Session)
        # ✅ Bug #6 修复: 使用 .is_(None) 替代 == None
        .where(Session.user_id == user_id, Session.deleted_at.is_(None))
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    output = []
    for s in sessions:
        msg_res = await db.execute(
            select(Message)
            .where(Message.session_id == s.id)
            .order_by(Message.created_at.desc())
        )
        last_msg = msg_res.scalars().first()
        output.append({
            "id": s.id,
            "mode": s.mode,
            "topic_id": s.topic_id,
            "topic_title": s.topic_title or "",
            "status": "completed" if bool(s.is_completed) else "in_progress",
            "created_at": s.created_at,
            "updated_at": s.updated_at,
            "last_message": last_msg.content if last_msg else "",
            "report_ready": bool(s.report_ready),
        })
    return output


async def get_session_with_messages(
    db: AsyncSession, session_id: str, user_id: int
) -> Optional[Dict]:
    """获取单个会话详情（含全部消息）"""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    msg_res = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
    )
    messages = msg_res.scalars().all()

    return {
        "id": session.id,
        "mode": session.mode,
        "topic_id": session.topic_id,
        "topic_title": session.topic_title or "",
        "is_completed": bool(session.is_completed),
        "status": "completed" if bool(session.is_completed) else "in_progress",
        "report_ready": bool(session.report_ready),
        "messages": [{"role": m.role, "content": m.content} for m in messages],
    }