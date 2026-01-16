# backend/services/chat_service.py

import asyncio
from typing import AsyncGenerator, Optional, List, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.data.topics import TOPICS  # ⚠️ v1.4: 保留用于降级
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers, parse_control_flags
from backend.services.model2_service import Model2Service
from backend.services.model3_service import Model3Service
from backend.services.db_history_manager import DatabaseHistoryManager
from backend.db.models import TraitProfile, Session
from backend.db.crud import topic as topic_crud  # 🆕 v1.4: 导入topic CRUD


class ChatService:
    """
    ChatService：负责三层逻辑的编排与对接：
    - model1：对话（本类内通过 llm 实现）
    - model2：观念分析 + 对话建议（Model2Service）
    - model3：特质分析（Model3Service）

    对外暴露一个统一的流式接口：
    async def stream_response(...) -> AsyncGenerator[dict, None]
    """

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.model2 = Model2Service(llm)
        self.model3 = Model3Service(llm)

    # ------------------------------------------------------
    # 读取用户当前 trait
    # ------------------------------------------------------
    async def _load_trait_context(
        self,
        db: AsyncSession,
        user_id: int,
    ) -> tuple[str, str]:
        """
        从 TraitProfile 表中加载该用户的长期特质 summary 和 full_report。
        如果没有记录，则返回 ('', '')。
        """
        result = await db.execute(
            select(TraitProfile).where(TraitProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            return "", ""

        return str(profile.summary or ""), str(profile.full_report or "")

    # ------------------------------------------------------
    # 🆕 v1.4: 获取话题提示词（从Session快照或数据库）
    # ------------------------------------------------------
    async def _get_topic_prompt(
        self,
        db: AsyncSession,
        session: Session,
        topic_id: Optional[int]
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[List[str]]]:
        """
        获取话题的提示词、标题和标签
        
        优先级:
        1. 从 session.topic_prompt 读取（快照）
        2. 从数据库查询话题（如果session中没有快照）
        3. 降级到 TOPICS 字典（兼容旧数据）
        
        返回:
            (prompt, title, concept_tag, tags_list)
        """
        # 1. 优先使用 Session 的快照
        if session.topic_prompt:
            # 从快照中提取（假设快照格式包含了所有信息）
            # 但我们还需要 title 和 tags，所以仍需查询数据库获取元数据
            if topic_id:
                topic = await topic_crud.get_topic_by_id(db, topic_id)
                if topic:
                    tags_list = [tag.tag.name for tag in topic.tags]
                    return (
                        session.topic_prompt,
                        topic.title,
                        None,  # v1.4不再使用concept_tag
                        tags_list
                    )
            # 如果没有topic_id或查询失败，只返回快照的prompt
            return (session.topic_prompt, None, None, [])
        
        # 2. 从数据库查询话题
        if topic_id:
            topic = await topic_crud.get_topic_by_id(db, topic_id)
            if topic:
                tags_list = [tag.tag.name for tag in topic.tags]
                return (
                    topic.prompt,
                    topic.title,
                    None,  # v1.4不再使用concept_tag
                    tags_list
                )
        
        # 3. 降级到旧的TOPICS字典（兼容性）
        if topic_id:
            old_topic = next((t for t in TOPICS if t["id"] == topic_id), None)
            if old_topic:
                try:
                    prompt_content = load_prompt(old_topic["prompt_path"])
                    return (
                        prompt_content,
                        old_topic["topic"],
                        old_topic.get("concept_tag"),
                        []
                    )
                except Exception as e:
                    print(f"[WARNING] 降级加载失败: {e}")
        
        return None, None, None, []

    # ------------------------------------------------------
    # 后台异步生成报告
    # ------------------------------------------------------
    async def _generate_report_background(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        db: AsyncSession,
        trait_summary: str,
        trait_profile: str,
    ):
        """
        后台任务：生成观念报告并更新数据库
        """
        try:
            # 获取完整历史
            result = await db.execute(
                select(Session).where(Session.id == session_id)
            )
            session = result.scalar_one_or_none()
            if not session:
                return

            # 如果报告已生成，避免重复
            if session.report_ready:
                return

            # 获取对话历史
            from backend.db.models import Message
            msg_result = await db.execute(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.asc())
            )
            messages = msg_result.scalars().all()
            full_history = [
                {"role": m.role, "content": m.content} for m in messages
            ]

            # 🆕 v1.4: 获取话题信息（用于报告生成）
            _, topic_title, _, topic_tags = await self._get_topic_prompt(
                db, session, topic_id
            )

            # 调用 model2 生成报告
            report = await self.model2.final_report(
                full_history=full_history,
                mode=mode,
                topic_id=topic_id,
                topic_title=topic_title,      # 🆕 v1.4
                topic_tags=topic_tags or [],  # 🆕 v1.4
                trait_summary=trait_summary,
                trait_profile=trait_profile,
            )

            # 更新数据库
            session.report_ready = True
            session.opinion_report = report
            await db.commit()

        except Exception as e:
            print(f"[ERROR] 后台报告生成失败: {e}")
            await db.rollback()

    # ------------------------------------------------------
    # 主流式入口
    # ------------------------------------------------------
    async def stream_response(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        user_input: str,
        is_first: bool = False,
        force_end: bool = False,
        db: Optional[AsyncSession] = None,
        user_id: Optional[int] = None,
    ) -> AsyncGenerator[dict, None]:

        if db is None or user_id is None:
            raise ValueError("db and user_id are required")

        # 规范化 topic_id
        if topic_id is not None and isinstance(topic_id, str):
            try:
                topic_id = int(topic_id)
            except Exception:
                raise ValueError(f"Invalid topic_id: {topic_id}")

        # 基于当前用户构造 DB 历史管理器
        history_mgr = DatabaseHistoryManager(db=db, user_id=user_id)
        session = await history_mgr.ensure_session(
            session_id=session_id, 
            mode=mode, 
            topic_id=topic_id
        )

        # 🆕 v1.4: 如果是新Session且有topic_id，快照prompt
        if not session.topic_prompt and topic_id:
            prompt, _, _, _ = await self._get_topic_prompt(db, session, topic_id)
            if prompt:
                session.topic_prompt = prompt
                await db.commit()

        # 当前用户长期特质
        trait_summary, trait_profile = await self._load_trait_context(db, user_id)

        # 用户主动结束
        if force_end:
            async for event in self._handle_final_outputs(
                session_id=session_id,
                mode=mode,
                topic_id=topic_id,
                force_end=True,
                history_mgr=history_mgr,
                db=db,
                user_id=user_id,
                trait_summary=trait_summary,
                trait_profile=trait_profile,
            ):
                yield event
            return

        # ------------------------------
        # model1 system prompt
        # ------------------------------
        system_prompt = load_prompt("model1/system.txt")

        if trait_summary:
            system_prompt += (
                "\n\n# 用户长期特质总结（供你参考）：\n"
                f"{trait_summary}"
            )

        assistant_text = ""

        # =======================================================
        # mode == 1（话题测试）
        # =======================================================
        if mode == 1:

            if topic_id is None:
                raise ValueError("mode1 requires topic_id")

            # 🆕 v1.4: 使用新的话题获取逻辑
            topic_prompt, topic_title, topic_concept_tag, topic_tags = await self._get_topic_prompt(
                db, session, topic_id
            )

            if not topic_prompt:
                raise ValueError(f"Invalid topic_id or topic not found: {topic_id}")

            # 使用 topic_title 或降级到 concept_tag
            display_name = topic_title or topic_concept_tag or f"话题{topic_id}"

            # --------------------------
            # 第一轮：模型先说
            # --------------------------
            if is_first:
                history = await history_mgr.get(session_id)
                mode1_intro = load_prompt("model1/mode1_intro.txt")

                # 🆕 v1.4: 在system_prompt中注入话题信息
                system_prompt = (
                    system_prompt
                    + f"\n\n# 本次对话的主题是：{display_name}"
                )
                
                # 如果有标签，也添加到系统提示中
                if topic_tags:
                    tags_str = "、".join(topic_tags)
                    system_prompt += f"\n标签：{tags_str}"
                
                system_prompt += "\n" + mode1_intro
                
                # 🆕 v1.4: 话题提示词作为user_prompt
                final_prompt = topic_prompt

                # 🆕 先收集完整输出
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history,
                ):
                    assistant_text += str(chunk)

                # 🆕 清洗后再流式输出
                visible_text = strip_control_markers(assistant_text)
                
                # 逐字符流式输出（模拟打字机效果）
                for char in visible_text:
                    yield {"type": "token", "content": char}
                
                await history_mgr.add(session_id, "assistant", visible_text)

                # 检查用户是否想退出
                flags = parse_control_flags(assistant_text)
                if flags.user_want_to_quit:
                    yield {"type": "user_want_quit"}
                return

            # --------------------------
            # 后续轮：用户先说
            # --------------------------
            else:
                await history_mgr.add(session_id, "user", user_input)
                history = await history_mgr.get(session_id)

                # 🆕 v1.4: 调用 model2 分析（传入话题元数据）
                analysis = await self.model2.analyze(
                    session_history=history,
                    user_input=user_input,
                    mode=1,
                    topic_id=topic_id,
                    topic_title=topic_title,      # 🆕 v1.4
                    topic_tags=topic_tags or [],  # 🆕 v1.4
                    trait_summary=trait_summary,
                    trait_profile=trait_profile,
                )
                advice = analysis.get("advice", "")
                report_ready = analysis.get("signals", {}).get("report_ready", False)

                # 如果报告就绪，触发后台生成任务
                if report_ready:
                    asyncio.create_task(
                        self._generate_report_background(
                            session_id=session_id,
                            mode=mode,
                            topic_id=topic_id,
                            db=db,
                            trait_summary=trait_summary,
                            trait_profile=trait_profile,
                        )
                    )
                    # 告知 model1
                    advice += "\n\n[内部提示] 观念已捕捉完成，请在本次回复中自然地告知用户：你已经成功捕捉到他的观念，稍后可以查看分析报告。"

                final_prompt = (
                    "# 来自内部模型的建议（用户不可见）：\n"
                    + advice
                    + "\n\n# 用户的最新回答：\n"
                    + user_input
                )

                # 🆕 先收集完整输出
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history,
                ):
                    assistant_text += chunk

                # 🆕 清洗后再流式输出
                visible_text = strip_control_markers(assistant_text)
                
                # 逐字符流式输出
                for char in visible_text:
                    yield {"type": "token", "content": char}

                await history_mgr.add(session_id, "assistant", visible_text)

                # 检查用户是否想退出
                flags = parse_control_flags(assistant_text)
                if flags.user_want_to_quit:
                    yield {"type": "user_want_quit"}
                return

        # =======================================================
        # mode == 2（随便聊聊）
        # =======================================================
        elif mode == 2:

            await history_mgr.add(session_id, "user", user_input)
            history = await history_mgr.get(session_id)

            # 调用 model2 分析
            analysis = await self.model2.analyze(
                session_history=history,
                user_input=user_input,
                mode=2,
                topic_id=None,
                topic_title=None,      # 🆕 v1.4
                topic_tags=[],         # 🆕 v1.4
                trait_summary=trait_summary,
                trait_profile=trait_profile,
            )
            advice = analysis.get("advice", "")
            report_ready = analysis.get("signals", {}).get("report_ready", False)

            # 如果报告就绪，触发后台生成任务
            if report_ready:
                asyncio.create_task(
                    self._generate_report_background(
                        session_id=session_id,
                        mode=mode,
                        topic_id=None,
                        db=db,
                        trait_summary=trait_summary,
                        trait_profile=trait_profile,
                    )
                )
                # 告知 model1
                advice += "\n\n[内部提示] 观念已捕捉完成，请在本次回复中自然地告知用户：你已经成功捕捉到他的观念，稍后可以查看分析报告。"

            mode2_intro = load_prompt("model1/mode2_intro.txt")
            system_prompt = system_prompt + "\n\n" + mode2_intro

            final_prompt = (
                "\n\n# 来自内部模型的建议（用户不可见）：\n"
                + advice
                + "\n\n# 用户的最新回答：\n"
                + user_input
            )

            # 🆕 先收集完整输出
            async for chunk in self.llm.chat_stream(
                system_prompt=system_prompt,
                user_prompt=final_prompt,
                history=history,
            ):
                assistant_text += chunk

            # 🆕 清洗后再流式输出
            visible_text = strip_control_markers(assistant_text)
            
            # 逐字符流式输出
            for char in visible_text:
                yield {"type": "token", "content": char}

            await history_mgr.add(session_id, "assistant", visible_text)

            # 检查用户是否想退出
            flags = parse_control_flags(assistant_text)
            if flags.user_want_to_quit:
                yield {"type": "user_want_quit"}
            return

        else:
            raise ValueError(f"Unknown mode: {mode}")

    # =======================================================
    # 格式化历史 → 一句话总结
    # =======================================================
    def _format_history_for_summary(self, history: List[Dict]) -> str:
        lines = []
        for turn in history:
            role = "用户" if turn.get("role") == "user" else "助手"
            lines.append(f"{role}：{turn.get('content', '')}")
        return "\n".join(lines).strip()

    # =======================================================
    # 收尾逻辑：summary + traits（不再生成 report）
    # =======================================================
    async def _handle_final_outputs(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        force_end: bool,
        history_mgr: DatabaseHistoryManager,
        db: AsyncSession,
        user_id: int,
        trait_summary: str,
        trait_profile: str,
    ) -> AsyncGenerator[dict, None]:

        # 1. 取历史
        full_history = await history_mgr.get(session_id)

        # 2. model1 summary
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

        # 3. model3：更新特质（只用本 session）
        trait_data = await self.model3.update_traits({session_id: full_history})
        new_trait_summary = trait_data.get("summary", "")
        new_full_report = trait_data.get("full_report", "")

        # 4. 写 TraitProfile
        result = await db.execute(
            select(TraitProfile).where(TraitProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = TraitProfile(
                user_id=user_id,
                summary=new_trait_summary,
                full_report=new_full_report,
            )
            db.add(profile)
        else:
            profile.summary = new_trait_summary
            profile.full_report = new_full_report

        await db.commit()
        
        # 5. 标记 session 完成
        session = await db.execute(select(Session).where(Session.id == session_id))
        session = session.scalar_one_or_none()
        if session:
            session.is_completed = True
            db.add(session)
            await db.commit()

        # 6. 输出最终事件
        yield {
            "type": "end",
            "summary": model1_summary,
            "trait_summary": new_trait_summary,
            "full_dialogue": full_history,
        }
