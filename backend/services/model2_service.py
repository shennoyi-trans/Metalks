# backend/services/model2_service.py

import json
from typing import List, Dict, Optional

from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers


class Model2Service:
    """
    model2：负责从对话历史中分析用户的"观念"，并在每轮对话前
    为 model1 生成内部建议；在对话结束时生成完整观念报告。

    说明：
    - llm 由 ChatService 注入（构造时或 attach_llm）
    - 长期特质信息 trait_summary / trait_profile 由 ChatService 统一维护，
      调用时以参数形式传入本服务，不在本类中长期存储。
    """

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
        topic_title: Optional[str] = None,      # 🆕 v1.4
        topic_tags: Optional[List[str]] = None, # 🆕 v1.4
        trait_summary: str = "",
        trait_profile: str = "",
    ) -> dict:
        """
        每轮对话前调用：
        - 结合历史对话 / 模式 /（可选）话题 /（可选）长期特质
        - 生成对 model1 的"内部对话建议"（advice），用户不可见。
        - 判断是否已捕捉到足够观念（report_ready）

        🆕 v1.4 变更：
        - 添加 topic_title 和 topic_tags 参数
        - 不再依赖 TOPICS 字典
        - 由 ChatService 传入话题元数据

        返回结构：
        {
            "advice": str,     # 供 model1 使用的内部建议
            "signals": {
                "report_ready": bool  # 是否可以生成报告
            }
        }
        """
        if self.llm is None:
            # 防御式：尚未注入 llm 时避免崩溃
            return {"advice": "", "signals": {"report_ready": False}}

        # ================================
        # 1. 加载分析提示词（由提示词工程同学维护）
        # ================================
        if mode == 1:
            prompt_path = "model2/opinion_analysis_mode1.txt"
        else:
            prompt_path = "model2/opinion_analysis_mode2.txt"

        system_prompt = load_prompt(prompt_path)

        # 🆕 v1.4：若为 mode1，注入话题元数据（而非从TOPICS字典查询）
        if mode == 1 and topic_title:
            system_prompt += (
                "\n\n# 本次对话的目标话题与观念标签：\n"
                f"- 话题：{topic_title}\n"
            )
            if topic_tags:
                tags_str = "、".join(topic_tags)
                system_prompt += f"- 标签：{tags_str}\n"
            system_prompt += "请在分析时特别聚焦于该话题维度。"

        # 注入长期特质信息（由 ChatService 统一提供）
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
        # 2. 构造 user_prompt（输入给 LLM）
        # ================================
        formatted_history = self._format_history(session_history)

        user_prompt = (
            "以下是当前对话的历史，请根据系统提示中的要求进行分析。"
            "【对话历史】\n"
            f"{formatted_history}\n\n"
        )

        # ================================
        # 3. 调用 LLM，得到建议文本
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
            # 尝试提取 JSON（可能包裹在 markdown 代码块中）
            if "```json" in advice_text:
                json_match = advice_text.split("```json")[1].split("```")[0]
                advice_data = json.loads(json_match.strip())
            elif advice_text.startswith("{"):
                advice_data = json.loads(advice_text)
            else:
                # 如果不是 JSON，则视为纯文本建议
                advice_data = {
                    "advice": advice_text,
                    "report_ready": False
                }
        except (json.JSONDecodeError, IndexError):
            # JSON 解析失败，降级处理
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
        topic_title: Optional[str] = None,      # 🆕 v1.4
        topic_tags: Optional[List[str]] = None, # 🆕 v1.4
        trait_summary: str = "",
        trait_profile: str = "",
    ) -> str:
        """
        对话结束后调用：
        - 基于本次完整对话历史
        - 生成一份"观念分析报告"（给用户看的）

        🆕 v1.4 变更：
        - 添加 topic_title 和 topic_tags 参数
        - 不再依赖 TOPICS 字典
        - 由 ChatService 传入话题元数据

        mode:
        - 1：话题测试模式，有话题与观念标签
        - 2：随便聊聊模式，无固定话题
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

        # 🆕 v1.4：mode1 时注入话题元数据（而非从TOPICS字典查询）
        if mode == 1 and topic_title:
            system_prompt += (
                "\n\n# 本次观念报告对应的话题信息：\n"
                f"- 话题：{topic_title}\n"
            )
            if topic_tags:
                tags_str = "、".join(topic_tags)
                system_prompt += f"- 标签：{tags_str}\n"
            system_prompt += "请围绕该话题维度，对用户在本次对话中的观点进行系统性分析。"

        # 注入长期特质信息，帮助报告与既有画像保持一致
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
        # 3. 调用 LLM 得到完整报告
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
    # 工具函数：格式化历史，避免 LLM 看到原始 Python dict
    # =====================================
    def _format_history(self, history: List[Dict]) -> str:
        """
        将 [{"role": "...", "content": "..."}] 格式的历史，
        转换为更易读的多轮对话文本。
        """
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
