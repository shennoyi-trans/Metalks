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
            yield ""   # type: ignore

    async def close(self) -> None:
        """
        默认关闭钩子。
        对于没有连接池/会话需要释放的客户端，可直接继承此空实现。
        """
        return None
