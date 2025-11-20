# backend/api/chat_api.py
"""
API 层：只做和前端的通信，逻辑全部调用 ChatService。
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from backend.services.chat_service import ChatService

router = APIRouter()


def create_chat_router(chat_service: ChatService):

    @router.post("/chat/stream")
    async def chat_stream(body: dict):
        """
        请求体 body 约定：
        - mode: 1 或 2（必填）
        - session_id: 会话ID（可选，不传则为 "default"）
        - message: 用户输入（mode1 首轮可以为空）
        - topic_id: 仅 mode1 需要，mode2 可不传
        - is_first: 是否是本 session 的第一轮（bool，可选）
        """

        mode = body.get("mode", 1)
        session_id = body.get("session_id", "default")
        user_input = body.get("message", "")

        # mode1 需要 topic_id；mode2 不需要
        topic_id = body.get("topic_id")

        # 是否是本 session 第一轮（用于 mode1 由模型开场）
        is_first = body.get("is_first", False)

        async def event_generator():
            async for chunk in chat_service.stream_response(
                session_id=session_id,
                mode=mode,
                topic_id=topic_id,
                user_input=user_input,
                is_first=is_first
            ):
                # SSE 必须以 "data:" 开头
                yield f"data: {chunk}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    return router

