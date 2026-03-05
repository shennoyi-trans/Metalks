# backend/utils/sensitive_words.py
"""
敏感词检查工具
- 检查文本是否包含敏感词
- 敏感词管理（增删）
- 匹配规则：包含匹配
- ✅ 新增：进程内 TTL 缓存（5 分钟），避免每次全表扫描
"""

import time
from typing import List, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.db.models import SensitiveWord

# ✅ 新增：进程内缓存层
_cache_words: List[str] = []
_cache_timestamp: float = 0.0
_CACHE_TTL: float = 300.0  # 5 分钟


async def _get_words_cached(db: AsyncSession) -> List[str]:
    """带 TTL 的敏感词缓存"""
    global _cache_words, _cache_timestamp
    now = time.monotonic()
    if _cache_words and (now - _cache_timestamp) < _CACHE_TTL:
        return _cache_words
    result = await db.execute(select(SensitiveWord))
    _cache_words = [w.word for w in result.scalars().all()]
    _cache_timestamp = now
    return _cache_words


def invalidate_cache():
    """管理员增删敏感词后调用"""
    global _cache_words, _cache_timestamp
    _cache_words = []
    _cache_timestamp = 0.0


# ============================================================
# 以下函数接口完全不变，内部统一走缓存
# ============================================================

async def check_sensitive_word(db: AsyncSession, text: str) -> Tuple[bool, str]:
    """
    检查文本是否包含敏感词（不区分大小写）
    """
    if not text:
        return False, ""
    text_lower = text.lower()
    sensitive_words = await _get_words_cached(db)  # ✅ 使用缓存
    for word in sensitive_words:
        if word.lower() in text_lower:
            return True, word
    return False, ""


async def get_all_sensitive_words(db: AsyncSession) -> List[str]:
    # ✅ 也走缓存（原来直接查表），返回副本防止外部修改缓存
    return list(await _get_words_cached(db))


async def add_sensitive_word(db: AsyncSession, word: str) -> Tuple[bool, str]:
    if not word or not word.strip():
        return False, "敏感词不能为空"
    word = word.strip()
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.word == word)
    )
    if result.scalar_one_or_none():
        return False, "该敏感词已存在"
    db.add(SensitiveWord(word=word))
    await db.commit()
    invalidate_cache()  # ✅ 新增
    return True, f"敏感词 '{word}' 已添加"


async def add_sensitive_words_batch(db: AsyncSession, words: List[str]) -> Tuple[int, int]:
    success_count = exists_count = 0
    for word in words:
        if not word or not word.strip():
            continue
        word = word.strip()
        result = await db.execute(
            select(SensitiveWord).where(SensitiveWord.word == word)
        )
        if result.scalar_one_or_none():
            exists_count += 1
            continue
        db.add(SensitiveWord(word=word))
        success_count += 1
    await db.commit()
    invalidate_cache()  # ✅ 新增
    return success_count, exists_count


async def remove_sensitive_word(db: AsyncSession, word_id: int) -> Tuple[bool, str]:
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.id == word_id)
    )
    word = result.scalar_one_or_none()
    if not word:
        return False, "敏感词不存在"
    await db.delete(word)
    await db.commit()
    invalidate_cache()  # ✅ 新增
    return True, f"敏感词 '{word.word}' 已删除"


async def remove_sensitive_word_by_text(db: AsyncSession, word_text: str) -> Tuple[bool, str]:
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.word == word_text)
    )
    word = result.scalar_one_or_none()
    if not word:
        return False, "敏感词不存在"
    await db.delete(word)
    await db.commit()
    invalidate_cache()  # ✅ 新增
    return True, f"敏感词 '{word_text}' 已删除"


async def get_sensitive_word_by_id(
    db: AsyncSession, word_id: int
) -> Optional[SensitiveWord]:
    result = await db.execute(
        select(SensitiveWord).where(SensitiveWord.id == word_id)
    )
    return result.scalar_one_or_none()
