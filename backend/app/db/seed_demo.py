"""Focused 2-tenant demonstration seed script for Discovery File Operations.

Matches the exact demo scenario specification:
- Tenant A ("Apex Vehicle Recovery"):
    Camera: cam_1001 (camera_id = 1)
    Target Vehicle: VIN 1FTFW1E51NFA12345 (Plate KA01AB1234, Ford F-150)
    Scenario: Existing active recovery case with 3 older sightings across Bengaluru.
    Exercises: Existing-case ingestion flow.
- Tenant B ("North District Recovery"):
    Camera: cam_2050 (camera_id = 2)
    Target Vehicle: VIN 5NPE34AF9KH123456 (Plate HR26CD5678, Hyundai Sonata)
    Scenario: Registered vehicle with NO case at all.
    Exercises: New-case creation and end-to-end claiming flow.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import asyncpg
from argon2 import PasswordHasher
from dotenv import load_dotenv

from app.db.connection import create_pool

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
DEMO_PASSWORD = os.getenv("DEMO_USER_PASSWORD", "ArchetypeDemo!2026")

# Base geographic coordinates for tenant territories
BENGALURU_COORDS = (12.9716, 77.5946)
GURGAON_COORDS = (28.4595, 77.0266)


async def apply_schema(connection: asyncpg.Connection) -> None:
    await connection.execute(SCHEMA_PATH.read_text(encoding="utf-8"))


async def drop_all_tables(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        DROP TABLE IF EXISTS
            scans,
            recovery_cases,
            cameras,
            agency_vehicles,
            app_users,
            target_vehicles,
            tenants
        CASCADE;
        """
    )


async def seed_demo_tenants(connection: asyncpg.Connection) -> tuple[int, int]:
    tenant_a_id = await connection.fetchval(
        "INSERT INTO tenants (name, location) VALUES ($1, $2) RETURNING id",
        "Apex Vehicle Recovery",
        "Bengaluru",
    )
    tenant_b_id = await connection.fetchval(
        "INSERT INTO tenants (name, location) VALUES ($1, $2) RETURNING id",
        "North District Recovery",
        "Gurgaon",
    )
    return tenant_a_id, tenant_b_id


