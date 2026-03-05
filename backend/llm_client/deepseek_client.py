# backend/llm_client/deepseek_client.py
import asyncio
import json
import logging
import aiohttp
from typing import AsyncGenerator, Optional, List, Dict
from .base import LLMClient

logger = logging.getLogger("llm.deepseek")
_DEFAULT_TIMEOUT = aiohttp.ClientTimeout(connect=10, total=180)


class DeepSeekClient(LLMClient):

    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.model = model
        self.url = "https://api.deepseek.com/v1/chat/completions"
        self._session: Optional[aiohttp.ClientSession] = None
        self._lock = asyncio.Lock()  # 防止并发创建多个 Session

    # 懒创建 + 复用 ClientSession + Lock 保护
    async def _get_session(self) -> aiohttp.ClientSession:
        async with self._lock:
            if self._session is None or self._session.closed:
                self._session = aiohttp.ClientSession(
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=_DEFAULT_TIMEOUT,
                )
            return self._session

    # 应用关闭时释放连接池
    async def close(self):
        async with self._lock:
            if self._session and not self._session.closed:
                await self._session.close()

    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[Dict]] = None,
    ) -> AsyncGenerator[str, None]:

        messages: List[Dict] = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_prompt})

        body = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }

        session = await self._get_session()

        async with session.post(self.url, json=body) as resp:
            # HTTP 状态码检查
            if resp.status != 200:
                error_text = await resp.text()
                logger.error("DeepSeek API error %s: %s", resp.status, error_text)
                raise RuntimeError(f"DeepSeek API 返回 {resp.status}")

            async for line in resp.content:
                decoded = line.decode("utf-8").strip()
                if not decoded.startswith("data: "):
                    continue

                data = decoded[6:]
                if data == "[DONE]":
                    break

                try:
                    obj = json.loads(data)
                    chunk = obj["choices"][0]["delta"].get("content", "")
                    if chunk:
                        yield chunk
                # 精确异常（替代裸 except）
                except (json.JSONDecodeError, KeyError, IndexError) as exc:
                    logger.debug("跳过无法解析的 SSE 帧: %s", exc)
                    continue
