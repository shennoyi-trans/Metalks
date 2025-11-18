# backend/main.py

import uvicorn
from fastapi import FastAPI
from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService
from backend.api.chat_api import create_chat_router

app = FastAPI()

# ==========================
# 初始化 LLM 客户端
# ==========================
llm = load_llm_client({
    "provider": "mock",         # 测试时用 mock，之后换 deepseek
    "api_key": "YOUR_KEY"
})

chat_service = ChatService(llm)
app.include_router(create_chat_router(chat_service))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
