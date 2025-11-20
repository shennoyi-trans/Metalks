# backend/services/chat_service.py

from typing import AsyncGenerator, Optional, List, Dict
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.data.topics import TOPICS
from backend.services.history_manager import HistoryManager


class ChatService:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.history_mgr = HistoryManager()

    async def stream_response(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        user_input: str,
        is_first: bool = False,
    ) -> AsyncGenerator[str, None]:
        """
        根据 mode 和 is_first 决定：
        - 是否需要 topic_id
        - 谁先说话（用户 / 模型）
        """

        # ======================
        # 1. 决定 system_prompt
        # ======================
        system_prompt = load_prompt("model1/system.txt")

        # ======================
        # 2. mode1：话题测试
        # ======================
        if mode == 1:
            if topic_id is None:
                # 严格一点：mode1 必须有 topic_id
                raise ValueError("mode1 requires topic_id")

            # 找到对应的话题配置
            topic = next((t for t in TOPICS if t["id"] == topic_id), None)
            if topic is None:
                raise ValueError(f"invalid topic_id: {topic_id}")

            # 载入话题 prompt，例如“工作观”的引导
            topic_prompt = load_prompt(topic["prompt_path"])

            # 第一轮：模型先说（用户不说话）
            if is_first:
                # 不记录用户输入（因为此时用户没说话）
                history: List[Dict] = self.history_mgr.get(session_id)

                # 模型拿到 topic_prompt，自行发起开场
                final_prompt = topic_prompt

                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history
                ):
                    # 这里逐块返回模型的开场白
                    yield chunk

                # 将模型完整回复加入历史（你可以在外面拼接完整内容再保存）
                self.history_mgr.add(session_id, "assistant", "<开场白已发送>")
                return

            else:
                # 非第一轮：用户已经说话了
                # 先把用户输入写入历史
                self.history_mgr.add(session_id, "user", user_input)
                history = self.history_mgr.get(session_id)

                # 把话题 prompt + 用户输入一起发给模型
                final_prompt = topic_prompt + "\n\n" + user_input

                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history
                ):
                    yield chunk

                # TODO: 这里可以把完整回复收集下来再写入 history
                self.history_mgr.add(session_id, "assistant", "<模型回复已发送>")
                return

        # ======================
        # 3. mode2：随便聊聊
        # ======================
        elif mode == 2:
            # mode2 不需要 topic_id，用户先说
            # 所以第一轮和后续轮完全一样：用户发什么就记什么

            # 写入用户输入
            self.history_mgr.add(session_id, "user", user_input)
            history = self.history_mgr.get(session_id)

            # 载入 mode2 的开场/对话风格 prompt
            mode2_prompt = load_prompt("model1/mode2_intro.txt")

            # 把模式提示 + 用户输入结合成一次完整 prompt
            final_prompt = mode2_prompt + "\n\n" + user_input

            async for chunk in self.llm.chat_stream(
                system_prompt=system_prompt,
                user_prompt=final_prompt,
                history=history
            ):
                yield chunk

            self.history_mgr.add(session_id, "assistant", "<模型回复已发送>")
            return

        # ======================
        # 4. 其它模式（预留）
        # ======================
        else:
            raise ValueError(f"Unknown mode: {mode}")
        
        
        
        
        
        
        '''
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
        '''
