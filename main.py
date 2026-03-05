# main.py
import os
import json
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.llm_client.factory import load_llm_client
from backend.services.chat_service import ChatService
from backend.api.auth_api import router as auth_router
from backend.api.user_api import router as user_router
from backend.api.chat_api import create_chat_router
from backend.api.topic_api import router as topic_router_new
from backend.api.traits_api import router as traits_router
from backend.api.session_api import router as session_router
from backend.api.report_api import router as report_router
from backend.db.database import engine
from backend.admin_panel import create_admin


# ============================================================
# 配置加载函数化 + 环境变量优先
# ============================================================
def _load_config(path: str = "backend/config.json") -> dict:
    try:
        with open(path, "r", encoding="utf8") as f:
            config = json.load(f)
    except FileNotFoundError:
        config = {}
    except json.JSONDecodeError as e:
        raise RuntimeError(f"配置文件 JSON 格式错误: {e}")

    # 环境变量优先覆盖配置文件（避免 API Key 硬编码）
    config["provider"] = os.getenv("LLM_PROVIDER", config.get("provider", "mock"))
    config["api_key"] = os.getenv("LLM_API_KEY", config.get("api_key", ""))
    config["model"] = os.getenv("LLM_MODEL", config.get("model", "deepseek-chat"))

    if config["provider"] != "mock" and not config["api_key"]:
        raise RuntimeError(
            "未找到 LLM API Key，请设置环境变量 LLM_API_KEY 或在 config.json 中配置"
        )

    return config


config = _load_config()
llm_client = load_llm_client(config)
chat_service = ChatService(llm_client)


# ============================================================
# 使用 lifespan 替代已废弃的 on_event
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # shutdown: 释放 LLM 连接池
    if hasattr(llm_client, "close"):
        await llm_client.close()


app = FastAPI(
    title="Metalks API",
    description="对话驱动的个体观念识别与认知模式建模系统",
    version="1.4.0",
    lifespan=lifespan,
)


# ============================================================
# 配置 CORS 中间件
# ============================================================
origins = [
    "http://metalks.me",
    "http://www.metalks.me",
    "https://metalks.me",
    "https://www.metalks.me",
    "http://localhost:3000",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 注册所有 API 路由
# ============================================================
app.include_router(auth_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(create_chat_router(chat_service), prefix="/api")
app.include_router(topic_router_new, prefix="/api")
app.include_router(traits_router, prefix="/api")
app.include_router(session_router, prefix="/api")
app.include_router(report_router, prefix="/api")

# ============================================================
# 初始化管理后台
# ============================================================
admin = create_admin(app, engine)


# ============================================================
# 健康检查接口
# ============================================================
@app.get("/")
async def health_check():
    return {"status": "ok", "version": "1.4.0"}
