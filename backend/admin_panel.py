# backend/admin_panel.py
"""
SQLAdmin 管理后台（自动推断字段版 + v1.4话题系统）
访问地址：https://metalks.me/admin
"""

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from backend.db.models import (
    User, Session, Message, TraitProfile, 
    SensitiveWord, NicknameHistory,
    Topic, Tag, TopicAuthor, TopicTag, TopicLike  # 🆕 v1.4
)
from backend.core.security import decode_access_token


# ============================================================
# 认证后端
# ============================================================
class AdminAuth(AuthenticationBackend):
    """管理员权限检查"""
    
    async def login(self, request: Request) -> bool:
        return False
    
    async def logout(self, request: Request) -> bool:
        return True
    
    async def authenticate(self, request: Request) -> bool:
        """验证是否为管理员"""
        token = request.cookies.get("access_token")
        if not token:
            return False
        
        payload = decode_access_token(token)
        if not payload:
            return False
        
        user_id = payload.get("sub")
        if not user_id:
            return False
        
        from sqlalchemy import select
        from backend.db.database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(User.id == int(user_id))
            )
            user = result.scalar_one_or_none()
            
            if not user or not user.is_admin:
                return False
        
        return True


# ============================================================
# 核心功能模型视图
# ============================================================

class UserAdmin(ModelView, model=User):
    """用户管理"""
    name = "用户"
    name_plural = "用户管理"
    icon = "fa-solid fa-user"
    
    column_searchable_list = ["email", "nickname"]
    column_default_sort = ("id", True)
    
    # 隐藏敏感字段
    column_exclude_list = ["password_hash"]
    form_excluded_columns = ["password_hash", "created_at"]


class SessionAdmin(ModelView, model=Session):
    """会话管理"""
    name = "会话"
    name_plural = "会话管理"
    icon = "fa-solid fa-comments"

    column_searchable_list = ["id"]
    column_default_sort = ("created_at", True)

    # 列表字段（便于排查话题快照/报告状态）
    column_list = [
        "id",
        "user_id",
        "mode",
        "topic_id",
        "topic_title",
        "is_completed",
        "report_ready",
        "deleted_at",
        "created_at",
    ]

    # 避免在后台误改关键快照/报告内容
    form_excluded_columns = [
        "topic_prompt",
        "topic_title",
        "topic_tags_snapshot",
        "topic_version",
        "opinion_report",
        "created_at",
        "updated_at",
        "messages",
        "user",
    ]


class MessageAdmin(ModelView, model=Message):
    """消息管理"""
    name = "消息"
    name_plural = "消息记录"
    icon = "fa-solid fa-message"
    
    column_searchable_list = ["session_id", "content"]
    column_default_sort = ("created_at", True)


class TraitProfileAdmin(ModelView, model=TraitProfile):
    """特质画像管理"""
    name = "特质画像"
    name_plural = "特质画像"
    icon = "fa-solid fa-brain"
    
    column_searchable_list = ["summary"]
    column_default_sort = ("updated_at", True)


class SensitiveWordAdmin(ModelView, model=SensitiveWord):
    """敏感词管理"""
    name = "敏感词"
    name_plural = "敏感词库"
    icon = "fa-solid fa-ban"
    
    column_searchable_list = ["word"]
    column_default_sort = ("created_at", True)
    
    form_excluded_columns = ["created_at"]


class NicknameHistoryAdmin(ModelView, model=NicknameHistory):
    """昵称修改历史管理"""
    name = "昵称历史"
    name_plural = "昵称修改记录"
    icon = "fa-solid fa-clock-rotate-left"
    
    column_searchable_list = ["old_nickname", "new_nickname"]
    column_default_sort = ("created_at", True)
    
    form_excluded_columns = ["created_at"]
    can_create = False
    can_edit = False


# ============================================================
# 🆕 v1.4: 话题系统模型视图
# ============================================================

