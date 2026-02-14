# backend/admin_panel.py
"""
SQLAdmin 管理后台（v1.4 话题系统）
访问地址：https://metalks.me/admin
"""

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request

from backend.core.security import decode_access_token
from backend.db.database import get_sessionmaker
from backend.db.models import (
    Message,
    NicknameHistory,
    SensitiveWord,
    Session,
    Tag,
    Topic,
    TopicAuthor,
    TopicLike,
    TopicTag,
    TraitProfile,
    User,
)


# ============================================================
# 认证后端
# ============================================================
class AdminAuth(AuthenticationBackend):
    """Cookie‑based 管理员权限校验"""

    async def login(self, request: Request) -> bool:
        return False  # 登录由前端 JWT 流程完成，此处不提供表单登录

    async def logout(self, request: Request) -> bool:
        return True

    async def authenticate(self, request: Request) -> bool:
        token = request.cookies.get("access_token")
        if not token:
            return False

        payload = decode_access_token(token)
        if not payload:
            return False

        user_id = payload.get("sub")
        if not user_id:
            return False

        # ✅ 修复：使用 get_sessionmaker() 替代不存在的 AsyncSessionLocal
        async with get_sessionmaker()() as db:
            user = (
                await db.execute(
                    select(User).where(User.id == int(user_id))
                )
            ).scalar_one_or_none()

        return bool(user and user.is_admin)


# ============================================================
# 辅助：批量生成 column_labels 的快捷映射
# ============================================================
_COMMON_LABELS: dict[str, str] = {
    "id": "ID",
    "user_id": "用户ID",
    "topic_id": "话题ID",
    "tag_id": "标签ID",
    "created_at": "创建时间",
    "updated_at": "更新时间",
}


def _labels(**extra: str) -> dict[str, str]:
    """合并公共标签与额外标签，减少重复代码。"""
    merged = {k: v for k, v in _COMMON_LABELS.items()}
    merged.update(extra)
    return merged


# ============================================================
# 核心功能
# ============================================================

class UserAdmin(ModelView, model=User):
    name = "用户"
    name_plural = "用户管理"
    icon = "fa-solid fa-user"

    column_searchable_list = ["email", "nickname"]
    column_default_sort = ("id", True)
    column_exclude_list = ["password_hash"]
    form_excluded_columns = ["password_hash", "created_at"]


class SessionAdmin(ModelView, model=Session):
    name = "会话"
    name_plural = "会话管理"
    icon = "fa-solid fa-comments"

    column_searchable_list = ["id"]
    column_default_sort = ("created_at", True)

    column_list = [
        "id", "user_id", "mode", "topic_id", "topic_title",
        "is_completed", "report_ready", "deleted_at", "created_at",
    ]

    form_excluded_columns = [
        "topic_prompt", "topic_title", "topic_tags_snapshot",
        "topic_version", "opinion_report",
        "created_at", "updated_at", "messages", "user",
    ]


class MessageAdmin(ModelView, model=Message):
    name = "消息"
    name_plural = "消息记录"
    icon = "fa-solid fa-message"

    column_searchable_list = ["session_id", "content"]
    column_default_sort = ("created_at", True)


class TraitProfileAdmin(ModelView, model=TraitProfile):
    name = "特质画像"
    name_plural = "特质画像"
    icon = "fa-solid fa-brain"

    column_searchable_list = ["summary"]
    column_default_sort = ("updated_at", True)


# ============================================================
# 辅助功能
# ============================================================

class SensitiveWordAdmin(ModelView, model=SensitiveWord):
    name = "敏感词"
    name_plural = "敏感词库"
    icon = "fa-solid fa-ban"

    column_searchable_list = ["word"]
    column_default_sort = ("created_at", True)
    form_excluded_columns = ["created_at"]


class NicknameHistoryAdmin(ModelView, model=NicknameHistory):
    name = "昵称历史"
    name_plural = "昵称修改记录"
    icon = "fa-solid fa-clock-rotate-left"

    column_searchable_list = ["old_nickname", "new_nickname"]
    column_default_sort = ("created_at", True)
    form_excluded_columns = ["created_at"]
    can_create = False
    can_edit = False


# ============================================================
# 话题系统（v1.4）
# ============================================================

class TopicAdmin(ModelView, model=Topic):
    name = "话题"
    name_plural = "话题管理"
    icon = "fa-solid fa-lightbulb"

    column_searchable_list = ["title", "prompt", "content"]
    column_default_sort = ("created_at", True)

    column_list = [
        "id", "title", "is_official", "status", "is_active",
        "likes_count", "electrolyte_received", "created_at", "updated_at",
    ]

    form_excluded_columns = [
        "created_at", "updated_at",
        "likes_count", "electrolyte_received",
        "authors", "tags", "likes",
    ]

    column_labels = _labels(
        title="标题", content="内容", prompt="提示词",
        is_official="官方话题", status="审核状态", is_active="启用状态",
        likes_count="点赞数", electrolyte_received="累计收到电解液",
    )


class TagAdmin(ModelView, model=Tag):
    name = "标签"
    name_plural = "标签管理"
    icon = "fa-solid fa-tag"

    column_searchable_list = ["name", "slug"]
    column_default_sort = ("name", False)

    column_list = ["id", "name", "slug", "description", "created_at"]
    form_excluded_columns = ["created_at", "topics"]

    column_labels = _labels(
        name="标签名", slug="Slug", description="描述",
    )


class TopicAuthorAdmin(ModelView, model=TopicAuthor):
    name = "话题作者"
    name_plural = "话题作者关联"
    icon = "fa-solid fa-user-pen"

    column_default_sort = ("created_at", True)

    column_list = [
        "id", "topic_id", "user_id",
        "is_primary", "electrolyte_share", "created_at",
    ]

    form_excluded_columns = ["created_at"]

    column_labels = _labels(
        is_primary="主要作者",
        electrolyte_share="电解液分成(%)",
    )


class TopicTagAdmin(ModelView, model=TopicTag):
    name = "话题标签"
    name_plural = "话题标签关联"
    icon = "fa-solid fa-tags"

    column_default_sort = ("topic_id", False)

    column_list = ["id", "topic_id", "tag_id", "created_at"]
    form_excluded_columns = ["created_at"]

    column_labels = _labels()


class TopicLikeAdmin(ModelView, model=TopicLike):
    name = "话题点赞"
    name_plural = "话题点赞记录"
    icon = "fa-solid fa-heart"

    column_default_sort = ("created_at", True)

    column_list = ["id", "topic_id", "user_id", "created_at"]
    form_excluded_columns = ["created_at"]

    can_create = False
    can_edit = False

    column_labels = _labels()


# ============================================================
# 创建 Admin 实例
# ============================================================

# 注册顺序 = 侧边栏显示顺序
_VIEWS: list[type[ModelView]] = [
    # 核心
    UserAdmin, SessionAdmin, MessageAdmin, TraitProfileAdmin,
    # 辅助
    SensitiveWordAdmin, NicknameHistoryAdmin,
    # 话题系统
    TopicAdmin, TagAdmin, TopicAuthorAdmin, TopicTagAdmin, TopicLikeAdmin,
]


def create_admin(app, engine) -> Admin:
    """创建并配置 SQLAdmin 实例。"""
    admin = Admin(
        app=app,
        engine=engine,
        title="Metalks 管理后台",
        base_url="/admin",
        authentication_backend=AdminAuth(
            secret_key="metalks-admin-secret-key-change-me",
        ),
    )

    for view_cls in _VIEWS:
        admin.add_view(view_cls)

    return admin
