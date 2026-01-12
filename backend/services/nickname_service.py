# backend/services/nickname_service.py
"""
昵称业务逻辑服务
- 昵称生成（从邮箱生成默认昵称）
- 昵称验证（格式、重复、敏感词）
- 昵称修改（完整流程：验证 → 扣费 → 修改 → 记录）
"""

import random
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import user as user_crud
from backend.db.crud import nickname as nickname_crud
from backend.db.crud import electrolyte as electrolyte_crud
from backend.utils.validators import validate_nickname_format
from backend.utils.sensitive_words import check_sensitive_word


# 配置常量
NICKNAME_CHANGE_COST = 6.0  # 修改昵称消耗的电解液


# ============================================================
# 昵称生成
# ============================================================

async def generate_default_nickname(
    db: AsyncSession,
    email: str
) -> str:
    """
    从邮箱生成默认昵称
    
    规则:
        1. 提取邮箱 @ 前面的部分作为基础昵称
        2. 如果该昵称未被占用，直接返回
        3. 如果已被占用，添加4位随机数后缀（如 user_8271）
        4. 如果带后缀的依然被占用，继续生成新的随机数
    
    参数:
        db: 数据库会话
        email: 邮箱地址
    
    返回:
        可用的昵称
    
    示例:
        user@gmail.com → "user"
        user@gmail.com（已存在）→ "user_8271"
    """
    # 提取邮箱前缀
    base_nickname = email.split('@')[0]
    
    # 限制长度（如果太长，截断）
    if len(base_nickname) > 45:  # 预留5个字符给 "_xxxx"
        base_nickname = base_nickname[:45]
    
    # 尝试使用原始昵称
    existing = await user_crud.get_user_by_nickname(db, base_nickname)
    if not existing:
        return base_nickname
    
    # 如果已被占用，添加随机后缀
    max_attempts = 10  # 最多尝试10次
    for _ in range(max_attempts):
        random_suffix = random.randint(1000, 9999)
        nickname_with_suffix = f"{base_nickname}_{random_suffix}"
        
        existing = await user_crud.get_user_by_nickname(db, nickname_with_suffix)
        if not existing:
            return nickname_with_suffix
    
    # 极端情况：10次都失败，使用时间戳
    import time
    timestamp_suffix = int(time.time() * 1000) % 100000
    return f"{base_nickname}_{timestamp_suffix}"


# ============================================================
# 昵称验证
# ============================================================

async def validate_nickname(
    db: AsyncSession,
    nickname: str,
    user_id: Optional[int] = None
) -> tuple[bool, str]:
    """
    验证昵称是否可用
    
    验证规则:
        1. 格式验证：长度 1-50
        2. 重复验证：是否已被其他用户使用
        3. 敏感词验证：是否包含敏感词
    
    参数:
        db: 数据库会话
        nickname: 要验证的昵称
        user_id: 当前用户ID（可选，用于排除自己）
    
    返回:
        (是否有效, 错误信息)
        - (True, "") 表示验证通过
        - (False, "错误原因") 表示验证失败
    """
    # 1. 格式验证
    is_valid_format, format_error = validate_nickname_format(nickname)
    if not is_valid_format:
        return False, format_error
    
    # 2. 重复验证
    existing_user = await user_crud.get_user_by_nickname(db, nickname)
    if existing_user:
        # 如果是用户自己当前的昵称，允许（不算重复）
        if user_id and existing_user.id == user_id:
            pass  # 允许
        else:
            return False, "该昵称已被使用"
    
    # 3. 敏感词验证
    is_sensitive, matched_word = await check_sensitive_word(db, nickname)
    if is_sensitive:
        return False, f"昵称包含敏感词：{matched_word}"
    
    return True, ""


# ============================================================
# 昵称修改
# ============================================================

