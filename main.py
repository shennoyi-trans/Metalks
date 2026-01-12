# main.py
"""
FastAPI 主入口文件
- 注册所有API路由
- 配置CORS中间件
- 初始化LLM服务
- 初始化管理后台
"""

import json
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService

# API路由
from backend.api.auth_api import router as auth_router
from backend.api.user_api import router as user_router  # 🆕 用户管理API
from backend.api.chat_api import create_chat_router
from backend.api.topic_api import router as topic_router
from backend.api.traits_api import router as traits_router
from backend.api.session_api import router as session_router
from backend.api.report_api import router as report_router

# 管理后台
from backend.db.database import engine
from backend.admin_panel import create_admin


# ============================================================
# 创建 FastAPI 应用
# ============================================================
app = FastAPI(
    title="Metalks API",
    description="对话驱动的个体观念识别与认知模式建模系统",
    version="1.2.0"
)


# ============================================================
# 配置 CORS 中间件
# ============================================================
origins = [
    "http://metalks.me",
    "http://www.metalks.me",
    "https://metalks.me",
    "https://www.metalks.me",
    "http://localhost:3000",    # 本地开发
    "http://localhost:8000",    # 本地开发
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 从配置文件加载 LLM 配置
# ============================================================
with open("backend/config.json", "r", encoding="utf8") as f:
    config = json.load(f)


# ============================================================
# 初始化 LLM 客户端
# ============================================================
llm_client = load_llm_client(config)


# ============================================================
# 初始化业务服务
# ============================================================
chat_service = ChatService(llm_client)


# ============================================================
# 注册所有 API 路由
# ============================================================

# 认证相关
app.include_router(auth_router, prefix="/api")

# 🆕 用户信息和昵称管理
app.include_router(user_router, prefix="/api")

# 聊天功能
app.include_router(create_chat_router(chat_service), prefix="/api")

# 话题相关
app.include_router(topic_router, prefix="/api")

# 特质相关
app.include_router(traits_router, prefix="/api")

# 会话管理
app.include_router(session_router, prefix="/api")

# 报告相关
app.include_router(report_router, prefix="/api")


# ============================================================
# 初始化管理后台（访问 /admin）
# ============================================================
admin = create_admin(app, engine)


# ============================================================
# 健康检查接口
# ============================================================
@app.get("/")
async def root():
    """
    根路径健康检查
    """
    return {
        "service": "Metalks API",
        "version": "1.2.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    健康检查接口
    """
    return {
        "status": "healthy",
        "database": "connected",
        "llm": "initialized"
    }


# ============================================================
# 启动服务
# ============================================================
if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
