# backend/llm_client/deepseek_client.py
"""
DeepSeek 客户端：使用流式 API（stream=True）
逐块返回 token，让前端逐行显示。
"""

import aiohttp
from typing import Dict, List, AsyncGenerator
from .base import LLMClient
from typing import Optional, List, Dict
import json



class DeepSeekClient(LLMClient):

    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.model = model
        self.url = "https://api.deepseek.com/v1/chat/completions"

    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[str, None]:
        
        if history is None:
            history = []


        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # ===============================
        # 构建 messages（模型所需格式）
        # ===============================
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages += history

        messages.append({"role": "user", "content": user_prompt})

        body = {
            "model": self.model,
            "messages": messages,
            "stream": True,   # ⚠️ 必须开启流式模式！
        }

        # ===============================
        # 使用 SSE 流式接收结果
        # ===============================
        async with aiohttp.ClientSession() as session:
            async with session.post(self.url, headers=headers, json=body) as resp:

                async for line in resp.content:
                    decoded = line.decode("utf-8")

                    if decoded.strip().startswith("data: "):
                        data = decoded[6:]
                        if data == "[DONE]":
                            break

                        try:
                            obj = json.loads(data)
                            chunk = obj["choices"][0]["delta"].get("content", "")
                            if chunk:
                                yield chunk  # ⬅️ 每次返回一个小片段
                        except:
                            continue
