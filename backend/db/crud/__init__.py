# backend/db/crud/__init__.py
"""
CRUD 层统一导入文件

使用方式：
    from backend.db.crud import user, nickname, electrolyte
    
    user_obj = await user.get_user_by_id(db, user_id)
    await nickname.update_nickname(db, user_id, "new_name")
"""

from . import user
from . import nickname
from . import electrolyte

__all__ = ["user", "nickname", "electrolyte"]
