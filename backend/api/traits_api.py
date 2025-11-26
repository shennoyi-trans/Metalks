# backend/api/traits_api.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.db.database import get_db
from backend.core.dependencies import get_current_user
from backend.db.models import TraitProfile

router = APIRouter(tags=["traits"])

@router.get("/traits/global")
async def get_global_traits(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    result = await db.execute(
        select(TraitProfile).where(TraitProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        return {
            "summary": "暂无特质数据",
            "full_report": "",
        }

    return {
        "summary": profile.summary,
        "full_report": profile.full_report,
    }
