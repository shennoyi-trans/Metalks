# backend/services/chat_service.py

import asyncio
import json
from typing import AsyncGenerator, Optional, List, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# ❌ 已删除旧版引用: from backend.data.topics import TOPICS
from backend.llm_client.base import LLMClient
from backend.utils.prompt_loader import load_prompt
from backend.utils.text_tools import strip_control_markers, parse_control_flags
from backend.services.model2_service import Model2Service
from backend.services.model3_service import Model3Service
from backend.services.db_history_manager import DatabaseHistoryManager
from backend.db.models import TraitProfile, Session
from backend.db.crud import topic as topic_crud


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

        返回:
            (prompt, title, concept_tag, tags_list)

        注意: 已删除旧版TOPICS字典降级逻辑
        """
        # 1. 优先使用 Session 的快照
        if session.topic_prompt:
            tags = json.loads(session.topic_tags_snapshot) if session.topic_tags_snapshot else []
            return (session.topic_prompt, session.topic_title, None, tags)

        # 2. 无快照（旧 session 或首次）→ 查数据库并写入快照
        if topic_id:
            topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=True)
            if topic:
                tags_list = [tt.tag.name for tt in topic.tags]
                # 写快照
                session.topic_prompt = topic.prompt
                session.topic_title = topic.title
                session.topic_tags_snapshot = json.dumps(tags_list, ensure_ascii=False)
                session.topic_version = topic.updated_at
                await db.commit()
                return (topic.prompt, topic.title, None, tags_list)

        return None, None, None, []

    # ------------------------------------------------------
    # ✅ 修复：后台异步生成报告（使用独立 db session）
    # ------------------------------------------------------
    async def _generate_report_background(
        self,
        session_id: str,
        mode: int,
        topic_id: Optional[int],
        # ✅ 不再接收外部 db，改为在方法内部创建独立 session
        # 原因：asyncio.create_task 中使用请求级 db session 会导致
        # 请求结束后 session 被关闭，后台任务静默失败，报告永远无法生成
        trait_summary: str,
        trait_profile: str,
    ):
        """
        后台任务：生成观念报告并更新数据库。
        使用独立的 db session，生命周期由本任务自己管理。
        """
        from backend.db.database import get_sessionmaker
        from backend.db.models import Message

        SessionLocal = get_sessionmaker()
        async with SessionLocal() as db:
            try:
                # 获取 session 记录
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
                    topic_title=topic_title,
                    topic_tags=topic_tags or [],
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

        # 🆕 v1.4: 如果是新Session且有topic_id，进行完整快照
        if session.topic_prompt is None and topic_id is not None:
            topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=False)
            if topic:
                session.topic_prompt = topic.prompt
                session.topic_title = topic.title
                session.topic_tags_snapshot = json.dumps(
                    [tt.tag.name for tt in topic.tags], ensure_ascii=False
                )
                session.topic_version = topic.updated_at
                await db.commit()

        """
        此处检测话题是否已更新的功能待开发
        # 可选：检查话题是否有更新
        if session.topic_version and topic_id:
            topic = await topic_crud.get_topic_by_id(db, topic_id, include_inactive=True)
            if topic and topic.updated_at > session.topic_version:
                yield {"type": "topic_updated", "content": "该话题已被作者更新，是否要使用新版本？"}
                # 前端展示通知，用户确认后调用一个刷新快照的接口
        """

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

        # =======================================================
        # mode == 1（话题测试）
        # =======================================================
        if mode == 1:

            # 获取话题信息
            topic_prompt, topic_title, _, topic_tags = await self._get_topic_prompt(
                db, session, topic_id
            )

            if not topic_prompt:
                raise ValueError(f"话题 ID {topic_id} 不存在或未找到提示词")

            # 加载 model1 基础 prompt
            base_model1 = load_prompt("model1/system.txt")
            system_prompt = base_model1 + "\n\n" + topic_prompt

            assistant_text = ""

            # --------------------------
            # 首轮：机器人先主动说话
            # --------------------------
            if is_first:
                first_prompt = load_prompt("model1/mode1_intro.txt")
                final_prompt = (
                    "# 内部提示（用户不可见）：\n"
                    + first_prompt
                    + "\n\n请根据话题，生成你的第一句话。"
                )

                # 先收集完整输出
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=[],
                ):
                    assistant_text += chunk

                # 清洗后再流式输出
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
                    topic_title=topic_title,
                    topic_tags=topic_tags or [],
                    trait_summary=trait_summary,
                    trait_profile=trait_profile,
                )
                advice = analysis.get("advice", "")
                report_ready = analysis.get("signals", {}).get("report_ready", False)

                # 如果报告就绪，触发后台生成任务
                if report_ready:
                    # ✅ 修复：去掉 db=db，改由 _generate_report_background 自建 session
                    asyncio.create_task(
                        self._generate_report_background(
                            session_id=session_id,
                            mode=mode,
                            topic_id=topic_id,
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

                # 先收集完整输出
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    user_prompt=final_prompt,
                    history=history,
                ):
                    assistant_text += chunk

                # 清洗后再流式输出
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
                topic_title=None,
                topic_tags=[],
                trait_summary=trait_summary,
                trait_profile=trait_profile,
            )
            advice = analysis.get("advice", "")
            report_ready = analysis.get("signals", {}).get("report_ready", False)

            # 如果报告就绪，触发后台生成任务
            if report_ready:
                # ✅ 修复：去掉 db=db，改由 _generate_report_background 自建 session
                asyncio.create_task(
                    self._generate_report_background(
                        session_id=session_id,
                        mode=mode,
                        topic_id=None,
                        trait_summary=trait_summary,
                        trait_profile=trait_profile,
                    )
                )
                # 告知 model1
                advice += "\n\n[内部提示] 观念已捕捉完成，请在本次回复中自然地告知用户：你已经成功捕捉到他的观念，稍后可以查看分析报告。"

            base_model1 = load_prompt("model1/base.txt")
            system_prompt = base_model1
            mode2_intro = load_prompt("model1/mode2_intro.txt")
            system_prompt = system_prompt + "\n\n" + mode2_intro

            final_prompt = (
                "\n\n# 来自内部模型的建议（用户不可见）：\n"
                + advice
                + "\n\n# 用户的最新回答：\n"
                + user_input
            )

            assistant_text = ""
            # 先收集完整输出
            async for chunk in self.llm.chat_stream(
                system_prompt=system_prompt,
                user_prompt=final_prompt,
                history=history,
            ):
                assistant_text += chunk

            # 清洗后再流式输出
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
    # 收尾逻辑：summary + traits
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

        # 1. 获取历史
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
