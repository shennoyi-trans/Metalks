# backend/services/chat_service.py

"""
业务逻辑层：你只需要写这里！
负责：
1. 管理 history
2. 调用 llm_client.chat_stream()
3. 做任何你想加的逻辑
"""

from typing import Optional, List, Dict
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.services.history_manager import HistoryManager

class ChatService:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.sessions = {}   # MVP 简单使用内存存储

    def get_history(self, session_id: str) -> List[Dict]:
        return self.sessions.get(session_id, [])

    def add_to_history(self, session_id: str, role: str, content: str):
        self.sessions.setdefault(session_id, []).append({
            "role": role,
            "content": content
        })

    async def stream_response(self, session_id: str, mode: int, user_input: str):
        """
        在 API 层调用，返回一个 async generator。
        """

        # 用户说话
        self.add_to_history(session_id, "user", user_input)

        # system prompt
        system_prompt = load_prompt("sys.txt")

        # 获取 history
        history = self.get_history(session_id)

        #判断模式：1为观念测试，2为特质总结
        mode_prompt = '\0'
        
        if mode == 1:
            mode_prompt = load_prompt("opinion_test/intro.txt")
        
        if mode == 2:
            mode_prompt = load_prompt("trait_analysis/intro.txt")
        
        # 调用大模型流式生成
        async for chunk in self.llm.chat_stream(system_prompt, mode_prompt, user_input, history):
            yield chunk

        # 模型回复，塞到 history （这里仅记录简略内容）
        self.add_to_history(session_id, "assistant", "<LLM 回复已发送>")

