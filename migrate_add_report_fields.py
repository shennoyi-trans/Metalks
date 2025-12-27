#!/usr/bin/env python3
"""
数据库迁移脚本：为 sessions 表添加报告相关字段
执行方式：python migrate_add_report_fields.py
"""

import asyncio
from sqlalchemy import text
from backend.db.database import engine


async def migrate():
    async with engine.begin() as conn:
        print("🔧 开始迁移：为 sessions 表添加报告字段...")
        
        # 检查字段是否已存在
        check_sql = """
        SELECT COUNT(*) 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'metalks' 
        AND TABLE_NAME = 'sessions' 
        AND COLUMN_NAME = 'report_ready'
        """
        result = await conn.execute(text(check_sql))
        exists = result.scalar()
        
        if exists > 0:
            print("⚠️  字段 report_ready 已存在，跳过迁移")
            return
        
        # 添加 report_ready 字段
        await conn.execute(text("""
            ALTER TABLE sessions 
            ADD COLUMN report_ready BOOLEAN NOT NULL DEFAULT FALSE
        """))
        print("✅ 添加字段：report_ready")
        
        # 添加 opinion_report 字段
        await conn.execute(text("""
            ALTER TABLE sessions 
            ADD COLUMN opinion_report TEXT DEFAULT NULL
        """))
        print("✅ 添加字段：opinion_report")
        
        print("🎉 迁移完成！")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())