# main.py
"""
FastAPI 主入口文件
- 注册所有API路由
- 配置CORS中间件
- 初始化LLM服务
- 初始化管理后台

🆕 v1.4: 添加话题系统路由
"""

import json
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService

# API路由
from backend.api.auth_api import router as auth_router
from backend.api.user_api import router as user_router
from backend.api.chat_api import create_chat_router
from backend.api.topic_api import router as topic_router_new  # 🆕 v1.4: 新话题系统路由
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
    version="1.4.0"  # 🆕 v1.4: 版本号更新
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

# 用户信息和昵称管理
app.include_router(user_router, prefix="/api")

# 聊天功能
app.include_router(create_chat_router(chat_service), prefix="/api")

# 🆕 v1.4: 新话题系统（Reddit风格）
app.include_router(topic_router_new, prefix="/api")

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
        "version": "1.4.0",  # 🆕 v1.4
        "status": "running",
        "features": [
            "用户认证与管理",
            "对话系统（mode1话题/mode2随便聊）",
            "观念分析与报告生成",
            "特质画像",
            "Reddit风格话题系统（v1.4新增）",
            "话题创建、审核、点赞、投喂",
            "多作者协作与电解液分配"
        ]
    }


@app.get("/health")
async def health_check():
    """
    健康检查接口
    """
    return {
        "status": "healthy",
        "database": "connected",
        "llm": "initialized",
        "version": "1.4.0"
    }


# ============================================================
# 🆕 v1.4: 版本信息接口
# ============================================================
@app.get("/api/version")
async def get_version():
    """
    获取系统版本信息
    """
    return {
        "version": "1.4.0",
        "release_date": "2026-01-16",
        "changelog": {
            "v1.4.0": [
                "Reddit风格话题系统",
                "Session.topic_prompt快照机制",
                "多作者协作与权重分配",
                "标签系统",
                "独立点赞表",
                "电解液投喂功能"
            ],
            "v1.2.0": [
                "点解功能",
                "UI优化",
                "用户管理改进"
            ]
        }
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
