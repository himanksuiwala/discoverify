import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.db.connection import close_pool, create_pool


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.db_pool = await create_pool()
    try:
        yield
    finally:
        await close_pool(app.state.db_pool)


app = FastAPI(title="Archetype API", version="0.1.0", lifespan=lifespan)


@app.get("/api/health", tags=["health"])
async def health() -> JSONResponse:
    database_available = False

    try:
        async with asyncio.timeout(3):
            async with app.state.db_pool.acquire() as connection:
                database_available = await connection.fetchval("SELECT 1") == 1
    except (asyncpg.PostgresError, OSError, TimeoutError):
        database_available = False

    payload = {
        "status": "healthy" if database_available else "unhealthy",
        "services": {
            "backend": "available",
            "database": "available" if database_available else "unavailable",
        },
    }

    return JSONResponse(payload, status_code=200 if database_available else 503)
