# backend/admin_panel.py
"""
SQLAdmin 管理后台
访问地址：https://metalks.me/admin
要求：用户必须登录且 is_admin=True
"""

from sqladmin import Admin, ModelView
from fastapi import Request, HTTPException
from backend.db.models import User, Session, Message, TraitProfile
from backend.core.security import decode_access_token


# ============================================================
# 自定义认证中间件
# ============================================================
class AdminAuth:
    """管理员权限检查"""
    
    async def authenticate(self, request: Request) -> bool:
        """
        验证用户是否有管理员权限
        返回 True 表示允许访问，False 则重定向到登录页
        """
        # 1. 从Cookie获取Token
        token = request.cookies.get("access_token")
        if not token:
            return False
        
        # 2. 解码Token获取用户ID
        payload = decode_access_token(token)
        if not payload:
            return False
        
        user_id = payload.get("sub")
        if not user_id:
            return False
        
        # 3. 从数据库查询用户的admin状态
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
# 定义各个模型的管理视图
# ============================================================

class UserAdmin(ModelView, model=User):
    """用户管理"""
    name = "用户"
    name_plural = "用户管理"
    icon = "fa-solid fa-user"
    
    # 列表页显示的字段
    column_list = [User.id, User.email, User.is_admin, User.created_at]
    
    # 详情页显示的字段
    column_details_list = [
        User.id, 
        User.email, 
        User.is_admin, 
        User.created_at
    ]
    
    # 可搜索字段
    column_searchable_list = [User.email]
    
    # 可排序字段
    column_sortable_list = [User.id, User.email, User.created_at]
    
    # 可编辑字段（注意：不暴露密码）
    form_columns = [User.email, User.is_admin]
    
    # 默认排序
    column_default_sort = [(User.id, True)]  # 按ID降序


class SessionAdmin(ModelView, model=Session):
    """会话管理"""
    name = "会话"
    name_plural = "会话管理"
    icon = "fa-solid fa-comments"
    
    column_list = [
        Session.id, 
        Session.user_id, 
        Session.mode, 
        Session.topic_id,
        Session.is_completed,
        Session.report_ready,
        Session.created_at
    ]
    
    column_details_list = [
        Session.id,
        Session.user_id,
        Session.mode,
        Session.topic_id,
        Session.is_completed,
        Session.report_ready,
        Session.deleted_at,
        Session.created_at,
        Session.updated_at
    ]
    
    column_searchable_list = [Session.id]
    column_sortable_list = [Session.created_at, Session.user_id]
    column_default_sort = [(Session.created_at, True)]


class MessageAdmin(ModelView, model=Message):
    """消息管理"""
    name = "消息"
    name_plural = "消息记录"
    icon = "fa-solid fa-message"
    
    column_list = [
        Message.id,
        Message.session_id,
        Message.role,
        Message.created_at
    ]
    
    column_details_list = [
        Message.id,
        Message.session_id,
        Message.role,
        Message.content,
        Message.created_at
    ]
    
    column_searchable_list = [Message.session_id, Message.content]
    column_sortable_list = [Message.created_at]
    column_default_sort = [(Message.created_at, True)]


class TraitProfileAdmin(ModelView, model=TraitProfile):
    """特质画像管理"""
    name = "特质画像"
    name_plural = "特质画像"
    icon = "fa-solid fa-brain"
    
    column_list = [
        TraitProfile.id,
        TraitProfile.user_id,
        TraitProfile.summary,
        TraitProfile.updated_at
    ]
    
    column_details_list = [
        TraitProfile.id,
        TraitProfile.user_id,
        TraitProfile.summary,
        TraitProfile.full_report,
        TraitProfile.updated_at
    ]
    
    column_searchable_list = [TraitProfile.summary]
    column_sortable_list = [TraitProfile.updated_at]
    column_default_sort = [(TraitProfile.updated_at, True)]


# ============================================================
# 初始化Admin实例的工厂函数
# ============================================================
def create_admin(app, engine):
    """
    创建并配置SQLAdmin实例
    
    参数：
        app: FastAPI应用实例
        engine: SQLAlchemy异步引擎
    
    返回：
        Admin实例
    """
    admin = Admin(
        app=app,
        engine=engine,
        title="Metalks 管理后台",
        base_url="/admin",
        authentication_backend=AdminAuth()
    )
    
    # 注册所有模型视图
    admin.add_view(UserAdmin)
    admin.add_view(SessionAdmin)
    admin.add_view(MessageAdmin)
    admin.add_view(TraitProfileAdmin)
    
    return admin