async def seed_demo_users(
    connection: asyncpg.Connection,
    tenant_a_id: int,
    tenant_b_id: int,
    password: str = DEMO_PASSWORD,
) -> dict[str, int]:
    password_hash = PasswordHasher().hash(password)
    users: dict[str, int] = {}

    # Tenant A (Apex Recovery)
    users["tenant1_admin"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'Arthur', 'Pendleton', 'tenant1.admin@archetype.local', $2, 'ADMIN')
        RETURNING id
        """,
        tenant_a_id,
        password_hash,
    )
    users["tenant1_staff"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'Sarah', 'Connor', 'tenant1.staff@archetype.local', $2, 'STAFF')
        RETURNING id
        """,
        tenant_a_id,
        password_hash,
    )
    users["tenant1_agent1"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'John', 'Rambo', 'tenant1.agent1@archetype.local', $2, 'AGENT')
        RETURNING id
        """,
        tenant_a_id,
        password_hash,
    )

    # Tenant B (North District Recovery)
    users["tenant2_admin"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'Bruce', 'Wayne', 'tenant2.admin@archetype.local', $2, 'ADMIN')
        RETURNING id
        """,
        tenant_b_id,
        password_hash,
    )
    users["tenant2_staff"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'Diana', 'Prince', 'tenant2.staff@archetype.local', $2, 'STAFF')
        RETURNING id
        """,
        tenant_b_id,
        password_hash,
    )
    users["tenant2_agent1"] = await connection.fetchval(
        """
        INSERT INTO app_users (tenant_id, first_name, last_name, email, password_hash, role)
        VALUES ($1, 'Clark', 'Kent', 'tenant2.agent1@archetype.local', $2, 'AGENT')
        RETURNING id
        """,
        tenant_b_id,
        password_hash,
    )

    return users


async def seed_demo_fleet(
    connection: asyncpg.Connection, tenant_a_id: int, tenant_b_id: int
) -> tuple[int, int]:
    # Tenant A vehicle & camera: cam_1001
    truck_a_id = await connection.fetchval(
        "INSERT INTO agency_vehicles (tenant_id, identifier) VALUES ($1, 'TRUCK_A_001') RETURNING id",
        tenant_a_id,
    )
    cam_1001_id = await connection.fetchval(
        "INSERT INTO cameras (agency_vehicle_id, serial_number) VALUES ($1, 'cam_1001') RETURNING id",
        truck_a_id,
    )

    # Tenant B vehicle & camera: cam_2050
    truck_b_id = await connection.fetchval(
        "INSERT INTO agency_vehicles (tenant_id, identifier) VALUES ($1, 'TRUCK_B_001') RETURNING id",
        tenant_b_id,
    )
    cam_2050_id = await connection.fetchval(
        "INSERT INTO cameras (agency_vehicle_id, serial_number) VALUES ($1, 'cam_2050') RETURNING id",
        truck_b_id,
    )

    return cam_1001_id, cam_2050_id


async def seed_demo_vehicles(connection: asyncpg.Connection) -> tuple[int, int]:
    # Scenario 1 vehicle: VIN 1FTFW1E51NFA12345
    veh_1_id = await connection.fetchval(
        """
        INSERT INTO target_vehicles (vin, plate, make, model)
        VALUES ('1FTFW1E51NFA12345', 'KA01AB1234', 'Ford', 'F-150')
        RETURNING id
        """
    )
    # Scenario 2 vehicle: VIN 5NPE34AF9KH123456 (even last digit 6 = eligible for repo!)
    veh_2_id = await connection.fetchval(
        """
        INSERT INTO target_vehicles (vin, plate, make, model)
        VALUES ('5NPE34AF9KH123456', 'HR26CD5678', 'Hyundai', 'Sonata')
        RETURNING id
        """
    )
    return veh_1_id, veh_2_id


async def seed_demo_cases(
    connection: asyncpg.Connection,
    tenant_a_id: int,
    staff_a_id: int,
    veh_1_id: int,
) -> int:
    # Existing ACTIVE case for Tenant A on Vehicle 1 (VIN 1FTFW1E51NFA12345)
    case_1_id = await connection.fetchval(
        """
        INSERT INTO recovery_cases (vehicle_id, status, tenant_id, assignee_id)
        VALUES ($1, 'ACTIVE', $2, $3)
        RETURNING id
        """,
        veh_1_id,
        tenant_a_id,
        staff_a_id,
    )
    # Vehicle 2 has NO case at all
    return case_1_id


async def seed_demo_scans(
    connection: asyncpg.Connection,
    cam_1001_id: int,
    agent_a_id: int,
    veh_1_id: int,
) -> list[int]:
    now = datetime.now(UTC)
    # 3 historical sightings of VIN 1FTFW1E51NFA12345 around Bengaluru
    sighting_configs = [
        (
            12.9352,
            77.6245,
            now - timedelta(days=2, hours=4),
            "https://example.invalid/scans/demo_scan_01.jpg",
        ),  # Koramangala
        (
            12.9784,
            77.6408,
            now - timedelta(days=1, hours=2),
            "https://example.invalid/scans/demo_scan_02.jpg",
        ),  # Indiranagar
        (
            12.9716,
            77.5946,
            now - timedelta(hours=3),
            "https://example.invalid/scans/demo_scan_03.jpg",
        ),  # MG Road (Latest)
    ]

    scan_ids = []
    for lat, lon, ts, img in sighting_configs:
        scan_id = await connection.fetchval(
            """
            INSERT INTO scans (camera_id, reported_by, vehicle_id, image_url, latitude, longitude, scanned_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            """,
            cam_1001_id,
            agent_a_id,
            veh_1_id,
            img,
            lat,
            lon,
            ts,
        )
        scan_ids.append(scan_id)

    return scan_ids


async def print_demo_summary(
    cam_1001_id: int,
    cam_2050_id: int,
    case_1_id: int,
    password: str = DEMO_PASSWORD,
) -> None:
    print("\n" + "=" * 65)
    print(" DISCOVERY FILE — FOCUSED 2-TENANT DEMO FIXTURE SEEDED")
    print("=" * 65)
    print("Database completely dropped and rebuilt from scratch.\n")

    print("TENANT SETUP:")
    print("  • Tenant A: Apex Vehicle Recovery (Bengaluru)")
    print(f"    - Camera: cam_1001 (camera_id = {cam_1001_id})")
    print(f"    - Staff user: tenant1.staff@archetype.local / {password}")
    print(f"    - Admin user: tenant1.admin@archetype.local / {password}")
    print("  • Tenant B: North District Recovery (Gurgaon)")
    print(f"    - Camera: cam_2050 (camera_id = {cam_2050_id})")
    print(f"    - Staff user: tenant2.staff@archetype.local / {password}")
    print(f"    - Admin user: tenant2.admin@archetype.local / {password}")

    print("\n" + "-" * 65)
    print("SCENARIO 1: EXISTING-CASE FLOW (Tenant A / cam_1001)")
    print("-" * 65)
    print(f"  • Vehicle: VIN 1FTFW1E51NFA12345 (Plate KA01AB1234, Ford F-150)")
    print(f"  • Existing Active Case: #{case_1_id} (assigned to tenant1.staff)")
    print(f"  • Historical sightings: 3 scans in Bengaluru (MG Road, Indiranagar, Koramangala)")
    print("  • Try Ingesting a New Sighting via curl:")
    print(f"""    curl -s -X POST http://localhost:8000/api/v1/scans \\
      -H "Content-Type: application/json" \\
      -d '{{
        "camera_id": {cam_1001_id},
        "vin": "1FTFW1E51NFA12345",
        "plate": "KA01AB1234",
        "latitude": 12.9815,
        "longitude": 77.6050,
        "scanned_at": "{datetime.now(UTC).isoformat()}",
        "image_url": "https://example.com/live_sighting.jpg"
      }}' | jq .
    => Outcome will be: EXISTING_CASE (attached to Case #{case_1_id})""")

    print("\n" + "-" * 65)
    print("SCENARIO 2: NEW-CASE FLOW (Tenant B / cam_2050)")
    print("-" * 65)
    print(f"  • Vehicle: VIN 5NPE34AF9KH123456 (Plate HR26CD5678, Hyundai Sonata)")
    print(f"  • Existing Case: NONE (0 cases, 0 scans)")
    print("  • Try Ingesting a Brand-New Sighting via curl:")
    print(f"""    curl -s -X POST http://localhost:8000/api/v1/scans \\
      -H "Content-Type: application/json" \\
      -d '{{
        "camera_id": {cam_2050_id},
        "vin": "5NPE34AF9KH123456",
        "plate": "HR26CD5678",
        "latitude": 28.4595,
        "longitude": 77.0266,
        "scanned_at": "{datetime.now(UTC).isoformat()}",
        "image_url": "https://example.com/new_sighting.jpg"
      }}' | jq .
    => Outcome will be: CASE_CREATED (creates PENDING_CLAIM case eligible for claim)""")
    print("=" * 65 + "\n")


async def main() -> None:
    pool = await create_pool()
    try:
        async with pool.acquire() as connection:
            async with connection.transaction():
                print("Dropping existing database tables (CASCADE)...")
                await drop_all_tables(connection)
                print("Rebuilding schema from scratch...")
                await apply_schema(connection)

                print("Seeding 2 tenants (Apex Recovery & North District Recovery)...")
                tenant_a_id, tenant_b_id = await seed_demo_tenants(connection)

                print("Seeding operational user accounts (Staff, Admin, Agent)...")
                users = await seed_demo_users(
                    connection, tenant_a_id, tenant_b_id, password=DEMO_PASSWORD
                )

                print("Seeding agency vehicles & cameras (cam_1001 & cam_2050)...")
                cam_1001_id, cam_2050_id = await seed_demo_fleet(
                    connection, tenant_a_id, tenant_b_id
                )

                print("Seeding target vehicles (1FTFW1E51NFA12345 & 5NPE34AF9KH123456)...")
                veh_1_id, veh_2_id = await seed_demo_vehicles(connection)

                print("Seeding existing active case for Tenant A (Case 1)...")
                case_1_id = await seed_demo_cases(
                    connection, tenant_a_id, users["tenant1_staff"], veh_1_id
                )

                print("Seeding 3 older scans for Vehicle 1 (Bengaluru)...")
                await seed_demo_scans(
                    connection, cam_1001_id, users["tenant1_agent1"], veh_1_id
                )

            await print_demo_summary(cam_1001_id, cam_2050_id, case_1_id)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
