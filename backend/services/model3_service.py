# backend/services/model3_service.py
from backend.utils.text_tools import strip_control_markers
from backend.utils.prompt_loader import load_prompt


class Model3Service:
    """
    分析所有会话的历史，更新用户的特质画像。
    """

    def __init__(self, llm=None):
        self.llm = llm
        self.trait_profile = ""  # 可做缓存（可选）

    def attach_llm(self, llm):
        """让 ChatService 把 LLMClient 注入 model3。"""
        self.llm = llm

    async def update_traits(self, all_sessions: dict) -> dict:
        """
        all_sessions: {session_id: [history_list]}
        返回：
        {
            "summary": "...",
            "full_report": "..."
        }
        """

        if self.llm is None:
            return {"summary": "", "full_report": ""}

        # ===========================
        # 1. 加载提示词
        # ===========================
        system_prompt_full = load_prompt("model3/trait_full_report.txt")
        system_prompt_summary = load_prompt("model3/trait_summary.txt")

        # ===========================
        # 2. 格式化多场会话历史
        # ===========================
        formatted = self._format_all_sessions(all_sessions)

        # ===========================
        # 3. 生成完整特质报告（full report）
        # ===========================
        user_prompt_full = (
            "以下是用户所有会话的完整历史，请根据提示词对用户的长期特质进行分析：\n\n"
            + formatted
        )

        full_report = ""
        async for chunk in self.llm.chat_stream(
            system_prompt=system_prompt_full,
            user_prompt=user_prompt_full,
            history=[]
        ):
            full_report += chunk

        full_report = strip_control_markers(full_report).strip()
        self.trait_profile = full_report  # 可缓存

        # ===========================
        # 4. 生成一句话特质总结（summary）
        # ===========================
        user_prompt_summary = (
            "请根据以下完整特质报告，生成一句话概括：\n\n"
            + full_report
        )

        summary = ""
        async for chunk in self.llm.chat_stream(
            system_prompt=system_prompt_summary,
            user_prompt=user_prompt_summary,
            history=[]
        ):
            summary += chunk

        summary = strip_control_markers(summary).strip()

        return {
            "summary": summary,
            "full_report": full_report
        }

    # ==========================================================
    # 多场会话文本格式化
    # ==========================================================
    def _format_all_sessions(self, all_sessions: dict) -> str:
        """
        将多场 session 整理为:
        [Session 1]
        用户：...
        助手：...

        [Session 2]
        ...
        """
        text = ""
        for sid, history in all_sessions.items():
            text += f"\n\n[Session {sid}]\n"
            for turn in history:
                role = "用户" if turn["role"] == "user" else "助手"
                text += f"{role}：{turn['content']}\n"
        return text.strip()

