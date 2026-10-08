import re
from datetime import datetime
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.auth import UserProfile, current_user

router = APIRouter(tags=["scans"])


def normalize_vin(value: str) -> str:
    return value.strip().upper()


def normalize_plate(value: str) -> str:
    return re.sub(r"[\s-]+", "", value.upper())


def still_eligible_for_repo(vin: str) -> bool:
    return vin[-1] in "02468"


class ScanIngestionRequest(BaseModel):
    camera_id: int = Field(strict=True, gt=0)
    plate: str = Field(min_length=1, max_length=32)
    vin: str = Field(min_length=17, max_length=17, pattern=r"^[A-Za-z0-9]+$")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    scanned_at: datetime
    image_url: HttpUrl

    @field_validator("vin", mode="before")
    @classmethod
    def canonicalize_vin(cls, value: object) -> object:
        return normalize_vin(value) if isinstance(value, str) else value

    @field_validator("plate", mode="before")
    @classmethod
    def canonicalize_plate(cls, value: object) -> object:
        return normalize_plate(value) if isinstance(value, str) else value

    @field_validator("scanned_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("scanned_at must include a timezone offset")
        return value


class EligibilityRequest(BaseModel):
    vin: str = Field(min_length=17, max_length=17, pattern=r"^[A-Za-z0-9]+$")

    @field_validator("vin", mode="before")
    @classmethod
    def canonicalize_vin(cls, value: object) -> object:
        return normalize_vin(value) if isinstance(value, str) else value


class EligibilityResponse(BaseModel):
    vin: str
    still_eligible_for_repo: bool


ScanOutcome = Literal[
    "EXISTING_CASE", "NOT_ELIGIBLE", "CASE_CREATED", "OPEN_CASE_EXISTS"
]


class ScanIngestionResponse(BaseModel):
    scan_id: int
    vehicle_id: int
    outcome: ScanOutcome
    case_id: int | None
    eligible: bool | None


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


async def _resolve_camera(
    connection: asyncpg.Connection, camera_id: int
) -> asyncpg.Record:
    camera = await connection.fetchrow(
        """
        SELECT c.id, av.tenant_id
        FROM cameras c
        JOIN agency_vehicles av ON av.id = c.agency_vehicle_id
        WHERE c.id = $1
        """,
        camera_id,
    )
    if camera is None:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "CAMERA_NOT_FOUND",
            "The camera does not exist",
        )
    return camera


async def _resolve_vehicle(
    connection: asyncpg.Connection, vin: str, plate: str
) -> asyncpg.Record:
    vehicles = await connection.fetch(
        """
        SELECT id, vin, plate
        FROM target_vehicles
        WHERE vin = $1 OR plate = $2
        ORDER BY id
        """,
        vin,
        plate,
    )
    if not vehicles:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "VEHICLE_NOT_FOUND",
            "The VIN and plate were not found in the vehicle registry",
        )
    if (
        len(vehicles) != 1
        or vehicles[0]["vin"] != vin
        or vehicles[0]["plate"] != plate
    ):
        raise _error(
            status.HTTP_409_CONFLICT,
            "VEHICLE_IDENTITY_MISMATCH",
            "The VIN and plate do not identify the same registry vehicle",
        )
    return vehicles[0]


async def _find_open_case(
    connection: asyncpg.Connection, vehicle_id: int
) -> asyncpg.Record | None:
    return await connection.fetchrow(
        """
        SELECT id, status, tenant_id
        FROM recovery_cases
        WHERE vehicle_id = $1
          AND status IN ('PENDING_CLAIM', 'ACTIVE')
        ORDER BY id
        LIMIT 1
        """,
        vehicle_id,
    )


def _existing_case_response(
    *, scan_id: int, vehicle_id: int, tenant_id: int, recovery_case: asyncpg.Record
) -> ScanIngestionResponse:
    belongs_to_tenant = (
        recovery_case["status"] == "ACTIVE"
        and recovery_case["tenant_id"] == tenant_id
    )
    return ScanIngestionResponse(
        scan_id=scan_id,
        vehicle_id=vehicle_id,
        outcome="EXISTING_CASE" if belongs_to_tenant else "OPEN_CASE_EXISTS",
        case_id=recovery_case["id"],
        eligible=None,
    )


@router.post(
    "/api/v1/scans",
    response_model=ScanIngestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_scan(
    payload: ScanIngestionRequest,
    request: Request,
    user: Annotated[UserProfile, Depends(current_user)],
) -> ScanIngestionResponse:
    if user.role != "AGENT":
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "AGENT_ROLE_REQUIRED",
            "Only agents may report scans",
        )

    pool: asyncpg.Pool = request.app.state.db_pool
    async with pool.acquire() as connection:
        async with connection.transaction():
            camera = await _resolve_camera(connection, payload.camera_id)
            if camera["tenant_id"] != user.tenant.id:
                raise _error(
                    status.HTTP_403_FORBIDDEN,
                    "CAMERA_TENANT_MISMATCH",
                    "The camera does not belong to the authenticated user's tenant",
                )

            vehicle = await _resolve_vehicle(connection, payload.vin, payload.plate)
            scan_id = await connection.fetchval(
                """
                INSERT INTO scans (
                    camera_id, reported_by, vehicle_id, image_url,
                    latitude, longitude, scanned_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
                """,
                payload.camera_id,
                user.id,
                vehicle["id"],
                str(payload.image_url),
                payload.latitude,
                payload.longitude,
                payload.scanned_at,
            )
            recovery_case = await _find_open_case(connection, vehicle["id"])

    if recovery_case is not None:
        return _existing_case_response(
            scan_id=scan_id,
            vehicle_id=vehicle["id"],
            tenant_id=camera["tenant_id"],
            recovery_case=recovery_case,
        )

    eligible = still_eligible_for_repo(payload.vin)
    if not eligible:
        return ScanIngestionResponse(
            scan_id=scan_id,
            vehicle_id=vehicle["id"],
            outcome="NOT_ELIGIBLE",
            case_id=None,
            eligible=False,
        )

    async with pool.acquire() as connection:
        async with connection.transaction():
            case_id = await connection.fetchval(
                """
                INSERT INTO recovery_cases (vehicle_id, status, tenant_id, assignee_id)
                VALUES ($1, 'PENDING_CLAIM', NULL, NULL)
                ON CONFLICT (vehicle_id)
                    WHERE status IN ('PENDING_CLAIM', 'ACTIVE')
                DO NOTHING
                RETURNING id
                """,
                vehicle["id"],
            )
            if case_id is None:
                recovery_case = await _find_open_case(connection, vehicle["id"])
                if recovery_case is None:
                    raise RuntimeError("Open-case conflict occurred without an open case")

    if case_id is None:
        response = _existing_case_response(
            scan_id=scan_id,
            vehicle_id=vehicle["id"],
            tenant_id=camera["tenant_id"],
            recovery_case=recovery_case,
        )
        return response.model_copy(update={"eligible": True})

    return ScanIngestionResponse(
        scan_id=scan_id,
        vehicle_id=vehicle["id"],
        outcome="CASE_CREATED",
        case_id=case_id,
        eligible=True,
    )


@router.post(
    "/mock/partner-network/eligibility",
    response_model=EligibilityResponse,
    tags=["mock partner network"],
)
async def mock_eligibility(payload: EligibilityRequest) -> EligibilityResponse:
    return EligibilityResponse(
        vin=payload.vin,
        still_eligible_for_repo=still_eligible_for_repo(payload.vin),
    )
