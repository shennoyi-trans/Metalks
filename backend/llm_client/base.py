# backend/llm_client/base.py
from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Optional


class LLMClient(ABC):

    @abstractmethod
    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[str, None]:
        """
        流式输出接口
        注意：为了让类型检查通过，我们必须包含一个 'yield' 占位。
        """
        if False:
            # 占位，让这个函数被识别为 async generator
            yield ""   # type: ignore