class TopicAdmin(ModelView, model=Topic):
    """话题管理"""
    name = "话题"
    name_plural = "话题管理"
    icon = "fa-solid fa-lightbulb"

    # 搜索配置
    column_searchable_list = ["title", "prompt", "content"]
    column_default_sort = ("created_at", True)

    # 列表显示的字段（与models保持一致）
    column_list = [
        "id",
        "title",
        "is_official",
        "status",
        "is_active",
        "likes_count",
        "electrolyte_received",
        "created_at",
        "updated_at",
    ]

    # 表单排除字段（统计/时间戳/关系字段）
    form_excluded_columns = [
        "created_at",
        "updated_at",
        "likes_count",
        "electrolyte_received",
        "authors",
        "tags",
        "likes",
    ]

    # 字段说明
    column_labels = {
        "id": "ID",
        "title": "标题",
        "content": "内容",
        "prompt": "提示词",
        "is_official": "官方话题",
        "status": "审核状态",
        "is_active": "启用状态",
        "likes_count": "点赞数",
        "electrolyte_received": "累计收到电解液",
        "created_at": "创建时间",
        "updated_at": "更新时间",
    }


class TagAdmin(ModelView, model=Tag):
    """标签管理"""
    name = "标签"
    name_plural = "标签管理"
    icon = "fa-solid fa-tag"

    column_searchable_list = ["name", "slug"]
    column_default_sort = ("name", False)

    column_list = ["id", "name", "slug", "description", "created_at"]

    form_excluded_columns = [
        "created_at",
        "topics",  # 关系字段
    ]

    column_labels = {
        "id": "ID",
        "name": "标签名",
        "slug": "Slug",
        "description": "描述",
        "created_at": "创建时间",
    }


class TopicAuthorAdmin(ModelView, model=TopicAuthor):
    """话题作者关联管理"""
    name = "话题作者"
    name_plural = "话题作者关联"
    icon = "fa-solid fa-user-pen"

    column_default_sort = ("created_at", True)

    column_list = [
        "id",
        "topic_id",
        "user_id",
        "is_primary",
        "electrolyte_share",
        "created_at",
    ]

    form_excluded_columns = ["created_at"]

    column_labels = {
        "id": "ID",
        "topic_id": "话题ID",
        "user_id": "用户ID",
        "is_primary": "主要作者",
        "electrolyte_share": "电解液分成(%)",
        "created_at": "添加时间",
    }


class TopicTagAdmin(ModelView, model=TopicTag):
    """话题标签关联管理"""
    name = "话题标签"
    name_plural = "话题标签关联"
    icon = "fa-solid fa-tags"

    column_default_sort = ("topic_id", False)

    column_list = [
        "id",
        "topic_id",
        "tag_id",
        "created_at",
    ]

    form_excluded_columns = ["created_at"]

    column_labels = {
        "id": "ID",
        "topic_id": "话题ID",
        "tag_id": "标签ID",
        "created_at": "关联时间",
    }


class TopicLikeAdmin(ModelView, model=TopicLike):
    """话题点赞记录管理（只读）"""
    name = "话题点赞"
    name_plural = "话题点赞记录"
    icon = "fa-solid fa-heart"
    
    column_default_sort = ("created_at", True)
    
    column_list = [
        "id",
        "topic_id",
        "user_id",
        "created_at"
    ]
    
    form_excluded_columns = ["created_at"]
    
    # 设置为只读（不允许手动创建/编辑点赞）
    can_create = False
    can_edit = False
    
    column_labels = {
        "id": "ID",
        "topic_id": "话题ID",
        "user_id": "用户ID",
        "created_at": "点赞时间"
    }


# ============================================================
# 创建 Admin 实例
# ============================================================
def create_admin(app, engine):
    """创建并配置SQLAdmin实例"""
    admin = Admin(
        app=app,
        engine=engine,
        title="Metalks 管理后台",
        base_url="/admin",
        authentication_backend=AdminAuth(secret_key="metalks-admin-secret-key-change-me")
    )
    
    # 核心功能模块
    admin.add_view(UserAdmin)
    admin.add_view(SessionAdmin)
    admin.add_view(MessageAdmin)
    admin.add_view(TraitProfileAdmin)
    
    # 辅助功能模块
    admin.add_view(SensitiveWordAdmin)
    admin.add_view(NicknameHistoryAdmin)
    
    # 🆕 v1.4: 话题系统模块
    admin.add_view(TopicAdmin)
    admin.add_view(TagAdmin)
    admin.add_view(TopicAuthorAdmin)
    admin.add_view(TopicTagAdmin)
    admin.add_view(TopicLikeAdmin)
    
    return admin
