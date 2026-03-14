# backend/llm_client/mock_client.py
"""
Mock 模型：不花钱，用于测试界面与逻辑。
"""

import asyncio
from typing import AsyncGenerator, Optional, List, Dict

from .base import LLMClient


class MockClient(LLMClient):
    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[str, None]:

        if history is None:
            history = []

        fake_answer = "这是 mock 模型返回的测试内容。\n第二行测试。\n第三行测试。"
        for line in fake_answer.split("\n"):
            await asyncio.sleep(0.3)
            yield line

    async def close(self) -> None:
        return None
