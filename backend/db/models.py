# backend/db/models.py
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List

from sqlalchemy import (
    String,
    Integer,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Float,
    Date,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from backend.db.database import Base


# ============================================================
# User 表
# ============================================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, comment="用户编号"
    )
    
    nickname: Mapped[Optional[str]] = mapped_column(
        String(50), 
        unique=True,      # ✅ 修正：true → True
        nullable=True, 
        index=True,       # ✅ 修正：true → True
        comment="用户昵称（唯一）"
    )
    
    phone_number: Mapped[Optional[str]] = mapped_column(
        String(20), 
        nullable=True,
        comment="用户手机号"
    )
    
    email: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        nullable=False, 
        index=True,       # ✅ 修正：true → True
        comment="用户邮箱（唯一）"
    )
    
    password_hash: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="密码哈希"
    )
    
    electrolyte_number: Mapped[float] = mapped_column(
        Float,
        nullable=False, 
        default=0.0,     
        comment="电解液数量（支持小数）"
    )
    
    is_plus: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        nullable=False, 
        comment="Plus会员标记"
    )
    
    is_admin: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        nullable=False, 
        comment="管理员标记"
    )
    
    last_login_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="最后登录日期（用于每日签到判断）"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow, 
        comment="创建时间"
    )

    # 一对多：User → Sessions
    sessions: Mapped[List["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )
    
    # 一对多：User → NicknameHistory
    nickname_histories: Mapped[List["NicknameHistory"]] = relationship(
        "NicknameHistory", back_populates="user", cascade="all, delete-orphan"
    )


# ============================================================
# Session 表
# ============================================================
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )

    mode: Mapped[int] = mapped_column(Integer, nullable=False)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_completed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # 报告相关字段
    report_ready: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    opinion_report: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, default=None
    )

    # 软删除字段
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, default=None
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # 关系
    user: Mapped["User"] = relationship("User", back_populates="sessions")
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="session", cascade="all, delete-orphan"
    )


# ============================================================
# Message 表
# ============================================================
class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id"), nullable=False
    )

    role: Mapped[str] = mapped_column(String(20))  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # 关系
    session: Mapped["Session"] = relationship("Session", back_populates="messages")


# ============================================================
# TraitProfile 表（长期特质画像）
# ============================================================
class TraitProfile(Base):
    __tablename__ = "trait_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), unique=True, nullable=False
    )

    summary: Mapped[str] = mapped_column(Text, default="")
    full_report: Mapped[str] = mapped_column(Text, default="")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # 关系
    user: Mapped["User"] = relationship("User")


# ============================================================
# SensitiveWord 表（敏感词库）
# ============================================================
class SensitiveWord(Base):
    """
    敏感词表
    - 用于验证昵称是否包含敏感词
    - 匹配规则：包含匹配（如 "admin123" 包含 "admin"）
    """
    __tablename__ = "sensitive_words"

    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="敏感词ID"
    )
    
    word: Mapped[str] = mapped_column(
        String(50), 
        unique=True, 
        nullable=False,
        index=True,
        comment="敏感词内容"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        comment="添加时间"
    )


# ============================================================
# NicknameHistory 表（昵称修改历史）
# ============================================================
class NicknameHistory(Base):
    """
    昵称修改历史表
    - 记录用户每次修改昵称的操作
    - 用于审计和防止滥用
    """
    __tablename__ = "nickname_history"

    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="记录ID"
    )
    
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id"), 
        nullable=False,
        index=True,
        comment="用户ID"
    )
    
    old_nickname: Mapped[Optional[str]] = mapped_column(
        String(50), 
        nullable=True,
        comment="旧昵称（首次设置时为NULL）"
    )
    
    new_nickname: Mapped[str] = mapped_column(
        String(50), 
        nullable=False,
        comment="新昵称"
    )
    
    electrolyte_cost: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
        comment="本次修改消耗的电解液"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        comment="修改时间"
    )

    # 关系
    user: Mapped["User"] = relationship("User", back_populates="nickname_histories")