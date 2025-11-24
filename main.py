# backend/main.py
import json
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # 添加这行

from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService
from backend.api.auth_api import router as auth_router
from backend.api.chat_api import create_chat_router
from backend.api.topic_api import router as topic_router
from backend.api.traits_api import router as traits_router
from backend.api.session_api import router as session_router



app = FastAPI()

# ==========================
# 添加 CORS 中间件
# ==========================
origins = [
    "http://metalks.me",
    "http://www.metalks.me",
    "https://metalks.me",
    "https://www.metalks.me"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头
)

# 从配置文件加载配置
with open("backend/config.json", "r", encoding="utf8") as f:
    config = json.load(f)

# ==========================
# 初始化 LLM 客户端
# ==========================
llm_client = load_llm_client(config)

# ==========================
# 初始化业务服务
# ==========================
from backend.services.chat_service import ChatService
chat_service = ChatService(llm_client)

# ==========================
# 注册路由
# ==========================
app.include_router(create_chat_router(chat_service))
app.include_router(topic_router)
app.include_router(auth_router)
app.include_router(session_router)
app.include_router(traits_router)
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)