async def change_nickname(
    db: AsyncSession,
    user_id: int,
    new_nickname: str
) -> dict:
    """
    修改用户昵称（完整流程）
    
    流程:
        1. 验证昵称是否有效
        2. 检查电解液是否足够
        3. 扣除电解液
        4. 更新昵称
        5. 记录历史
    
    参数:
        db: 数据库会话
        user_id: 用户ID
        new_nickname: 新昵称
    
    返回:
        {
            "success": bool,           # 是否成功
            "message": str,            # 消息
            "balance": float,          # 操作后的电解液余额
            "old_nickname": str,       # 旧昵称
            "new_nickname": str        # 新昵称
        }
    """
    # 获取用户信息
    user = await user_crud.get_user_by_id(db, user_id)
    if not user:
        return {
            "success": False,
            "message": "用户不存在",
            "balance": 0.0,
            "old_nickname": "",
            "new_nickname": ""
        }
    
    old_nickname = user.nickname
    
    # 1. 验证昵称
    is_valid, error_msg = await validate_nickname(db, new_nickname, user_id)
    if not is_valid:
        return {
            "success": False,
            "message": error_msg,
            "balance": user.electrolyte_number,
            "old_nickname": old_nickname or "",
            "new_nickname": new_nickname
        }
    
    # 2. 检查并扣除电解液（Plus会员暂无优惠）
    cost = NICKNAME_CHANGE_COST
    
    success, msg, new_balance = await electrolyte_crud.deduct_electrolyte(
        db, user_id, cost, reason="change_nickname"
    )
    
    if not success:
        return {
            "success": False,
            "message": msg,  # "电解液不足"
            "balance": new_balance,
            "old_nickname": old_nickname or "",
            "new_nickname": new_nickname
        }
    
    # 3. 更新昵称
    updated_user = await nickname_crud.update_user_nickname(
        db, user_id, new_nickname, electrolyte_cost=cost
    )
    
    if not updated_user:
        return {
            "success": False,
            "message": "昵称更新失败",
            "balance": new_balance,
            "old_nickname": old_nickname or "",
            "new_nickname": new_nickname
        }
    
    # 4. 记录历史
    await nickname_crud.add_nickname_history(
        db, user_id, old_nickname, new_nickname, electrolyte_cost=cost
    )
    
    return {
        "success": True,
        "message": f"昵称已修改为 {new_nickname}，消耗 {cost} 电解液",
        "balance": new_balance,
        "old_nickname": old_nickname or "",
        "new_nickname": new_nickname
    }


# ============================================================
# 首次设置昵称（免费）
# ============================================================

async def set_initial_nickname(
    db: AsyncSession,
    user_id: int,
    nickname: str
) -> dict:
    """
    首次设置昵称（免费，不消耗电解液）
    
    使用场景:
        - 用户注册时未提供昵称
        - 后续第一次设置昵称
    
    参数:
        db: 数据库会话
        user_id: 用户ID
        nickname: 昵称
    
    返回:
        {
            "success": bool,
            "message": str,
            "nickname": str
        }
    """
    # 获取用户信息
    user = await user_crud.get_user_by_id(db, user_id)
    if not user:
        return {
            "success": False,
            "message": "用户不存在",
            "nickname": ""
        }
    
    # 检查是否已有昵称
    if user.nickname:
        return {
            "success": False,
            "message": "已设置过昵称，修改昵称需要消耗电解液",
            "nickname": user.nickname
        }
    
    # 验证昵称
    is_valid, error_msg = await validate_nickname(db, nickname, user_id)
    if not is_valid:
        return {
            "success": False,
            "message": error_msg,
            "nickname": ""
        }
    
    # 更新昵称（免费）
    updated_user = await nickname_crud.update_user_nickname(
        db, user_id, nickname, electrolyte_cost=0.0
    )
    
    if not updated_user:
        return {
            "success": False,
            "message": "昵称设置失败",
            "nickname": ""
        }
    
    # 记录历史（标记为首次设置，消耗0电解液）
    await nickname_crud.add_nickname_history(
        db, user_id, None, nickname, electrolyte_cost=0.0
    )
    
    return {
        "success": True,
        "message": f"昵称已设置为 {nickname}",
        "nickname": nickname
    }
