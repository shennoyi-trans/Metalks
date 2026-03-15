# backend/db/crud/__init__.py
"""
CRUD 层统一导入文件 - v1.4 话题系统

使用方式：
    from backend.db.crud import user, nickname, electrolyte, topic, tag, topic_author, topic_like
    
    # 用户相关
    user_obj = await user.get_user_by_id(db, user_id)
    
    # 话题相关
    topic_obj = await topic.get_topic_by_id(db, topic_id)
    await topic_like.toggle_like(db, user_id, topic_id)
"""

from . import user
from . import nickname

# v1.3 电解质系统
from . import electrolyte
from . import electrolyte_log

# v1.4 话题系统
from . import topic
from . import tag
from . import topic_author
from . import topic_like

__all__ = [
    "user", 
    "nickname", 
    "electrolyte",
    "electrolyte_log",
    "topic",
    "tag",
    "topic_author",
    "topic_like"
]
