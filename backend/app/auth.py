import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal

import asyncpg
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from dotenv import load_dotenv
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

JWT_ALGORITHM = "HS256"
JWT_AUDIENCE = "archetype-web"
JWT_ISSUER = "archetype-api"
JWT_LIFETIME = timedelta(minutes=30)
AUTH_COOKIE_NAME = "archetype_access_token"

password_hasher = PasswordHasher()
router = APIRouter(prefix="/api", tags=["authentication"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class TenantProfile(BaseModel):
    id: int
    name: str


class UserProfile(BaseModel):
    id: int
    firstName: str
    lastName: str
    email: str
    role: Literal["ADMIN", "STAFF", "AGENT"]
    tenant: TenantProfile


class AuthenticatedResponse(BaseModel):
    authenticated: Literal[True] = True


def validate_auth_configuration() -> None:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError(
            "JWT_SECRET is required. Copy .env.example to .env before starting the API."
        )
    if len(secret.encode()) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 bytes for HS256")


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return secret


def _cookie_secure() -> bool:
    return os.getenv("AUTH_COOKIE_SECURE", "false").casefold() == "true"


def _normalize_email(email: str) -> str:
    return email.strip().casefold()


def _create_access_token(user_id: int) -> str:
    issued_at = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": issued_at,
            "exp": issued_at + JWT_LIFETIME,
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
        },
        _jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )


def _profile_from_row(row: asyncpg.Record) -> UserProfile:
    return UserProfile(
        id=row["id"],
        firstName=row["first_name"],
        lastName=row["last_name"],
        email=row["email"],
        role=row["role"],
        tenant=TenantProfile(id=row["tenant_id"], name=row["tenant_name"]),
    )


async def _fetch_profile(pool: asyncpg.Pool, user_id: int) -> UserProfile | None:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            SELECT
                au.id,
                au.first_name,
                au.last_name,
                au.email,
                au.role,
                t.id AS tenant_id,
                t.name AS tenant_name
            FROM app_users au
            JOIN tenants t ON t.id = au.tenant_id
            WHERE au.id = $1
            """,
            user_id,
        )
    return _profile_from_row(row) if row else None


async def current_user(
    request: Request,
    access_token: Annotated[str | None, Cookie(alias=AUTH_COOKIE_NAME)] = None,
) -> UserProfile:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
    if not access_token:
        raise unauthorized

    try:
        claims = jwt.decode(
            access_token,
            _jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["sub", "iat", "exp", "iss", "aud"]},
        )
        user_id = int(claims["sub"])
        if user_id <= 0:
            raise ValueError
    except (jwt.InvalidTokenError, TypeError, ValueError):
        raise unauthorized from None

    profile = await _fetch_profile(request.app.state.db_pool, user_id)
    if profile is None:
        raise unauthorized
    return profile


@router.post("/auth/login", response_model=AuthenticatedResponse)
async def login(
    payload: LoginRequest, request: Request, response: Response
) -> dict[str, bool]:
    email = _normalize_email(payload.email)
    async with request.app.state.db_pool.acquire() as connection:
        user = await connection.fetchrow(
            """
            SELECT id, password_hash
            FROM app_users
            WHERE LOWER(email) = $1
            """,
            email,
        )

    valid_password = False
    if user:
        try:
            valid_password = password_hasher.verify(
                user["password_hash"], payload.password
            )
        except (InvalidHashError, VerificationError):
            valid_password = False

    if not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=_create_access_token(user["id"]),
        max_age=int(JWT_LIFETIME.total_seconds()),
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/api",
    )
    return {"authenticated": True}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        path="/api",
    )
    return response


@router.get("/profile", response_model=UserProfile)
async def profile(
    user: Annotated[UserProfile, Depends(current_user)],
) -> UserProfile:
    return user
