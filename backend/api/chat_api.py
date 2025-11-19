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

        user_input = body["message"]
        session_id = body.get("session_id", "default") # 可选，不填默认 "default"
        mode = mode = body.get("mode", 1)  # 可选，默认置1，即观念测试
        
        # 前端需要这样发送：
        # { "message": "...", "session_id":"...","mode": 1 }


        async def event_generator():
            async for chunk in chat_service.stream_response(session_id, mode,user_input):
                # SSE 必须以 "data:" 开头
                yield f"data: {chunk}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    return router
