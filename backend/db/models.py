# backend/db/models.py v1.4
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
    Index,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from backend.db.database import Base


# ============================================================
# User 表（保持原样）
# ============================================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, comment="用户编号"
    )
    
    nickname: Mapped[Optional[str]] = mapped_column(
        String(50), 
        unique=True,
        nullable=True, 
        index=True,
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
        index=True,
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

    def __str__(self) -> str:
        return self.nickname or self.email or f"User#{self.id}"

    # 关系
    sessions: Mapped[List["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )
    
    nickname_histories: Mapped[List["NicknameHistory"]] = relationship(
        "NicknameHistory", back_populates="user", cascade="all, delete-orphan"
    )

    electrolyte_logs: Mapped[List["ElectrolyteLog"]] = relationship(
        "ElectrolyteLog", back_populates="user", cascade="all, delete-orphan"
    )


# ============================================================
# 🆕 Topic 表（话题主表）
# ============================================================
class Topic(Base):
    __tablename__ = "topics"
    
    # 主键
    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, comment="话题ID"
    )
    
    # 内容字段
    title: Mapped[str] = mapped_column(
        String(200), 
        nullable=False, 
        index=True,
        comment="话题标题"
    )
    
    content: Mapped[str] = mapped_column(
        Text, 
        nullable=False, 
        comment="话题详细内容"
    )
    
    prompt: Mapped[str] = mapped_column(
        Text, 
        nullable=False, 
        comment="对话提示词，用于model1"
    )
    
    # 社交统计
    likes_count: Mapped[int] = mapped_column(
        Integer, 
        default=0, 
        nullable=False, 
        comment="点赞数（冗余字段，便于排序）"
    )
    
    electrolyte_received: Mapped[float] = mapped_column(
        Float, 
        default=0.0, 
        nullable=False, 
        comment="累计收到的电解液"
    )

    usage_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="使用次数（其他用户通过该话题开始对话的次数）"
    )
    
    # 状态字段
    status: Mapped[str] = mapped_column(
        String(20), 
        default="pending", 
        nullable=False, 
        index=True,
        comment="审核状态: pending/approved/rejected"
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        nullable=False, 
        index=True,
        comment="是否启用（下架功能）"
    )
    
    is_official: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        nullable=False, 
        comment="是否官方话题"
    )
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        index=True,
        comment="创建时间"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow, 
        onupdate=datetime.utcnow, 
        comment="更新时间"
    )
    
    # 关系
    authors: Mapped[List["TopicAuthor"]] = relationship(
        "TopicAuthor", 
        back_populates="topic", 
        cascade="all, delete-orphan"
    )
    
    tags: Mapped[List["TopicTag"]] = relationship(
        "TopicTag", 
        back_populates="topic", 
        cascade="all, delete-orphan"
    )
    
    likes: Mapped[List["TopicLike"]] = relationship(
        "TopicLike", 
        back_populates="topic", 
        cascade="all, delete-orphan"
    )

    def __str__(self) -> str:
        return self.title or f"Topic#{self.id}"

    # 复合索引
    __table_args__ = (
        Index('idx_status_active', 'status', 'is_active'),
    )


# ============================================================
# 🆕 TopicAuthor 表（话题作者关联）
# ============================================================
class TopicAuthor(Base):
    __tablename__ = "topic_authors"
    
    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="记录ID"
    )
    
    topic_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("topics.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="话题ID"
    )
    
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="作者用户ID"
    )
    
    is_primary: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        nullable=False, 
        comment="是否为主要作者（每个话题只有一个）"
    )
    
    electrolyte_share: Mapped[float] = mapped_column(
        Float, 
        default=0.0, 
        nullable=False, 
        comment="电解液分配比例（0-100），由主要作者设置"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        comment="添加时间"
    )
    
    # 关系
    topic: Mapped["Topic"] = relationship("Topic", back_populates="authors")
    user: Mapped["User"] = relationship("User")
    
    # 唯一约束：一个用户在一个话题中只能有一条记录
    __table_args__ = (
        Index('idx_topic_user_unique', 'topic_id', 'user_id', unique=True),
    )


# ============================================================
# 🆕 Tag 表（标签）
# ============================================================
class Tag(Base):
    __tablename__ = "tags"
    
    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="标签ID"
    )
    
    name: Mapped[str] = mapped_column(
        String(50), 
        unique=True, 
        nullable=False,
        index=True,
        comment="标签名称（如：情感、关系）"
    )
    
    slug: Mapped[str] = mapped_column(
        String(50), 
        unique=True, 
        nullable=False,
        index=True,
        comment="URL友好名称（如：emotion、relationship）"
    )
    
    description: Mapped[Optional[str]] = mapped_column(
        String(200), 
        nullable=True, 
        comment="标签描述"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        comment="创建时间"
    )
    
    def __str__(self) -> str:
        return self.name or f"Tag#{self.id}"

    # 关系
    topics: Mapped[List["TopicTag"]] = relationship(
        "TopicTag", 
        back_populates="tag", 
        cascade="all, delete-orphan"
    )


