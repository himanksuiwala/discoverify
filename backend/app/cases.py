import re
from datetime import datetime
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.auth import UserProfile, current_user
from app.scans import normalize_plate, normalize_vin

router = APIRouter(prefix="/api/v1/cases", tags=["cases"])

CaseStatus = Literal["PENDING_CLAIM", "ACTIVE", "CLOSED"]
OwnedCaseStatus = Literal["ACTIVE", "CLOSED"]


class VehicleSummary(BaseModel):
    id: int
    vin: str
    plate: str
    make: str
    model: str


class AssigneeSummary(BaseModel):
    id: int
    first_name: str
    last_name: str


class LatestSighting(BaseModel):
    scanned_at: datetime
    latitude: float
    longitude: float


class CaseSummary(BaseModel):
    id: int
    status: CaseStatus
    vehicle: VehicleSummary
    assignee: AssigneeSummary | None
    latest_sighting: LatestSighting | None
    created_at: datetime
    updated_at: datetime


class CasePage(BaseModel):
    items: list[CaseSummary]
    total: int
    limit: int
    offset: int


class ReporterSummary(BaseModel):
    first_name: str
    last_name: str


class CameraSummary(BaseModel):
    id: int
    serial_number: str


class AgencyVehicleSummary(BaseModel):
    id: int
    identifier: str


class CaseScan(BaseModel):
    id: int
    scanned_at: datetime
    latitude: float
    longitude: float
    image_url: str
    reported_by: ReporterSummary | None
    camera: CameraSummary | None
    agency_vehicle: AgencyVehicleSummary | None


class CaseDetail(CaseSummary):
    scans: list[CaseScan]


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _require_case_reader(user: UserProfile) -> None:
    if user.role not in ("STAFF", "ADMIN"):
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "CASE_READ_FORBIDDEN",
            "Only staff and administrators may view recovery cases",
        )


def _require_staff(user: UserProfile) -> None:
    if user.role != "STAFF":
        raise _error(
            status.HTTP_403_FORBIDDEN,
            "STAFF_ROLE_REQUIRED",
            "Only staff may access or claim pending recovery cases",
        )


def _normalize_search_filters(
    vin: str | None, plate: str | None
) -> tuple[str | None, str | None]:
    normalized_vin = normalize_vin(vin) if vin is not None else None
    normalized_plate = normalize_plate(plate) if plate is not None else None

    if normalized_vin is not None and not re.fullmatch(
        r"[A-Z0-9]{17}", normalized_vin
    ):
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "INVALID_VIN",
            "VIN must contain exactly 17 alphanumeric characters",
        )
    if normalized_plate is not None and not 1 <= len(normalized_plate) <= 32:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "INVALID_PLATE",
            "Plate must contain between 1 and 32 normalized characters",
        )
    return normalized_vin, normalized_plate


CASE_SUMMARY_SELECT = """
    SELECT
        rc.id,
        rc.status,
        rc.created_at,
        rc.updated_at,
        tv.id AS vehicle_id,
        tv.vin,
        tv.plate,
        tv.make,
        tv.model,
        au.id AS assignee_id,
        au.first_name AS assignee_first_name,
        au.last_name AS assignee_last_name,
        latest.scanned_at AS latest_scanned_at,
        latest.latitude AS latest_latitude,
        latest.longitude AS latest_longitude
    FROM recovery_cases rc
    JOIN target_vehicles tv ON tv.id = rc.vehicle_id
    LEFT JOIN app_users au ON au.id = rc.assignee_id
    LEFT JOIN LATERAL (
        SELECT s.scanned_at, s.latitude, s.longitude
        FROM scans s
        WHERE s.vehicle_id = rc.vehicle_id
        ORDER BY s.scanned_at DESC, s.id DESC
        LIMIT 1
    ) latest ON TRUE
"""


