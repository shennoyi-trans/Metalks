from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import Message, Session
from datetime import datetime


class DatabaseHistoryManager:
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def ensure_session(self, session_id: str, mode: int, topic_id: int | None):
        """
        如果 session 不存在就创建
        """
        result = await self.db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()

        if session:
            return session

        session = Session(
            id=session_id,
            user_id=self.user_id,
            mode=mode,
            topic_id=topic_id,
            created_at=datetime.utcnow(),
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    # =====================================
    # 写入消息
    # =====================================
    async def add(self, session_id: str, role: str, content: str):
        msg = Message(
            session_id=session_id,
            role=role,
            content=content,
            created_at=datetime.utcnow()
        )
        self.db.add(msg)

        # 更新 session 时间
        await self.db.execute(
            update(Session)
            .where(Session.id == session_id)
            .values(updated_at=datetime.utcnow())
        )
        await self.db.commit()

    # =====================================
    # 获取完整历史
    # =====================================
    async def get(self, session_id: str):
        result = await self.db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.asc())
        )
        messages = result.scalars().all()

        return [
            {"role": m.role, "content": m.content}
            for m in messages
        ]

    # =====================================
    # 清空历史（测试结束）
    # =====================================
    async def clear(self, session_id: str):
        await self.db.execute(
            Message.__table__.delete().where(Message.session_id == session_id)
        )
        await self.db.commit()
