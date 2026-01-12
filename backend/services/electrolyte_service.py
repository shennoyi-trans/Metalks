# backend/services/electrolyte_service.py
"""
电解液业务逻辑服务
- 每日签到（一天内首次登录给1个电解液）
- 电解液消费
- 电解液充值（管理员功能）
- 余额查询
"""

from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import user as user_crud
from backend.db.crud import electrolyte as electrolyte_crud


# 配置常量
DAILY_CHECKIN_REWARD = 1.0  # 每日签到奖励


# ============================================================
# 每日签到
# ============================================================

async def process_daily_checkin(
    db: AsyncSession,
    user_id: int
) -> dict:
    """
    处理每日签到逻辑
    
    规则:
        - 一天内首次登录时，自动给予 1 个电解液
        - 通过 last_login_date 字段判断今天是否已签到
        - 已签到则不重复给予
    
    参数:
        db: 数据库会话
        user_id: 用户ID
    
    返回:
        {
            "already_checked": bool,    # 今天是否已签到
            "gained": float,            # 本次获得的电解液（0或1）
            "balance": float,           # 签到后的总余额
            "message": str              # 消息
        }
    """
    # 检查今天是否已登录
    already_checked = await user_crud.check_user_login_today(db, user_id)
    
    if already_checked:
        # 今天已签到，不重复给予
        balance = await electrolyte_crud.get_electrolyte_balance(db, user_id)
        return {
            "already_checked": True,
            "gained": 0.0,
            "balance": balance or 0.0,
            "message": "今天已经签到过了"
        }
    
    # 今天首次登录，给予奖励
    success, msg, new_balance = await electrolyte_crud.add_electrolyte(
        db, user_id, DAILY_CHECKIN_REWARD, reason="daily_checkin"
    )
    
    if not success:
        return {
            "already_checked": False,
            "gained": 0.0,
            "balance": 0.0,
            "message": "签到失败"
        }
    
    # 更新最后登录日期
    await user_crud.update_last_login_date(db, user_id, date.today())
    
    return {
        "already_checked": False,
        "gained": DAILY_CHECKIN_REWARD,
        "balance": new_balance,
        "message": f"签到成功！获得 {DAILY_CHECKIN_REWARD} 电解液"
    }


# ============================================================
# 电解液消费
# ============================================================

async def consume_electrolyte(
    db: AsyncSession,
    user_id: int,
    amount: float,
    reason: str = ""
) -> dict:
    """
    消费电解液
    
    参数:
        db: 数据库会话
        user_id: 用户ID
        amount: 消费数量
        reason: 消费原因
    
    返回:
        {
            "success": bool,
            "message": str,
            "balance": float
        }
    """
    success, msg, balance = await electrolyte_crud.deduct_electrolyte(
        db, user_id, amount, reason
    )
    
    return {
        "success": success,
        "message": msg,
        "balance": balance
    }


# ============================================================
# 电解液充值（管理员功能）
# ============================================================

async def recharge_electrolyte(
    db: AsyncSession,
    user_id: int,
    amount: float,
    reason: str = "admin_gift"
) -> dict:
    """
    充值电解液（管理员操作）
    
    参数:
        db: 数据库会话
        user_id: 用户ID
        amount: 充值数量
        reason: 原因说明
    
    返回:
        {
            "success": bool,
            "message": str,
            "balance": float
        }
    """
    success, msg, balance = await electrolyte_crud.add_electrolyte(
        db, user_id, amount, reason
    )
    
    return {
        "success": success,
        "message": msg,
        "balance": balance
    }


# ============================================================
# 余额查询
# ============================================================

async def get_electrolyte_info(
    db: AsyncSession,
    user_id: int
) -> dict:
    """
    查询用户电解液信息
    
    参数:
        db: 数据库会话
        user_id: 用户ID
    
    返回:
        {
            "balance": float,
            "message": str
        }
    """
    balance = await electrolyte_crud.get_electrolyte_balance(db, user_id)
    
    if balance is None:
        return {
            "balance": 0.0,
            "message": "用户不存在"
        }
    
    return {
        "balance": balance,
        "message": "查询成功"
    }
