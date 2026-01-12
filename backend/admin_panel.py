# backend/admin_panel.py
"""
SQLAdmin 管理后台（自动推断字段版）
访问地址：https://metalks.me/admin
"""

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from backend.db.models import User, Session, Message, TraitProfile
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
# 极简模型视图（自动推断所有字段）
# ============================================================

class UserAdmin(ModelView, model=User):
    """用户管理"""
    name = "用户"
    name_plural = "用户管理"
    icon = "fa-solid fa-user"
    
    # ✅ 不指定 column_list，自动显示所有字段
    # column_list = None  # 默认就是 None
    
    # ✅ 只配置必要的选项
    column_searchable_list = ["email"]
    column_default_sort = ("id", True)
    
    # ✅ 隐藏敏感字段
    column_exclude_list = ["password_hash"]
    form_excluded_columns = ["password_hash", "created_at"]


class SessionAdmin(ModelView, model=Session):
    """会话管理"""
    name = "会话"
    name_plural = "会话管理"
    icon = "fa-solid fa-comments"
    
    column_searchable_list = ["id"]
    column_default_sort = ("created_at", True)


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
    
    admin.add_view(UserAdmin)
    admin.add_view(SessionAdmin)
    admin.add_view(MessageAdmin)
    admin.add_view(TraitProfileAdmin)
    
    return admin