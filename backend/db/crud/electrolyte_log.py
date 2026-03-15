# backend/db/crud/electrolyte_log.py
"""
电解液流水 CRUD 操作
- 写入流水记录
- 分页查询明细
- 按 reason 分组统计
"""

from typing import List, Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from backend.db.models import ElectrolyteLog


async def add_log(
    db: AsyncSession,
    user_id: int,
    amount: float,
    reason: str,
    balance_after: float,
    ref_id: Optional[int] = None,
    ref_name: Optional[str] = None,
) -> ElectrolyteLog:
    """写入一条电解液流水记录"""
    log = ElectrolyteLog(
        user_id=user_id,
        amount=amount,
        reason=reason,
        ref_id=ref_id,
        ref_name=ref_name,
        balance_after=balance_after,
    )
    db.add(log)
    return log


async def get_logs_by_user(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 20,
) -> List[ElectrolyteLog]:
    """分页查询用户的电解液明细"""
    result = await db.execute(
        select(ElectrolyteLog)
        .where(ElectrolyteLog.user_id == user_id)
        .order_by(desc(ElectrolyteLog.created_at))
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_summary_by_user(
    db: AsyncSession,
    user_id: int,
) -> Dict:
    """
    按 reason 分组统计用户电解液收支

    返回:
        {
            "breakdown": {"checkin": 15.0, "topic_donation_out": -8.0, ...},
            "by_topic": [{"topic_id": 1, "topic_title": "...", "received": 20.0, "donated": 5.0}, ...]
        }
    """
    # 按 reason 汇总
    result = await db.execute(
        select(
            ElectrolyteLog.reason,
            func.sum(ElectrolyteLog.amount).label("total"),
        )
        .where(ElectrolyteLog.user_id == user_id)
        .group_by(ElectrolyteLog.reason)
    )
    breakdown = {row.reason: float(row.total) for row in result.all()}

    # 按话题汇总（仅投喂相关）
    donation_reasons = (
        "topic_donation_out", "topic_donation_in",
        "self_donation_out", "self_donation_in",
    )
    result = await db.execute(
        select(
            ElectrolyteLog.ref_id,
            ElectrolyteLog.ref_name,
            ElectrolyteLog.reason,
            func.sum(ElectrolyteLog.amount).label("total"),
        )
        .where(
            ElectrolyteLog.user_id == user_id,
            ElectrolyteLog.reason.in_(donation_reasons),
            ElectrolyteLog.ref_id.isnot(None),
        )
        .group_by(ElectrolyteLog.ref_id, ElectrolyteLog.ref_name, ElectrolyteLog.reason)
    )
    rows = result.all()

    topic_map: Dict[int, Dict] = {}
    for row in rows:
        if row.ref_id not in topic_map:
            topic_map[row.ref_id] = {
                "topic_id": row.ref_id,
                "topic_title": row.ref_name or "",
                "received": 0.0,
                "donated": 0.0,
            }
        if row.reason in ("topic_donation_in", "self_donation_in"):
            topic_map[row.ref_id]["received"] += float(row.total)
        elif row.reason in ("topic_donation_out", "self_donation_out"):
            topic_map[row.ref_id]["donated"] += float(row.total)

    by_topic = sorted(topic_map.values(), key=lambda x: x["received"], reverse=True)

    return {
        "breakdown": breakdown,
        "by_topic": by_topic,
    }
