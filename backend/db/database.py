# backend/db/database.py
from __future__ import annotations

import os
from functools import lru_cache
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

load_dotenv()

Base = declarative_base()


def _normalize_async_db_url(url: str) -> str:
    """
    应用层永远使用 async driver。
    - mysql+pymysql -> mysql+aiomysql
    - sqlite+pysqlite -> sqlite+aiosqlite
    - sqlite:///...   -> sqlite+aiosqlite:///...
    """
    if "mysql+pymysql" in url:
        url = url.replace("mysql+pymysql", "mysql+aiomysql")
    if "sqlite+pysqlite" in url:
        url = url.replace("sqlite+pysqlite", "sqlite+aiosqlite")

    # 如果用户/默认给了 sqlite 同步 URL（sqlite:///），自动补上 async driver
    if url.startswith("sqlite:///") and "sqlite+" not in url:
        url = url.replace("sqlite:///", "sqlite+aiosqlite:///")

    return url


DATABASE_URL = _normalize_async_db_url(
    os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
)


@lru_cache(maxsize=1)
def get_engine():
    # 惰性创建：避免 Alembic 导入 Base 时就触发 create_async_engine
    return create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
    )


@lru_cache(maxsize=1)
def get_sessionmaker():
    return async_sessionmaker(
        get_engine(),
        expire_on_commit=False,
        class_=AsyncSession,
    )


# FastAPI Depends
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    SessionLocal = get_sessionmaker()
    async with SessionLocal() as session:
        yield session


engine = get_engine()