# ============================================================
# 🆕 TopicTag 表（话题-标签关联）
# ============================================================
class TopicTag(Base):
    __tablename__ = "topic_tags"
    
    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="记录ID"
    )
    
    topic_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("topics.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="话题ID"
    )
    
    tag_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("tags.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="标签ID"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow,
        comment="关联时间"
    )
    
    # 关系
    topic: Mapped["Topic"] = relationship("Topic", back_populates="tags")
    tag: Mapped["Tag"] = relationship("Tag", back_populates="topics")
    
    # 唯一约束：一个话题-标签组合只能有一条记录
    __table_args__ = (
        Index('idx_topic_tag_unique', 'topic_id', 'tag_id', unique=True),
    )


# ============================================================
# 🆕 TopicLike 表（点赞记录）
# ============================================================
class TopicLike(Base):
    __tablename__ = "topic_likes"
    
    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="记录ID"
    )
    
    topic_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("topics.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="话题ID"
    )
    
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True,
        comment="用户ID"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        default=datetime.utcnow, 
        comment="点赞时间"
    )
    
    # 关系
    topic: Mapped["Topic"] = relationship("Topic", back_populates="likes")
    user: Mapped["User"] = relationship("User")
    
    # 唯一约束：一个用户只能给一个话题点赞一次
    __table_args__ = (
        Index('idx_topic_user_like_unique', 'topic_id', 'user_id', unique=True),
    )


# ============================================================
# Session 表（修改版 - 添加topic_prompt字段）
# ============================================================
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )

    mode: Mapped[int] = mapped_column(Integer, nullable=False)
    topic_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # 话题快照
    topic_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None, comment="话题提示词快照（用于model1），即使话题删除也能继续对话")
    topic_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, default=None)
    topic_tags_snapshot: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    topic_version: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

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

    # 话题不可用标记
    topic_unavailable: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="话题已下架/删除，对话不可继续"
    )
    topic_unavailable_reason: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, default=None,
        comment="不可用原因"
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
# Message 表（保持原样）
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
# TraitProfile 表
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
# Notification 表
# ============================================================

class Notification(Base):
    """
    通知表 — 事件写入，读后删除

    写入时机：话题状态变更（审核通过/拒绝/管理员下架）时，向所有作者写入通知
    消费时机：用户查看/编辑某话题时，删除该话题对应的通知
    红点判断：表中有该用户的记录就亮红点，没有就灭
    """
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, comment="通知ID"
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="通知接收人"
    )

    module: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="来源模块（如 topic，便于未来扩展）"
    )

    ref_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="关联对象 ID（如 topic_id）"
    )

    type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="通知类型（approved / rejected / deactivated）"
    )

    message: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="",
        comment="通知文案"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        comment="创建时间"
    )

    # 关系
    user: Mapped["User"] = relationship("User")

    # 复合索引
    __table_args__ = (
        Index('idx_user_module', 'user_id', 'module'),
        Index('idx_user_module_ref', 'user_id', 'module', 'ref_id'),
    )


# ============================================================
# SensitiveWord 表
# ============================================================
class SensitiveWord(Base):
    """敏感词表"""
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
# NicknameHistory 表（保持原样）
# ============================================================
class NicknameHistory(Base):
    """昵称修改历史表"""
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

    user: Mapped["User"] = relationship("User", back_populates="nickname_histories")

# ============================================================
# ElectrolyteLog 表（电解液流水记录）
# ============================================================
class ElectrolyteLog(Base):
    """
    电解液变动流水

    reason 枚举：
        checkin              每日签到（+）
        topic_donation_out   投喂话题支出（-）
        topic_donation_in    收到话题投喂收入（+）
        self_donation_out    自我投喂支出（-）
        self_donation_in     自我投喂收入（+）
        admin_gift           管理员充值（+）
        change_nickname      修改昵称支出（-）
    """
    __tablename__ = "electrolyte_logs"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True, comment="流水ID"
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
        comment="用户ID"
    )
    amount: Mapped[float] = mapped_column(
        Float, nullable=False,
        comment="变动金额（正=收入, 负=支出）"
    )
    reason: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="变动原因"
    )
    ref_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="关联对象 ID（如 topic_id）"
    )
    ref_name: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="冗余名称（如话题标题）"
    )
    balance_after: Mapped[float] = mapped_column(
        Float, nullable=False,
        comment="操作后余额"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow,
        index=True, comment="创建时间"
    )

    user: Mapped["User"] = relationship("User", back_populates="electrolyte_logs")
