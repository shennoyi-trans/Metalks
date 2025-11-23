import asyncio
from backend.db.database import engine, Base
import backend.db.models    # ❗ 必须 import models，否则不会建表

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 关闭连接池，避免 AIOMySQL “Event loop closed” 的退出警告
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_models())
