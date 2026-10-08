import argparse
import asyncio
import os
import random
from datetime import UTC, datetime
from pathlib import Path

import asyncpg
from argon2 import PasswordHasher
from dotenv import load_dotenv
from faker import Faker

from app.db.connection import create_pool

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

Faker.seed(42)
random.seed(42)
fake = Faker()

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
ROLES = ("ADMIN", "STAFF", "AGENT", "AGENT")
DEMO_PASSWORD = os.getenv("DEMO_USER_PASSWORD", "ArchetypeDemo!2026")
MAKES_AND_MODELS = (
    ("Ford", "F-150"),
    ("Toyota", "Camry"),
    ("Honda", "Civic"),
    ("Chevrolet", "Silverado"),
    ("Nissan", "Altima"),
    ("Jeep", "Grand Cherokee"),
    ("Hyundai", "Tucson"),
    ("Kia", "Sportage"),
)
BASE_LOCATIONS = (
    (12.9716, 77.5946),  # Tenant 1: Bengaluru, Karnataka (matches KA vehicle license plates)
    (28.4595, 77.0266),  # Tenant 2: Gurgaon / Delhi NCR
    (19.0760, 72.8777),  # Tenant 3: Mumbai
)
START_DATE = datetime(2026, 1, 1, tzinfo=UTC)
END_DATE = datetime(2026, 10, 1, tzinfo=UTC)


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