def _summary_from_row(row: asyncpg.Record) -> CaseSummary:
    assignee = None
    if row["assignee_id"] is not None:
        assignee = AssigneeSummary(
            id=row["assignee_id"],
            first_name=row["assignee_first_name"],
            last_name=row["assignee_last_name"],
        )

    latest_sighting = None
    if row["latest_scanned_at"] is not None:
        latest_sighting = LatestSighting(
            scanned_at=row["latest_scanned_at"],
            latitude=row["latest_latitude"],
            longitude=row["latest_longitude"],
        )

    return CaseSummary(
        id=row["id"],
        status=row["status"],
        vehicle=VehicleSummary(
            id=row["vehicle_id"],
            vin=row["vin"],
            plate=row["plate"],
            make=row["make"],
            model=row["model"],
        ),
        assignee=assignee,
        latest_sighting=latest_sighting,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _fetch_owned_case_summary(
    connection: asyncpg.Connection, case_id: int, tenant_id: int
) -> asyncpg.Record | None:
    return await connection.fetchrow(
        CASE_SUMMARY_SELECT
        + """
        WHERE rc.id = $1
          AND rc.tenant_id = $2
          AND rc.status IN ('ACTIVE', 'CLOSED')
        """,
        case_id,
        tenant_id,
    )


@router.get("", response_model=CasePage)
async def list_cases(
    request: Request,
    user: Annotated[UserProfile, Depends(current_user)],
    case_status: Annotated[
        OwnedCaseStatus | None, Query(alias="status")
    ] = None,
    vin: Annotated[str | None, Query()] = None,
    plate: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CasePage:
    _require_case_reader(user)
    vin, plate = _normalize_search_filters(vin, plate)

    filters = """
        rc.tenant_id = $1
        AND rc.status IN ('ACTIVE', 'CLOSED')
        AND ($2::text IS NULL OR rc.status = $2)
        AND ($3::text IS NULL OR tv.vin = $3)
        AND ($4::text IS NULL OR tv.plate = $4)
    """
    pool: asyncpg.Pool = request.app.state.db_pool
    async with pool.acquire() as connection:
        total = await connection.fetchval(
            """
            SELECT COUNT(*)
            FROM recovery_cases rc
            JOIN target_vehicles tv ON tv.id = rc.vehicle_id
            WHERE
            """
            + filters,
            user.tenant.id,
            case_status,
            vin,
            plate,
        )
        rows = await connection.fetch(
            CASE_SUMMARY_SELECT
            + """
            WHERE
            """
            + filters
            + """
            ORDER BY rc.updated_at DESC, rc.id DESC
            LIMIT $5 OFFSET $6
            """,
            user.tenant.id,
            case_status,
            vin,
            plate,
            limit,
            offset,
        )

    return CasePage(
        items=[_summary_from_row(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/claimable", response_model=CasePage)
async def list_claimable_cases(
    request: Request,
    user: Annotated[UserProfile, Depends(current_user)],
    vin: Annotated[str | None, Query()] = None,
    plate: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CasePage:
    _require_staff(user)
    vin, plate = _normalize_search_filters(vin, plate)

    filters = """
        rc.status = 'PENDING_CLAIM'
        AND NOT EXISTS (
            SELECT 1
            FROM recovery_cases existing
            WHERE existing.vehicle_id = rc.vehicle_id
              AND existing.tenant_id = $1
              AND existing.status = 'ACTIVE'
        )
        AND ($2::text IS NULL OR tv.vin = $2)
        AND ($3::text IS NULL OR tv.plate = $3)
    """
    pool: asyncpg.Pool = request.app.state.db_pool
    async with pool.acquire() as connection:
        total = await connection.fetchval(
            """
            SELECT COUNT(*)
            FROM recovery_cases rc
            JOIN target_vehicles tv ON tv.id = rc.vehicle_id
            WHERE
            """
            + filters,
            user.tenant.id,
            vin,
            plate,
        )
        rows = await connection.fetch(
            CASE_SUMMARY_SELECT
            + """
            WHERE
            """
            + filters
            + """
            ORDER BY rc.created_at ASC, rc.id ASC
            LIMIT $4 OFFSET $5
            """,
            user.tenant.id,
            vin,
            plate,
            limit,
            offset,
        )

    return CasePage(
        items=[_summary_from_row(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{case_id}", response_model=CaseDetail)
async def get_case(
    case_id: int,
    request: Request,
    user: Annotated[UserProfile, Depends(current_user)],
) -> CaseDetail:
    _require_case_reader(user)
    pool: asyncpg.Pool = request.app.state.db_pool
    async with pool.acquire() as connection:
        row = await _fetch_owned_case_summary(connection, case_id, user.tenant.id)
        if row is None:
            raise _error(
                status.HTTP_404_NOT_FOUND,
                "CASE_NOT_FOUND",
                "The recovery case does not exist",
            )

        scan_rows = await connection.fetch(
            """
            SELECT
                s.id,
                s.scanned_at,
                s.latitude,
                s.longitude,
                s.image_url,
                CASE
                    WHEN av.tenant_id = $2 AND reporter.tenant_id = $2
                    THEN reporter.first_name
                END
                    AS reporter_first_name,
                CASE
                    WHEN av.tenant_id = $2 AND reporter.tenant_id = $2
                    THEN reporter.last_name
                END
                    AS reporter_last_name,
                CASE WHEN av.tenant_id = $2 THEN c.id END AS camera_id,
                CASE WHEN av.tenant_id = $2 THEN c.serial_number END
                    AS camera_serial_number,
                CASE WHEN av.tenant_id = $2 THEN av.id END AS agency_vehicle_id,
                CASE WHEN av.tenant_id = $2 THEN av.identifier END
                    AS agency_vehicle_identifier
            FROM scans s
            JOIN cameras c ON c.id = s.camera_id
            JOIN agency_vehicles av ON av.id = c.agency_vehicle_id
            LEFT JOIN app_users reporter ON reporter.id = s.reported_by
            WHERE s.vehicle_id = $1
            ORDER BY s.scanned_at DESC, s.id DESC
            """,
            row["vehicle_id"],
            user.tenant.id,
        )

    summary = _summary_from_row(row)
    scans = []
    for scan in scan_rows:
        reporter = None
        if scan["reporter_first_name"] is not None:
            reporter = ReporterSummary(
                first_name=scan["reporter_first_name"],
                last_name=scan["reporter_last_name"],
            )
        camera = None
        agency_vehicle = None
        if scan["camera_id"] is not None:
            camera = CameraSummary(
                id=scan["camera_id"],
                serial_number=scan["camera_serial_number"],
            )
            agency_vehicle = AgencyVehicleSummary(
                id=scan["agency_vehicle_id"],
                identifier=scan["agency_vehicle_identifier"],
            )
        scans.append(
            CaseScan(
                id=scan["id"],
                scanned_at=scan["scanned_at"],
                latitude=scan["latitude"],
                longitude=scan["longitude"],
                image_url=scan["image_url"],
                reported_by=reporter,
                camera=camera,
                agency_vehicle=agency_vehicle,
            )
        )

    return CaseDetail(**summary.model_dump(), scans=scans)


@router.post("/{case_id}/claim", response_model=CaseSummary)
async def claim_case(
    case_id: int,
    request: Request,
    user: Annotated[UserProfile, Depends(current_user)],
) -> CaseSummary:
    _require_staff(user)
    pool: asyncpg.Pool = request.app.state.db_pool
    async with pool.acquire() as connection:
        async with connection.transaction():
            claimed_id = await connection.fetchval(
                """
                UPDATE recovery_cases rc
                SET
                    status = 'ACTIVE',
                    tenant_id = claimant.tenant_id,
                    assignee_id = claimant.id,
                    updated_at = NOW()
                FROM app_users claimant
                WHERE rc.id = $1
                  AND rc.status = 'PENDING_CLAIM'
                  AND claimant.id = $2
                  AND claimant.role = 'STAFF'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM recovery_cases existing
                      WHERE existing.vehicle_id = rc.vehicle_id
                        AND existing.tenant_id = claimant.tenant_id
                        AND existing.status = 'ACTIVE'
                  )
                RETURNING rc.id
                """,
                case_id,
                user.id,
            )
            if claimed_id is None:
                existing_status = await connection.fetchval(
                    "SELECT status FROM recovery_cases WHERE id = $1",
                    case_id,
                )
                if existing_status is None:
                    raise _error(
                        status.HTTP_404_NOT_FOUND,
                        "CASE_NOT_FOUND",
                        "The recovery case does not exist",
                    )
                raise _error(
                    status.HTTP_409_CONFLICT,
                    "CASE_NOT_CLAIMABLE",
                    "This case has already been claimed by another staff member or is no longer claimable.",
                )

            row = await _fetch_owned_case_summary(
                connection, claimed_id, user.tenant.id
            )
            if row is None:
                raise RuntimeError("Claimed case could not be reloaded")

    return _summary_from_row(row)
