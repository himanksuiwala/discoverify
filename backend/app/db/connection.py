import os

import asyncpg

DEFAULT_DATABASE_URL = "postgresql://lpr_user:lpr_password@localhost:5432/lpr_db"


def database_url() -> str:
    return os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)


async def create_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        database_url(),
        min_size=0,
        max_size=5,
        command_timeout=5,
    )


async def close_pool(pool: asyncpg.Pool) -> None:
    await pool.close()

