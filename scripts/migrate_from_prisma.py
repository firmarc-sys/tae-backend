#!/usr/bin/env python3
"""Migrate data from Prisma (PostgreSQL) to SQLAlchemy models.

Run after the Alembic baseline migration creates the new tables:
  1. alembic upgrade head
  2. python scripts/migrate_from_prisma.py

Reads from the old Prisma tables (User, Alert, RefreshToken) and
inserts into the new SQLAlchemy tables (users, refresh_tokens, etc.).
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from app.config import get_settings


async def migrate():
    settings = get_settings()
    url = settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        result = await session.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'User')"
        ))
        has_prisma = result.scalar()

        if not has_prisma:
            print("No Prisma 'User' table found — nothing to migrate.")
            return

        result = await session.execute(text(
            "SELECT id, email, password_hash, display_name, gid, role, plan, "
            "whitelisted, \"stripe_customer_id\", \"stripe_subscription_id\", "
            "\"tokens_used\", \"tokens_limit\", \"renewal_date\", created_at, updated_at "
            "FROM \"User\""
        ))
        rows = result.fetchall()
        print(f"Found {len(rows)} users to migrate")

        for row in rows:
            await session.execute(text(
                "INSERT INTO users (id, email, password_hash, display_name, gid, role, plan, "
                "whitelisted, stripe_customer_id, stripe_subscription_id, tokens_used, "
                "tokens_limit, renewal_date, created_at, updated_at) "
                "VALUES (:id, :email, :password_hash, :display_name, :gid, :role, :plan, "
                ":whitelisted, :stripe_customer_id, :stripe_subscription_id, :tokens_used, "
                ":tokens_limit, :renewal_date, :created_at, :updated_at) "
                "ON CONFLICT (email) DO NOTHING"
            ), {
                "id": row[0], "email": row[1], "password_hash": row[2],
                "display_name": row[3], "gid": row[4], "role": row[5],
                "plan": row[6], "whitelisted": row[7],
                "stripe_customer_id": row[8], "stripe_subscription_id": row[9],
                "tokens_used": row[10], "tokens_limit": row[11],
                "renewal_date": row[12], "created_at": row[13], "updated_at": row[14],
            })

        result = await session.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'RefreshToken')"
        ))
        if result.scalar():
            result = await session.execute(text(
                "SELECT id, user_id, token, expires_at, created_at FROM \"RefreshToken\""
            ))
            for row in result.fetchall():
                await session.execute(text(
                    "INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at) "
                    "VALUES (:id, :user_id, :token, :expires_at, :created_at) "
                    "ON CONFLICT (token) DO NOTHING"
                ), {"id": row[0], "user_id": row[1], "token": row[2],
                    "expires_at": row[3], "created_at": row[4]})

        await session.commit()
        print("Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
