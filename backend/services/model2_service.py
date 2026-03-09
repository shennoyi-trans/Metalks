# backend/services/model2_service.py
"""
model2：负责从对话历史中分析用户的"观念"，并在每轮对话前
为 model1 生成内部建议；在对话结束时生成完整观念报告。

说明：
- llm 由 ChatService 注入（构造时或 attach_llm）
- 长期特质信息 trait_summary / trait_profile 由 ChatService 统一维护，
  调用时以参数形式传入本服务，不在本类中长期存储。
"""

import json
from typing import List, Dict, Optional

from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers


class Model2Service:

    def __init__(self, llm=None):
        self.llm = llm

    def attach_llm(self, llm):
        """允许 ChatService 在初始化后注入 LLMClient。"""
        self.llm = llm

    async def analyze(
        self,
        session_history: List[Dict],
        user_input: str,
        mode: int,
        topic_id: Optional[int],
        topic_title: Optional[str] = None,
        topic_tags: Optional[List[str]] = None,
        trait_summary: str = "",
        trait_profile: str = "",
    ) -> dict:
        """
        每轮对话前调用：
        - 结合历史对话 / 模式 /（可选）话题 /（可选）长期特质
        - 生成对 model1 的"内部对话建议"（advice），用户不可见。
        - 判断是否已捕捉到足够观念（report_ready）

        返回结构：
        {
            "advice": str,
            "signals": {
                "report_ready": bool
            }
        }
        """
        if self.llm is None:
            return {"advice": "", "signals": {"report_ready": False}}

        # ================================
        # 1. 加载分析提示词
        # ================================
        if mode == 1:
            prompt_path = "model2/opinion_analysis_mode1.txt"
        else:
            prompt_path = "model2/opinion_analysis_mode2.txt"

        system_prompt = load_prompt(prompt_path)

        # 若为 mode1，注入话题元数据
        if mode == 1 and topic_title:
            system_prompt += (
                "\n\n# 本次对话的目标话题与观念标签：\n"
                f"- 话题：{topic_title}\n"
            )
            if topic_tags:
                tags_str = "、".join(topic_tags)
                system_prompt += f"- 标签：{tags_str}\n"
            system_prompt += "请在分析时特别聚焦于该话题维度。"

        # 注入长期特质信息
        if trait_summary:
            system_prompt += (
                "\n\n# 用户长期特质总结（一句话）：\n"
                f"{trait_summary}"
            )

        if trait_profile:
            system_prompt += (
                "\n\n# 用户长期特质画像（供参考，不必逐条引用）：\n"
                f"{trait_profile}"
            )

        # ================================
        # 2. 构造 user_prompt
        # ================================
        formatted_history = self._format_history(session_history)

        user_prompt = (
            "以下是当前对话的历史，请根据系统提示中的要求进行分析。\n\n"
            "【对话历史】\n"
            f"{formatted_history}\n\n"
        )

        # ================================
        # 3. 调用 LLM
        # ================================
        advice_text = ""
        async for chunk in self.llm.chat_stream(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            history=[],
        ):
            advice_text += chunk

        advice_text = strip_control_markers(advice_text).strip()

        # ================================
        # 4. 解析 JSON 格式（容错处理）
        # ================================
        try:
            if "```json" in advice_text:
                json_match = advice_text.split("```json")[1].split("```")[0]
                advice_data = json.loads(json_match.strip())
            elif advice_text.startswith("{"):
                advice_data = json.loads(advice_text)
            else:
                advice_data = {
                    "advice": advice_text,
                    "report_ready": False
                }
        except (json.JSONDecodeError, IndexError):
            advice_data = {
                "advice": advice_text,
                "report_ready": False
            }

        return {
            "advice": advice_data.get("advice", ""),
            "signals": {
                "report_ready": bool(advice_data.get("report_ready", False))
            }
        }

    async def final_report(
        self,
        full_history: List[Dict],
        mode: int,
        topic_id: Optional[int],
        topic_title: Optional[str] = None,
        topic_tags: Optional[List[str]] = None,
        trait_summary: str = "",
        trait_profile: str = "",
    ) -> str:
        """
        对话结束后调用：基于完整对话历史，生成观念分析报告（给用户看的）
        """
        if self.llm is None:
            return ""

        # ================================
        # 1. 加载"最终报告"提示词
        # ================================
        if mode == 1:
            prompt_path = "model2/final_report_mode1.txt"
        else:
            prompt_path = "model2/final_report_mode2.txt"

        system_prompt = load_prompt(prompt_path)

        if mode == 1 and topic_title:
            system_prompt += (
                "\n\n# 本次观念报告对应的话题信息：\n"
                f"- 话题：{topic_title}\n"
            )
            if topic_tags:
                tags_str = "、".join(topic_tags)
                system_prompt += f"- 标签：{tags_str}\n"
            system_prompt += "请围绕该话题维度，对用户在本次对话中的观点进行系统性分析。"

        if trait_summary:
            system_prompt += (
                "\n\n# 已有的用户特质总结（一句话）：\n"
                f"{trait_summary}"
            )

        if trait_profile:
            system_prompt += (
                "\n\n# 已有的用户特质画像（此前会话的整体分析）：\n"
                f"{trait_profile}"
            )

        # ================================
        # 2. 格式化完整历史
        # ================================
        formatted_history = self._format_history(full_history)

        user_prompt = (
            "以下是本次完整对话的历史，请根据系统提示词的要求，"
            "生成一份面向用户的观念分析报告。\n\n"
            "【本次对话完整历史】\n"
            f"{formatted_history}"
        )

        # ================================
        # 3. 调用 LLM
        # ================================
        report_text = ""
        async for chunk in self.llm.chat_stream(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            history=[],
        ):
            report_text += chunk

        report_text = strip_control_markers(report_text).strip()
        return report_text

    # =====================================
    # 工具函数
    # =====================================
    def _format_history(self, history: List[Dict]) -> str:
        """将历史转换为易读的多轮对话文本。"""
        lines = []
        for turn in history:
            role = turn.get("role", "")
            content = turn.get("content", "")

            if role == "user":
                prefix = "用户："
            elif role == "assistant":
                prefix = "助手："
            else:
                prefix = f"{role}："

            lines.append(f"{prefix}{content}")
        return "\n".join(lines)