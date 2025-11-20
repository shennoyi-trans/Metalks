# backend/main.py

import uvicorn
from fastapi import FastAPI

from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService
from backend.api.chat_api import create_chat_router
from backend.api.topic_api import router as topic_router   # ← ★ 修正路径


app = FastAPI()

# ==========================
# 初始化 LLM 客户端
# ==========================
llm = load_llm_client({
    "provider": "mock",         # 开发阶段用 mock，之后可切换 deepseek
    "api_key": "YOUR_KEY"
})

# ==========================
# 初始化业务服务
# ==========================
chat_service = ChatService(llm)

# ==========================
# 注册路由
# ==========================
app.include_router(create_chat_router(chat_service))
app.include_router(topic_router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