async def reset_data(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        TRUNCATE TABLE
            scans,
            recovery_cases,
            cameras,
            agency_vehicles,
            app_users,
            target_vehicles,
            tenants
        RESTART IDENTITY CASCADE
        """
    )


async def seed_tenants(connection: asyncpg.Connection) -> list[int]:
    tenant_ids = []
    locations = ["Bengaluru", "Gurgaon", "Mumbai"]
    names = ["Apex Vehicle Recovery", "North District Recovery", "Metro Shield Operations"]
    for i in range(3):
        tenant_id = await connection.fetchval(
            "INSERT INTO tenants (name, location) VALUES ($1, $2) RETURNING id",
            names[i],
            locations[i],
        )
        tenant_ids.append(tenant_id)
    return tenant_ids


async def seed_users(
    connection: asyncpg.Connection,
    tenant_ids: list[int],
    password: str = DEMO_PASSWORD,
) -> tuple[list[int], dict[int, int], dict[int, list[int]]]:
    user_ids = []
    staff_ids_by_tenant: dict[int, int] = {}
    agent_ids_by_tenant: dict[int, list[int]] = {}
    password_hash = PasswordHasher().hash(password)

    for tenant_index, tenant_id in enumerate(tenant_ids, start=1):
        agent_ids_by_tenant[tenant_id] = []
        role_counts = {"ADMIN": 0, "STAFF": 0, "AGENT": 0}
        for role in ROLES:
            role_counts[role] += 1
            role_suffix = role.casefold()
            if role == "AGENT":
                role_suffix += str(role_counts[role])
            email = f"tenant{tenant_index}.{role_suffix}@archetype.local"
            user_id = await connection.fetchval(
                """
                INSERT INTO app_users (
                    tenant_id, first_name, last_name, email, password_hash, role
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
                """,
                tenant_id,
                fake.first_name(),
                fake.last_name(),
                email,
                password_hash,
                role,
            )
            user_ids.append(user_id)
            if role == "STAFF":
                staff_ids_by_tenant[tenant_id] = user_id
            if role == "AGENT":
                agent_ids_by_tenant[tenant_id].append(user_id)

    await connection.execute(
        "ALTER TABLE app_users ALTER COLUMN password_hash SET NOT NULL"
    )
    return user_ids, staff_ids_by_tenant, agent_ids_by_tenant


async def seed_agency_fleet(
    connection: asyncpg.Connection, tenant_ids: list[int]
) -> tuple[list[int], dict[int, list[int]]]:
    agency_vehicle_ids = []
    camera_ids_by_tenant: dict[int, list[int]] = {}

    for tenant_index, tenant_id in enumerate(tenant_ids):
        camera_ids_by_tenant[tenant_id] = []
        tenant_code = chr(ord("A") + tenant_index)
        for vehicle_index in range(1, 4):
            agency_vehicle_id = await connection.fetchval(
                """
                INSERT INTO agency_vehicles (tenant_id, identifier)
                VALUES ($1, $2)
                RETURNING id
                """,
                tenant_id,
                f"TRUCK_{tenant_code}_{vehicle_index:03d}",
            )
            agency_vehicle_ids.append(agency_vehicle_id)

            camera_count = 1 if vehicle_index % 2 else 2
            for camera_index in range(1, camera_count + 1):
                camera_id = await connection.fetchval(
                    """
                    INSERT INTO cameras (agency_vehicle_id, serial_number)
                    VALUES ($1, $2)
                    RETURNING id
                    """,
                    agency_vehicle_id,
                    f"CAM_{tenant_code}_{vehicle_index}{camera_index:03d}",
                )
                camera_ids_by_tenant[tenant_id].append(camera_id)

    return agency_vehicle_ids, camera_ids_by_tenant


async def seed_target_vehicles(connection: asyncpg.Connection) -> list[int]:
    vehicle_ids = []
    for index in range(1, 41):
        make, model = MAKES_AND_MODELS[(index - 1) % len(MAKES_AND_MODELS)]
        vehicle_id = await connection.fetchval(
            """
            INSERT INTO target_vehicles (vin, plate, make, model)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            f"1FTFW1E5{index:09d}",
            f"KA{((index - 1) % 30) + 1:02d}AB{index:04d}",
            make,
            model,
        )
        vehicle_ids.append(vehicle_id)
    return vehicle_ids


async def seed_cases(
    connection: asyncpg.Connection,
    tenant_ids: list[int],
    staff_ids_by_tenant: dict[int, int],
    vehicle_ids: list[int],
) -> None:
    for vehicle_id in vehicle_ids[:8]:
        await connection.execute(
            "INSERT INTO recovery_cases (vehicle_id, status) VALUES ($1, 'PENDING_CLAIM')",
            vehicle_id,
        )

    for index, vehicle_id in enumerate(vehicle_ids[8:20]):
        tenant_id = tenant_ids[index % len(tenant_ids)]
        assignee_id = staff_ids_by_tenant[tenant_id]
        await connection.execute(
            """
            INSERT INTO recovery_cases (vehicle_id, status, tenant_id, assignee_id)
            VALUES ($1, 'ACTIVE', $2, $3)
            """,
            vehicle_id,
            tenant_id,
            assignee_id,
        )

    for index, vehicle_id in enumerate(vehicle_ids[20:25]):
        tenant_id = tenant_ids[index % len(tenant_ids)]
        assignee_id = staff_ids_by_tenant[tenant_id]
        await connection.execute(
            """
            INSERT INTO recovery_cases (vehicle_id, status, tenant_id, assignee_id)
            VALUES ($1, 'CLOSED', $2, $3)
            """,
            vehicle_id,
            tenant_id,
            assignee_id,
        )


async def insert_scan(
    connection: asyncpg.Connection,
    reporting_tenant_index: int,
    tenant_ids: list[int],
    agent_ids_by_tenant: dict[int, list[int]],
    camera_ids_by_tenant: dict[int, list[int]],
    vehicle_id: int | None,
    scan_number: int,
    base_coords: tuple[float, float] | None = None,
    scanned_at: datetime | None = None,
) -> None:
    tenant_id = tenant_ids[reporting_tenant_index]
    if base_coords is None:
        base_latitude, base_longitude = BASE_LOCATIONS[reporting_tenant_index]
    else:
        base_latitude, base_longitude = base_coords

    if scanned_at is None:
        scanned_at = fake.date_time_between(START_DATE, END_DATE)

    await connection.execute(
        """
        INSERT INTO scans (
            camera_id, reported_by, vehicle_id, image_url,
            latitude, longitude, scanned_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        random.choice(camera_ids_by_tenant[tenant_id]),
        random.choice(agent_ids_by_tenant[tenant_id]),
        vehicle_id,
        f"https://example.invalid/scans/{scan_number:04d}.jpg",
        base_latitude + random.uniform(-0.015, 0.015),
        base_longitude + random.uniform(-0.015, 0.015),
        scanned_at,
    )


async def seed_scans(
    connection: asyncpg.Connection,
    tenant_ids: list[int],
    agent_ids_by_tenant: dict[int, list[int]],
    camera_ids_by_tenant: dict[int, list[int]],
    vehicle_ids: list[int],
    total_scans: int = 150,
) -> None:
    scan_number = 1

    def vehicle_coords(v_idx: int) -> tuple[float, float]:
        if v_idx < 8:
            # Claimable cases: located in Bengaluru so when claimed by Tenant 1 they are in-territory
            return BASE_LOCATIONS[0]
        elif 8 <= v_idx < 20:
            # Active cases: mapped to their respective tenant
            t_idx = (v_idx - 8) % len(tenant_ids)
            return BASE_LOCATIONS[t_idx]
        elif 20 <= v_idx < 25:
            # Closed cases
            t_idx = (v_idx - 20) % len(tenant_ids)
            return BASE_LOCATIONS[t_idx]
        else:
            return BASE_LOCATIONS[v_idx % len(tenant_ids)]

    # An active case for Tenant 1 (vehicle_ids[8]) with a rich, geographically clustered scan trail.
    v8_coords = vehicle_coords(8)
    for i in range(8):
        # Local cameras for most sightings, partner cameras for shared network demonstration
        reporting_tenant = 0 if i < 6 else ((i % 2) + 1)
        await insert_scan(
            connection,
            reporting_tenant,
            tenant_ids,
            agent_ids_by_tenant,
            camera_ids_by_tenant,
            vehicle_ids[8],
            scan_number,
            base_coords=v8_coords,
        )
        scan_number += 1

    # An active case with deliberately sparse history (vehicle_ids[9], Tenant 2).
    await insert_scan(
        connection,
        1,
        tenant_ids,
        agent_ids_by_tenant,
        camera_ids_by_tenant,
        vehicle_ids[9],
        scan_number,
        base_coords=vehicle_coords(9),
    )
    scan_number += 1

    # A target vehicle with sightings but no recovery case (vehicle_ids[25]).
    v25_coords = vehicle_coords(25)
    for _ in range(4):
        await insert_scan(
            connection,
            2,
            tenant_ids,
            agent_ids_by_tenant,
            camera_ids_by_tenant,
            vehicle_ids[25],
            scan_number,
            base_coords=v25_coords,
        )
        scan_number += 1

    remaining_vehicles = vehicle_ids[:8] + vehicle_ids[10:]
    while scan_number <= total_scans:
        target_v_idx = random.randrange(len(remaining_vehicles))
        chosen_vehicle_id = remaining_vehicles[target_v_idx]
        actual_idx = vehicle_ids.index(chosen_vehicle_id)
        coords = vehicle_coords(actual_idx)

        # Primary tenant for this vehicle
        if actual_idx < 8:
            primary_tenant = 0
        elif 8 <= actual_idx < 20:
            primary_tenant = (actual_idx - 8) % len(tenant_ids)
        elif 20 <= actual_idx < 25:
            primary_tenant = (actual_idx - 20) % len(tenant_ids)
        else:
            primary_tenant = actual_idx % len(tenant_ids)

        # 75% local camera, 25% partner camera for cross-tenant visibility
        if random.random() < 0.75:
            rep_tenant = primary_tenant
        else:
            rep_tenant = random.choice([t for t in range(len(tenant_ids)) if t != primary_tenant])

        await insert_scan(
            connection,
            rep_tenant,
            tenant_ids,
            agent_ids_by_tenant,
            camera_ids_by_tenant,
            chosen_vehicle_id,
            scan_number,
            base_coords=coords,
        )
        scan_number += 1


async def validate_seed(connection: asyncpg.Connection) -> None:
    checks = {
        "invalid case assignment state": """
            SELECT COUNT(*) FROM recovery_cases
            WHERE (status = 'PENDING_CLAIM' AND (tenant_id IS NOT NULL OR assignee_id IS NOT NULL))
               OR (status IN ('ACTIVE', 'CLOSED') AND (tenant_id IS NULL OR assignee_id IS NULL))
        """,
        "case assignee belongs to another tenant": """
            SELECT COUNT(*)
            FROM recovery_cases rc
            JOIN app_users au ON au.id = rc.assignee_id
            WHERE au.tenant_id <> rc.tenant_id
        """,
        "case assignee is not staff": """
            SELECT COUNT(*)
            FROM recovery_cases rc
            JOIN app_users au ON au.id = rc.assignee_id
            WHERE au.role <> 'STAFF'
        """,
        "scan reporter is not an agent": """
            SELECT COUNT(*)
            FROM scans s
            JOIN app_users au ON au.id = s.reported_by
            WHERE au.role <> 'AGENT'
        """,
        "scan reporter belongs to another tenant": """
            SELECT COUNT(*)
            FROM scans s
            JOIN app_users au ON au.id = s.reported_by
            JOIN cameras c ON c.id = s.camera_id
            JOIN agency_vehicles av ON av.id = c.agency_vehicle_id
            WHERE au.tenant_id <> av.tenant_id
        """,
        "missing closed case": "SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END FROM recovery_cases WHERE status = 'CLOSED'",
        "claimable case count outside 5-10": "SELECT CASE WHEN COUNT(*) BETWEEN 5 AND 10 THEN 0 ELSE 1 END FROM recovery_cases WHERE status = 'PENDING_CLAIM'",
        "missing active case with rich scan history": """
            SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
            FROM (
                SELECT rc.id
                FROM recovery_cases rc
                JOIN scans s ON s.vehicle_id = rc.vehicle_id
                WHERE rc.status = 'ACTIVE'
                GROUP BY rc.id
                HAVING COUNT(s.id) BETWEEN 5 AND 10
            ) rich_cases
        """,
        "missing active case with sparse scan history": """
            SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
            FROM (
                SELECT rc.id
                FROM recovery_cases rc
                LEFT JOIN scans s ON s.vehicle_id = rc.vehicle_id
                WHERE rc.status = 'ACTIVE'
                GROUP BY rc.id
                HAVING COUNT(s.id) <= 1
            ) sparse_cases
        """,
        "missing scan without a case": """
            SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
            FROM scans s
            WHERE s.vehicle_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM recovery_cases rc WHERE rc.vehicle_id = s.vehicle_id
              )
        """,
        "tenant without owned active/closed case": """
            SELECT COUNT(*)
            FROM tenants t
            WHERE NOT EXISTS (
                SELECT 1 FROM recovery_cases rc
                WHERE rc.tenant_id = t.id AND rc.status IN ('ACTIVE', 'CLOSED')
            )
        """,
    }

    failures = []
    for name, query in checks.items():
        if await connection.fetchval(query):
            failures.append(name)

    if failures:
        raise RuntimeError("Seed integrity checks failed: " + ", ".join(failures))


async def print_summary(
    connection: asyncpg.Connection, password: str = DEMO_PASSWORD
) -> None:
    counts = await connection.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM tenants) AS tenants,
            (SELECT COUNT(*) FROM app_users) AS users,
            (SELECT COUNT(*) FROM agency_vehicles) AS agency_vehicles,
            (SELECT COUNT(*) FROM cameras) AS cameras,
            (SELECT COUNT(*) FROM target_vehicles) AS target_vehicles,
            (SELECT COUNT(*) FROM scans) AS scans
        """
    )
    case_counts = {
        row["status"]: row["count"]
        for row in await connection.fetch(
            "SELECT status, COUNT(*) AS count FROM recovery_cases GROUP BY status"
        )
    }

    print("Seed completed\n")
    print(f"Tenants: {counts['tenants']}")
    print(f"Users: {counts['users']}")
    print(f"Agency vehicles: {counts['agency_vehicles']}")
    print(f"Cameras: {counts['cameras']}")
    print(f"Target vehicles: {counts['target_vehicles']}")
    print("Cases:")
    print(f"  Pending claim: {case_counts.get('PENDING_CLAIM', 0)}")
    print(f"  Active: {case_counts.get('ACTIVE', 0)}")
    print(f"  Closed: {case_counts.get('CLOSED', 0)}")
    print(f"Scans: {counts['scans']}")
    print("\nDemo sign-in")
    print(f"Password (all users): {password}")
    for row in await connection.fetch(
        "SELECT email, role FROM app_users ORDER BY tenant_id, id"
    ):
        print(f"  {row['email']} ({row['role']})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed Discovery File operational vehicle recovery database.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--fresh",
        dest="fresh",
        action="store_true",
        default=True,
        help="Drop all existing tables CASCADE and recreate schema from scratch to prevent any conflicts (default: True).",
    )
    parser.add_argument(
        "--no-fresh",
        dest="fresh",
        action="store_false",
        help="Do not drop tables; only truncate existing table data.",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=DEMO_PASSWORD,
        help="Password for all generated operational user accounts.",
    )
    parser.add_argument(
        "--scans",
        type=int,
        default=150,
        help="Total number of surveillance scans to seed.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress summary output.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    pool = await create_pool()
    try:
        async with pool.acquire() as connection:
            async with connection.transaction():
                if args.fresh:
                    print("Dropping existing tables and rebuilding schema from scratch...")
                    await drop_all_tables(connection)
                    await apply_schema(connection)
                else:
                    print("Resetting existing table data...")
                    await apply_schema(connection)
                    await reset_data(connection)

                tenant_ids = await seed_tenants(connection)
                _, staff_ids_by_tenant, agent_ids_by_tenant = await seed_users(
                    connection, tenant_ids, password=args.password
                )
                _, camera_ids_by_tenant = await seed_agency_fleet(
                    connection, tenant_ids
                )
                vehicle_ids = await seed_target_vehicles(connection)
                await seed_cases(
                    connection, tenant_ids, staff_ids_by_tenant, vehicle_ids
                )
                await seed_scans(
                    connection,
                    tenant_ids,
                    agent_ids_by_tenant,
                    camera_ids_by_tenant,
                    vehicle_ids,
                    total_scans=args.scans,
                )
                await validate_seed(connection)
            if not args.quiet:
                await print_summary(connection, password=args.password)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
