# backend/services/chat_service.py
import json
from typing import AsyncGenerator, Optional, List, Dict
from backend.data.topics import TOPICS
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers, parse_control_flags
from backend.services.history_manager import HistoryManager
from backend.services.model2_service import Model2Service
from backend.services.model3_service import Model3Service



class ChatService:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.history_mgr = HistoryManager()
        self.model2 = Model2Service()
        self.model3 = Model3Service()
        self.model2.attach_llm(llm)
        self.model3.attach_llm(llm)

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
        返回统一的事件 dict，用于 SSE：
        - {"type": "token", "content": "..."}
        - {"type": "end", ...}
        - {"type": "error", "message": "..."}
        """
        
        # ===========================
        # 用户主动结束对话
        # ===========================
        if force_end:
            async for event in self._handle_final_outputs(session_id, mode, force_end=True):
                yield event
            return
        assistant_text: str = ""
        
        
        """
        根据 mode 和 is_first 决定：
        - 是否需要 topic_id
        - 谁先说话（用户 / 模型）
        """

        # ======================
        # 1. 决定 system_prompt
        # ======================
        system_prompt = load_prompt("model1/system.txt")
        assistant_text: str = "" #初始化assistant_text

        # ======================
        # 2. mode1：话题测试
        # ======================
        if mode == 1:
            if topic_id is None:
                # 严格一点：mode1 必须有 topic_id
                raise ValueError("mode1 requires topic_id")

            # 找到对应的话题配置
            topic = next((t for t in TOPICS if t["id"] == topic_id), None)
            if topic is None:
                raise ValueError(f"invalid topic_id: {topic_id}")

            # 载入话题 prompt，例如“工作观”的引导
            topic_prompt = load_prompt(topic["prompt_path"])

            # 第一轮：模型先说（用户不说话）
            if is_first:
                # 不记录用户输入（因为此时用户没说话）
                history: List[Dict] = self.history_mgr.get(session_id)

                # 模型拿到 topic_prompt，自行发起开场
                final_prompt = topic_prompt

                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history
                ):
                    # 这里逐块返回模型的开场白
                    text = str(chunk)
                    assistant_text += text         # 累积
                    yield {"type": "token", "content": text}

                    
                 # 4. 去掉内部控制标记（下面第二部分会讲），保留给用户看的文本
                from backend.utils.text_tools import strip_control_markers
                visible_text = strip_control_markers(assistant_text)

                # 5. 把“用户可见的那部分”写入历史
                self.history_mgr.add(session_id, "assistant", visible_text)

                # 6. 解析控制信息（例如是否结束测试）
                from backend.utils.text_tools import parse_control_flags
                flags = parse_control_flags(assistant_text)
                
                # 在这里根据 flags.end_test / flags.has_report 等做进一步动作
                # 如果测试结束，触发后续处理并返回结果
                if flags.end_test:
                    async for event in self._handle_final_outputs(session_id, mode):
                        yield event
                    return

                return

            else:
                # 非第一轮：用户已经说话了
                # 先把用户输入写入历史
                # 非第一轮：用户已经说话了
                self.history_mgr.add(session_id, "user", user_input)
                history = self.history_mgr.get(session_id)

                # ================================
                # ★ NEW ★ 先由 model2 分析，生成建议
                # ================================
                analysis = await self.model2.analyze(
                session_history=history,
                user_input=user_input,
                mode=1,
                topic_id=topic_id,
                )
                advice = analysis.get("advice", "")

                # ================================
                # model1 最终 prompt = topic_prompt + 建议 + 用户输入
                # ================================
                final_prompt = (
                    "\n\n# 来自内部模型的建议（用户不可见）\n"
                    + advice
                    + "\n\n# 用户的最新回答：\n"
                    + user_input
                )


                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history
                ):
                    assistant_text += chunk         # 累积

                    yield {"type": "token", "content": chunk}

                 # 4. 去掉内部控制标记（下面第二部分会讲），保留给用户看的文本
                from backend.utils.text_tools import strip_control_markers
                visible_text = strip_control_markers(assistant_text)

                # 5. 把“用户可见的那部分”写入历史
                self.history_mgr.add(session_id, "assistant", visible_text)

                # 6. 解析控制信息（例如是否结束测试）
                from backend.utils.text_tools import parse_control_flags
                flags = parse_control_flags(assistant_text)
                # 在这里可以根据 flags.end_test / flags.has_report 等做进一步动作
                if flags.end_test:
                    async for event in self._handle_final_outputs(session_id, mode, force_end=False):
                        yield event
                return

        # ======================
        # 3. mode2：随便聊聊
        # ======================
        elif mode == 2:
            # mode2 不需要 topic_id，用户先说
            # 所以第一轮和后续轮完全一样：用户发什么就记什么

            # 写入用户输入
            self.history_mgr.add(session_id, "user", user_input)
            history = self.history_mgr.get(session_id)

            # ================================
            # ★ NEW ★ model2 分析（mode=2，无 topic_id）
            # ================================
            analysis = await self.model2.analyze(
                session_history=history,
                user_input=user_input,
                mode=2,
                topic_id=None,
            )
            advice = analysis.get("advice", "")

            mode2_prompt = load_prompt("model1/mode2_intro.txt")

            final_prompt = (
                mode2_prompt
                + "\n\n# 来自内部模型的建议（用户不可见）\n"
                + advice
                + "\n\n# 用户的最新回答：\n"
                + user_input
            )


            async for chunk in self.llm.chat_stream(
                system_prompt=system_prompt,
                user_prompt=final_prompt,
                history=history
            ):
                assistant_text += chunk         # 累积

                yield {"type": "token", "content": chunk}


             # 4. 去掉内部控制标记（下面第二部分会讲），保留给用户看的文本
            from backend.utils.text_tools import strip_control_markers
            visible_text = strip_control_markers(assistant_text)

            # 5. 把“用户可见的那部分”写入历史
            self.history_mgr.add(session_id, "assistant", visible_text)

            # 6. 解析控制信息（例如是否结束测试）
            from backend.utils.text_tools import parse_control_flags
            flags = parse_control_flags(assistant_text)
            # 在这里可以根据 flags.end_test / flags.has_report 等做进一步动作
            if flags.end_test:
                async for event in self._handle_final_outputs(session_id, mode, force_end=False):
                    yield event
            return

        # ======================
        # 4. 其它模式（预留）
        # ======================
        else:
            raise ValueError(f"Unknown mode: {mode}")
        
        
    """
    _format_history_for_summary()将对话历史格式化为字符串，便于生成总结。
    history 示例：
    [
        {"role": "user", "content": "我想聊聊压力"},
        {"role": "assistant", "content": "好的，你最近压力大吗？"},
    ]

    转换后：
    用户：我想聊聊压力
    助手：好的，你最近压力大吗？
    """
       
    def _format_history_for_summary(self, history: List[Dict]) -> str:
        text = ""
        for turn in history:
            role = "用户" if turn["role"] == "user" else "助手"
            text += f"{role}：{turn['content']}\n"
        return text.strip()
        
    
    """
    _handle_final_outputs() 在对话结束时调用，生成总结和报告。
    session_id: 会话ID
    mode: 当前对话模式（1 或 2）
    force_end: 是否为用户主动结束对话
    返回一个异步生成器，逐块产出最终的 SSE 负载。
    """
    async def _handle_final_outputs(
        self,
        session_id: str,
        mode: int,
        force_end: bool = False
    ) -> AsyncGenerator[dict, None]:
        """
        对话结束时调用：
        - model1 → summary
        - model2 → final_report（仅正常结束）
        - model3 → update_traits（始终执行）
        """
        full_history = self.history_mgr.get(session_id)

        # ========================
        # 1. model1 summary
        # ========================
        summary_prompt = (
            "请根据以下对话生成一句话总结：\n\n"
            + self._format_history_for_summary(full_history)
        )
        model1_summary = ""
        async for chunk in self.llm.chat_stream(
            system_prompt="你是一个总结助手",
            user_prompt=summary_prompt,
            history=[]
        ):
            model1_summary += chunk

        model1_summary = strip_control_markers(model1_summary).strip()

        # ========================
        # 2. model2（是否生成报告）
        # ========================
        if not force_end:
            opinion_report = await self.model2.final_report(full_history, mode)
        else:
            opinion_report = None

        # ========================
        # 3. model3（总是执行）
        # ========================
        trait_data = await self.model3.update_traits(self.history_mgr.histories)
        trait_summary = trait_data.get("summary", "")

        # ========================
        # 清空本 session 历史
        # ========================
        self.history_mgr.clear(session_id)

        yield {
            "type": "end",
            "summary": model1_summary,
            "has_opinion_report": (opinion_report is not None),
            "opinion_report": opinion_report,
            "trait_summary": trait_summary,
        }

    
        
        '''
        def __init__(self, llm: LLMClient):
        self.llm = llm
        self.sessions = {}   # MVP 简单使用内存存储

        def get_history(self, session_id: str) -> List[Dict]:
            return self.sessions.get(session_id, [])

        def add_to_history(self, session_id: str, role: str, content: str):
            self.sessions.setdefault(session_id, []).append({
                "role": role,
                "content": content
        })
        '''
