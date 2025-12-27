# backend/api/report_api.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.models import Session

router = APIRouter(tags=["reports"])


# -------------------------------------------------------
# 查询报告状态
# -------------------------------------------------------
@router.get("/sessions/{session_id}/report_status")
async def get_report_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    查询指定 session 的报告是否已生成
    
    返回：
    {
        "ready": bool,        # 报告是否已生成
        "session_id": str
    }
    """
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == user_id
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(404, "Session not found")
    
    return {
        "ready": bool(session.report_ready),
        "session_id": session_id
    }


# -------------------------------------------------------
# 获取完整报告
# -------------------------------------------------------
@router.get("/sessions/{session_id}/report")
async def get_report(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """
    获取指定 session 的完整观念分析报告
    
    返回：
    {
        "report": str,        # 报告内容
        "ready": bool,        # 是否已生成
        "session_id": str
    }
    """
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == user_id
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(404, "Session not found")
    
    if not session.report_ready:
        raise HTTPException(202, "Report is still being generated")
    
    return {
        "report": session.opinion_report or "",
        "ready": True,
        "session_id": session_id
    }