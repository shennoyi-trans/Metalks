# backend/services/history_manager.py
"""
HistoryManager: 专门负责每个 session 的对话历史。
你后续想做数据库、本地缓存、摘要、embedding，都可以扩展这里。
"""

from typing import List, Dict, Optional
from collections import defaultdict


class HistoryManager:

    def __init__(self):
        # 一个简单的 session → 对话列表 映射
        # 每条元素为 {"role": "user"/"assistant", "content": "..."}
        self.histories = defaultdict(list)

    def get(self, session_id: str) -> List[Dict]:
        """获取某 session 的完整对话历史"""
        return self.histories[session_id]

    def add(self, session_id: str, role: str, content: str):
        """向某 session 添加一条对话"""
        self.histories[session_id].append({
            "role": role,
            "content": content
        })

    def clear(self, session_id: str):
        """清空某 session 的历史"""
        self.histories[session_id] = []

    def last(self, session_id: str) -> Optional[Dict]:
        """返回最后一条消息"""
        if not self.histories[session_id]:
            return None
        return self.histories[session_id][-1]
