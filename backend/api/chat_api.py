# backend/api/chat_api.py
"""
聊天流式接口
- SSE 流式输出（Server-Sent Events）
- 统一错误处理（业务错误 + 服务器错误）
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, Body
from fastapi.responses import StreamingResponse

from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.database import get_db

from backend.services.chat_service import ChatService
from backend.core.dependencies import get_current_user

logger = logging.getLogger("chat_api")

router = APIRouter()


def create_chat_router(chat_service: ChatService):

    @router.post("/chat/stream")
    async def chat_stream(
        body: dict = Body(...),
        db: AsyncSession = Depends(get_db),
        user_id: int = Depends(get_current_user),
    ):
        """
        请求体 body 约定：
        - mode: 1 或 2（必填）
        - session_id: 会话ID（可选，不传则为 "default"）
        - message: 用户输入（mode1 首轮可以为空）
        - topic_id: 仅 mode1 需要，mode2 可不传
        - is_first: 是否是本 session 的第一轮（bool，可选）
        - force_end: 是否主动结束对话（bool，可选）
        """

        mode = body.get("mode", 1)
        session_id = body.get("session_id", "default")
        user_input = body.get("message", "")
        topic_id = body.get("topic_id")
        is_first = body.get("is_first", False)
        force_end = body.get("force_end", False)

        async def event_generator():
             # v1.4.3: 检查 session 话题是否不可用
            from sqlalchemy import select as sa_select
            from backend.db.models import Session as SessionModel
            sess_result = await db.execute(
                sa_select(SessionModel).where(SessionModel.id == session_id)
            )
            existing_session = sess_result.scalar_one_or_none()
            if existing_session and existing_session.topic_unavailable:
                error_event = {
                    "type": "error",
                    "error_code": "TOPIC_UNAVAILABLE",
                    "content": existing_session.topic_unavailable_reason or "该话题已不可用",
                }
                yield "data: " + json.dumps(error_event, ensure_ascii=False) + "\n\n"
                return
                
            try:
                async for event in chat_service.stream_response(
                    session_id=session_id,
                    mode=mode,
                    topic_id=topic_id,
                    user_input=user_input,
                    is_first=is_first,
                    force_end=force_end,
                    db=db,
                    user_id=user_id,
                ):
                    yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"

            except ValueError as e:
                # 业务逻辑错误（话题不存在、参数无效等）
                logger.warning(
                    "SSE stream ValueError [session=%s, user=%s, mode=%s]: %s",
                    session_id, user_id, mode, str(e),
                )
                error_event = {
                    "type": "error",
                    "error_code": "INVALID_REQUEST",
                    "content": str(e),
                }
                yield "data: " + json.dumps(error_event, ensure_ascii=False) + "\n\n"

            except Exception as e:
                # 未预期的服务器错误
                error_id = str(uuid.uuid4())[:8]
                logger.error(
                    "SSE stream failed [error_id=%s, session=%s, user=%s, mode=%s]: %s",
                    error_id, session_id, user_id, mode, str(e),
                    exc_info=True,
                )
                error_event = {
                    "type": "error",
                    "error_code": "SERVER_ERROR",
                    "error_id": error_id,
                    "content": "服务器内部错误，请稍后重试",
                }
                yield "data: " + json.dumps(error_event, ensure_ascii=False) + "\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
        )

    return router