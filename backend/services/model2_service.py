from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers
from typing import List, Dict


class Model2Service:

    def __init__(self, llm=None):
        """
        llm: ChatService 会在初始化时把 LLMClient 注入进来
        """
        self.llm = llm

    def attach_llm(self, llm):
        """让 ChatService 能把 LLMClient 注入 model2。"""
        self.llm = llm

    async def analyze(
        self,
        session_history: List[Dict],
        user_input: str,
        mode: int,
        topic_id: int | None,
    ) -> dict:

        if self.llm is None:
            # 防止 model2 尚未 attach llm
            return {"advice": "", "signals": {}}

        # ================================
        # 1. 加载 model2 的分析提示词（由你们编写）
        # ================================
        if mode == 1:
            prompt_path = "model2/opinion_analysis_mode1.txt"
        else:
            prompt_path = "model2/opinion_analysis_mode2.txt"

        system_prompt = load_prompt(prompt_path)

        # ================================
        # 2. 准备 user_prompt（输入给 LLM）
        # ================================
        formatted_history = self._format_history(session_history)

        user_prompt = (
            "以下是完整的对话历史：\n"
            + formatted_history
            + "\n\n用户最新输入：\n"
            + user_input
            + "\n\n请根据提示词要求进行分析并生成给 model1 的内部建议。"
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

        return {
            "advice": advice_text,
            "signals": {}  # 先留空，之后可加入更多元数据
        }

    # =====================================
    # 格式化历史，避免 LLM 看到原始 Python dict
    # =====================================
    def _format_history(self, history: List[Dict]) -> str:
        text = ""
        for turn in history:
            if turn["role"] == "user":
                text += f"用户：{turn['content']}\n"
            else:
                text += f"助手：{turn['content']}\n"
        return text

    async def final_report(self, full_history: List[Dict], mode: int) -> str:
        """
        对话结束后，生成完整观念报告（给用户看的那种）。
        """

        if self.llm is None:
            return ""

        # ================================
        # 1. 加载 model2 的“最终报告提示词”
        # ================================
        if mode == 1:
            prompt_path = "model2/final_report_mode1.txt"
        else:
            prompt_path = "model2/final_report_mode2.txt"

        system_prompt = load_prompt(prompt_path)

        # ================================
        # 2. 格式化完整历史
        # ================================
        formatted_history = self._format_history(full_history)

        user_prompt = (
            "以下是本次完整对话的历史，请根据提示词生成观念分析报告：\n\n"
            + formatted_history
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
