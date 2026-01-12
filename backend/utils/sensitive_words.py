# backend/utils/sensitive_words.py
"""
敏感词检查工具
- 检查文本是否包含敏感词
- 敏感词管理（增删）
- 匹配规则：包含匹配
"""

from typing import List, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import SensitiveWord


# ============================================================
# 敏感词检查
# ============================================================

async def check_sensitive_word(
    db: AsyncSession,
    text: str
) -> Tuple[bool, str]:
    """
    检查文本是否包含敏感词
    
    匹配规则:
        - 包含匹配（不区分大小写）
        - 例如：敏感词 "admin"，可以匹配 "admin123"、"ADMIN"、"Admin"
    
    参数:
        db: 数据库会话
        text: 要检查的文本
    
    返回:
        (是否包含敏感词, 匹配到的敏感词)
        - (False, ""): 不包含敏感词
        - (True, "admin"): 包含敏感词 "admin"
    """
    if not text:
        return False, ""
    
    # 转为小写（不区分大小写匹配）
    text_lower = text.lower()
    
    # 获取所有敏感词
    sensitive_words = await get_all_sensitive_words(db)
    
    # 逐个检查
    for word in sensitive_words:
        word_lower = word.lower()
        if word_lower in text_lower:
            return True, word
    
    return False, ""


# ============================================================
# 敏感词管理
# ============================================================

async def get_all_sensitive_words(db: AsyncSession) -> List[str]:
    """
    获取所有敏感词列表
    
    参数:
        db: 数据库会话
    
    返回:
        敏感词列表（字符串数组）
    """
    result = await db.execute(
        select(SensitiveWord)
    )
    
    words = result.scalars().all()
    
    return [word.word for word in words]


async def add_sensitive_word(
    db: AsyncSession,
    word: str
) -> Tuple[bool, str]:
    """
    添加敏感词
    
    参数:
        db: 数据库会话
        word: 敏感词
    
    返回:
        (是否成功, 消息)
    """
    if not word or not word.strip():
        return False, "敏感词不能为空"
    
    word = word.strip()
    
    # 检查是否已存在
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.word == word)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        return False, "该敏感词已存在"
    
    # 添加
    new_word = SensitiveWord(word=word)
    db.add(new_word)
    await db.commit()
    
    return True, f"敏感词 '{word}' 已添加"


async def add_sensitive_words_batch(
    db: AsyncSession,
    words: List[str]
) -> Tuple[int, int]:
    """
    批量添加敏感词
    
    参数:
        db: 数据库会话
        words: 敏感词列表
    
    返回:
        (成功添加数量, 已存在数量)
    """
    success_count = 0
    exists_count = 0
    
    for word in words:
        if not word or not word.strip():
            continue
        
        word = word.strip()
        
        # 检查是否已存在
        result = await db.execute(
            select(SensitiveWord).where(SensitiveWord.word == word)
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            exists_count += 1
            continue
        
        # 添加
        new_word = SensitiveWord(word=word)
        db.add(new_word)
        success_count += 1
    
    await db.commit()
    
    return success_count, exists_count


async def remove_sensitive_word(
    db: AsyncSession,
    word_id: int
) -> Tuple[bool, str]:
    """
    删除敏感词（按ID）
    
    参数:
        db: 数据库会话
        word_id: 敏感词ID
    
    返回:
        (是否成功, 消息)
    """
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.id == word_id)
    )
    word = result.scalar_one_or_none()
    
    if not word:
        return False, "敏感词不存在"
    
    await db.delete(word)
    await db.commit()
    
    return True, f"敏感词 '{word.word}' 已删除"


async def remove_sensitive_word_by_text(
    db: AsyncSession,
    word_text: str
) -> Tuple[bool, str]:
    """
    删除敏感词（按内容）
    
    参数:
        db: 数据库会话
        word_text: 敏感词内容
    
    返回:
        (是否成功, 消息)
    """
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.word == word_text)
    )
    word = result.scalar_one_or_none()
    
    if not word:
        return False, "敏感词不存在"
    
    await db.delete(word)
    await db.commit()
    
    return True, f"敏感词 '{word_text}' 已删除"


async def get_sensitive_word_by_id(
    db: AsyncSession,
    word_id: int
) -> Optional[SensitiveWord]:
    """
    根据ID查询敏感词
    
    参数:
        db: 数据库会话
        word_id: 敏感词ID
    
    返回:
        敏感词对象（如果存在）
    """
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.id == word_id)
    )
    
    return result.scalar_one_or_none()
