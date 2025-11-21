# backend/api/chat_api.py
import json
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
        - force_end: 是否主动结束对话（bool，可选）
        """

        mode = body.get("mode", 1)
        session_id = body.get("session_id", "default")
        user_input = body.get("message", "")
        topic_id = body.get("topic_id")
        is_first = body.get("is_first", False)
        force_end = body.get("force_end", False)

        async def event_generator():
            async for event in chat_service.stream_response(
                session_id=session_id,
                mode=mode,
                topic_id=topic_id,
                user_input=user_input,
                is_first=is_first,
                force_end=force_end,
            ):
                # event 是一个 dict，统一转为 JSON
                yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    return router


