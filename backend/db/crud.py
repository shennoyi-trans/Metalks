from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.models import User
from backend.core.security import hash_password, verify_password


# ============================
# 创建用户
# ============================
async def create_user(db: AsyncSession, email: str, password: str):
    hashed = hash_password(password)
    user = User(email=email, password_hash=hashed)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ============================
# 按 email 查找用户
# ============================
async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


# ============================
# 检查用户名密码
# ============================
async def authenticate_user(db: AsyncSession, email: str, password: str):
    user = await get_user_by_email(db, email)
    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user
