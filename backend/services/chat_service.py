# backend/services/chat_service.py

from typing import AsyncGenerator, Optional, List, Dict

from backend.data.topics import TOPICS
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers, parse_control_flags
from backend.services.history_manager import HistoryManager
from backend.services.model2_service import Model2Service
from backend.services.model3_service import Model3Service


class ChatService:
    """
    ChatService：负责三层逻辑的编排与对接：
    - model1：对话（本类内通过 llm 实现）
    - model2：观念分析 + 对话建议（Model2Service）
    - model3：特质分析（Model3Service）

    对外暴露一个统一的流式接口：
    async def stream_response(...) -> AsyncGenerator[dict, None]

    返回的事件格式：
    - {"type": "token", "content": "..."}  # 流式对话内容
    - {"type": "end", "summary": "...", "has_opinion_report": bool,
       "opinion_report": str|None, "trait_summary": "..."}  # 对话结束块
    - {"type": "error", "message": "..."}  # 预留，当前未使用
    """

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.history_mgr = HistoryManager()
        self.model2 = Model2Service(llm)
        self.model3 = Model3Service(llm)

        # ⭐ 跨 session 统一缓存用户特质（长期记忆）
        self.trait_profile: str = ""   # 完整特质报告（full report）
        self.trait_summary: str = ""   # 一句话特质总结（summary）

    async def stream_response(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        user_input: str,
        is_first: bool = False,
        force_end: bool = False,
    ) -> AsyncGenerator[dict, None]:
        """
        对外统一入口（被 chat_api 调用）。
        根据 mode / is_first / force_end 决定行为：

        - mode == 1：话题测试模式（必须有 topic_id）
          - is_first = True：model1 先开场（用户不说话）
          - is_first = False：用户先说 → model2 给建议 → model1 回复

        - mode == 2：随便聊聊模式
          - 用户先说，每轮都是：用户输入 → model2 → model1

        - force_end = True：用户主动结束
          - 不再调用 model1 回复
          - 直接走收尾逻辑：summary + model3 特质更新
          - 不生成观念报告（model2.final_report 不被调用）
        """

        # ----------------------------
        # 规范化 topic_id（前端 dataset 传的永远是字符串）
        # ----------------------------
        if topic_id is not None and isinstance(topic_id, str):
            try:
                topic_id = int(topic_id)
            except:
                raise ValueError(f"Invalid topic_id: {topic_id}")

        # ===========================
        # 0. 用户主动结束对话
        # ===========================
        if force_end:
            async for event in self._handle_final_outputs(
                session_id=session_id,
                mode=mode,
                topic_id=topic_id,
                force_end=True,
            ):
                yield event
            return

        # ======================
        # 1. 构造 model1 的 system_prompt
        # ======================
        system_prompt = load_prompt("model1/system.txt")

        # 若已有长期特质，则注入“用户特质总结”
        # （注意：这里用 summary，而不是完整画像，避免占用过多 token）
        if self.trait_summary:
            system_prompt += (
                "\n\n# 用户长期特质总结（供你参考）：\n"
                f"{self.trait_summary}"
            )

        assistant_text: str = ""  # 用于累积本轮 assistant 全部输出

        # ======================
        # 2. mode1：话题测试
        # ======================
        if mode == 1:
            if topic_id is None:
                raise ValueError("mode1 requires topic_id")

            # 找到对应的话题配置
            topic = next((t for t in TOPICS if t["id"] == topic_id), None)
            if topic is None:
                raise ValueError(f"invalid topic_id: {topic_id}")

            # ---------- 第一轮：模型先说 ----------
            if is_first:
                history: List[Dict] = self.history_mgr.get(session_id)
                mode1_intro = load_prompt("model1/mode1_intro.txt")
            
                system_prompt=(
                    system_prompt
                    + f"\n\n# 本次对话的主题是：{topic['topic']}（观念标签：{topic['concept_tag']}）。"
                    + mode1_intro
                )
                final_prompt = ""
                
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history,
                ):
                    text = str(chunk)
                    assistant_text += text
                    # 流式 token 事件（前端直接展示）
                    yield {"type": "token", "content": text}

                # 去掉内部控制标记，写入历史
                visible_text = strip_control_markers(assistant_text)
                self.history_mgr.add(session_id, "assistant", visible_text)

                # 解析控制标记
                flags = parse_control_flags(assistant_text)
                if flags.end_test:
                    # 测试结束：走统一收尾逻辑
                    async for event in self._handle_final_outputs(
                        session_id=session_id,
                        mode=mode,
                        topic_id=topic_id,
                        force_end=False,
                    ):
                        yield event
                return

            # ---------- 之后的轮次：用户先说 ----------
            else:
                # 1) 写入用户输入
                self.history_mgr.add(session_id, "user", user_input)
                history = self.history_mgr.get(session_id)

                # 2) 先由 model2 分析，给出“内部建议”
                analysis = await self.model2.analyze(
                    session_history=history,
                    user_input=user_input,
                    mode=1,
                    topic_id=topic_id,
                    trait_summary=self.trait_summary,
                    trait_profile=self.trait_profile,
                )
                advice = analysis.get("advice", "")

                # 3) model1 的最终 prompt：
                #    不再重复 topic_prompt，只用内部建议 + 用户回答
                final_prompt = (
                    "# 来自内部模型的建议（用户不可见）：\n"
                    + advice
                    + "\n\n# 用户的最新回答：\n"
                    + user_input
                )

                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history,
                ):
                    assistant_text += chunk
                    yield {"type": "token", "content": chunk}

                # 4) strip 内部控制标记，写入历史
                visible_text = strip_control_markers(assistant_text)
                self.history_mgr.add(session_id, "assistant", visible_text)

                # 5) 解析控制标记，判断是否结束
                flags = parse_control_flags(assistant_text)
                if flags.end_test:
                    async for event in self._handle_final_outputs(
                        session_id=session_id,
                        mode=mode,
                        topic_id=topic_id,
                        force_end=False,
                    ):
                        yield event
                return

        # ======================
        # 3. mode2：随便聊聊
        # ======================
        elif mode == 2:
            # mode2 不需要 topic_id，用户先说
            # 所以第一轮和后续轮完全一样：用户发什么就记什么

            # 1) 写入用户输入
            self.history_mgr.add(session_id, "user", user_input)
            history = self.history_mgr.get(session_id)

            # 2) 先由 model2 分析，生成建议
            analysis = await self.model2.analyze(
                session_history=history,
                user_input=user_input,
                mode=2,
                topic_id=None,
                trait_summary=self.trait_summary,
                trait_profile=self.trait_profile,
            )
            advice = analysis.get("advice", "")

            # 3) 载入 mode2 的对话风格 prompt
            mode2_intro = load_prompt("model1/mode2_intro.txt")
            system_prompt = system_prompt + "\n\n" + mode2_intro

            final_prompt = (
                "\n\n# 来自内部模型的建议（用户不可见）：\n"
                + advice
                + "\n\n# 用户的最新回答：\n"
                + user_input
            )

            async for chunk in self.llm.chat_stream(
                system_prompt=system_prompt,
                user_prompt=final_prompt,
                history=history,
            ):
                assistant_text += chunk
                yield {"type": "token", "content": chunk}

            # 4) strip 内部控制标记，写入历史
            visible_text = strip_control_markers(assistant_text)
            self.history_mgr.add(session_id, "assistant", visible_text)

            # 5) 解析控制信息
            flags = parse_control_flags(assistant_text)
            if flags.end_test:
                async for event in self._handle_final_outputs(
                    session_id=session_id,
                    mode=mode,
                    topic_id=None,
                    force_end=False,
                ):
                    yield event
            return

        # ======================
        # 4. 其它模式（预留）
        # ======================
        else:
            raise ValueError(f"Unknown mode: {mode}")

    # =======================================================
    # 工具：将对话历史格式化成文本，便于生成一句话总结
    # =======================================================
    def _format_history_for_summary(self, history: List[Dict]) -> str:
        """
        history 示例：
        [
            {"role": "user", "content": "我想聊聊压力"},
            {"role": "assistant", "content": "好的，你最近压力大吗？"},
        ]

        转换后：
        用户：我想聊聊压力
        助手：好的，你最近压力大吗？
        """
        lines = []
        for turn in history:
            role = "用户" if turn.get("role") == "user" else "助手"
            lines.append(f"{role}：{turn.get('content', '')}")
        return "\n".join(lines).strip()

    # =======================================================
    # 统一的收尾逻辑：生成 summary / 观念报告 / 特质分析
    # =======================================================
    async def _handle_final_outputs(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        force_end: bool = False,
    ) -> AsyncGenerator[dict, None]:
        """
        对话结束时调用：
        - model1 → 生成一句话总结（summary）
        - model2 → 生成观念报告（仅当不是 force_end）
        - model3 → 更新长期特质画像（始终执行）

        返回一个或多个 {"type": "end", ...} 事件（当前只返回一次）。
        """
        full_history = self.history_mgr.get(session_id)

        # ========================
        # 1. model1：一句话总结（summary）
        # ========================
        summary_prompt = (
            "请根据以下完整对话，生成一句话总结（面向用户，可直接展示）：\n\n"
            + self._format_history_for_summary(full_history)
        )

        model1_summary = ""
        async for chunk in self.llm.chat_stream(
            system_prompt="你是一个擅长对对话进行高度概括的助手。",
            user_prompt=summary_prompt,
            history=[],
        ):
            model1_summary += chunk

        model1_summary = strip_control_markers(model1_summary).strip()

        # ========================
        # 2. model2：观念报告（正常结束时才生成）
        # ========================
        if not force_end:
            opinion_report = await self.model2.final_report(
                full_history=full_history,
                mode=mode,
                topic_id=topic_id,
                trait_summary=self.trait_summary,
                trait_profile=self.trait_profile,
            )
        else:
            opinion_report = None

        # ========================
        # 3. model3：更新长期特质画像（始终执行）
        # ========================
        trait_data = await self.model3.update_traits(self.history_mgr.histories)
        trait_summary = trait_data.get("summary", "")

        # ⭐ 将最新特质写回 ChatService，作为后续对话的长期记忆
        self.trait_summary = trait_summary
        self.trait_profile = trait_data.get("full_report", "")

        # ========================
        # 4. 清空本 session 历史（开启下一场对话）
        # ========================
        self.history_mgr.clear(session_id)

        # ========================
        # 5. 返回 end 事件
        # ========================
        yield {
            "type": "end",
            "summary": model1_summary,
            "has_opinion_report": (opinion_report is not None),
            "opinion_report": opinion_report,
            "trait_summary": trait_summary,
            "full_dialogue": full_history
        }

