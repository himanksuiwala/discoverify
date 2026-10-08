import unittest
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import TenantProfile, UserProfile
from app.cases import (
    _normalize_search_filters,
    claim_case,
    get_case,
    list_claimable_cases,
)
from app.main import app


NOW = datetime(2026, 9, 1, 14, 32, tzinfo=UTC)


def user(role="STAFF", *, user_id=5, tenant_id=10):
    return UserProfile(
        id=user_id,
        firstName="Test",
        lastName=role.title(),
        email=f"{role.lower()}@example.test",
        role=role,
        tenant=TenantProfile(id=tenant_id, name="Test Tenant"),
    )


def summary_row(*, case_id=17, status="ACTIVE", tenant_id=10):
    return {
        "id": case_id,
        "status": status,
        "created_at": NOW,
        "updated_at": NOW,
        "vehicle_id": 20,
        "vin": "1FTFW1E51NFA12344",
        "plate": "AB12CD",
        "make": "Ford",
        "model": "F-150",
        "assignee_id": 5 if status != "PENDING_CLAIM" else None,
        "assignee_first_name": "Test" if status != "PENDING_CLAIM" else None,
        "assignee_last_name": "Staff" if status != "PENDING_CLAIM" else None,
        "latest_scanned_at": NOW,
        "latest_latitude": 33.749,
        "latest_longitude": -84.388,
        "tenant_id": tenant_id,
    }


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakeConnection:
    def __init__(
        self,
        *,
        claimed_id=17,
        existing_status="PENDING_CLAIM",
        case_row=None,
        scan_rows=None,
    ):
        self.claimed_id = claimed_id
        self.existing_status = existing_status
        self.case_row = case_row
        self.scan_rows = scan_rows or []
        self.calls = []

    def transaction(self):
        return FakeTransaction()

    async def fetchval(self, query, *args):
        self.calls.append(("fetchval", query, args))
        if "UPDATE recovery_cases" in query:
            return self.claimed_id
        if "SELECT status FROM recovery_cases" in query:
            return self.existing_status
        if "SELECT COUNT(*)" in query:
            return 0
        raise AssertionError(f"Unexpected fetchval query: {query}")

    async def fetchrow(self, query, *args):
        self.calls.append(("fetchrow", query, args))
        if "FROM recovery_cases rc" in query:
            return self.case_row
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def fetch(self, query, *args):
        self.calls.append(("fetch", query, args))
        if "FROM scans s" in query:
            return self.scan_rows
        if "FROM recovery_cases rc" in query:
            return []
        raise AssertionError(f"Unexpected fetch query: {query}")


class FakeAcquire:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakePool:
    def __init__(self, connection):
        self.connection = connection

    def acquire(self):
        return FakeAcquire(self.connection)


def request_for(connection):
    pool = FakePool(connection)
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db_pool=pool)))


class CaseContractTests(unittest.TestCase):
    def test_search_identifiers_are_normalized(self):
        self.assertEqual(
            _normalize_search_filters(" 1ftfw1e51nfa12344 ", " ab-12 cd "),
            ("1FTFW1E51NFA12344", "AB12CD"),
        )

    def test_claimable_route_is_registered_before_dynamic_detail_route(self):
        paths = [route.path for route in app.routes]
        self.assertLess(
            paths.index("/api/v1/cases/claimable"),
            paths.index("/api/v1/cases/{case_id}"),
        )


class CaseWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_claimable_list_hides_vehicles_already_active_for_tenant(self):
        connection = FakeConnection()

        result = await list_claimable_cases(
            request_for(connection),
            user(tenant_id=42),
            None,
            None,
            25,
            0,
        )

        self.assertEqual(result.total, 0)
        count_call, rows_call = connection.calls
        self.assertIn("NOT EXISTS", count_call[1])
        self.assertIn("existing.tenant_id = $1", count_call[1])
        self.assertEqual(count_call[2], (42, None, None))
        self.assertEqual(rows_call[2], (42, None, None, 25, 0))

    async def test_staff_claim_returns_updated_case(self):
        connection = FakeConnection(case_row=summary_row())

        result = await claim_case(17, request_for(connection), user())

        self.assertEqual(result.id, 17)
        self.assertEqual(result.status, "ACTIVE")
        self.assertEqual(result.assignee.id, 5)

    async def test_non_staff_cannot_view_claimable_cases(self):
        for role in ("AGENT", "ADMIN"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await list_claimable_cases(
                    request_for(FakeConnection()),
                    user(role),
                    None,
                    None,
                    25,
                    0,
                )
            self.assertEqual(raised.exception.status_code, 403)
            self.assertEqual(raised.exception.detail["code"], "STAFF_ROLE_REQUIRED")

    async def test_non_staff_cannot_claim(self):
        for role in ("AGENT", "ADMIN"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as raised:
                await claim_case(17, request_for(FakeConnection()), user(role))
            self.assertEqual(raised.exception.status_code, 403)
            self.assertEqual(raised.exception.detail["code"], "STAFF_ROLE_REQUIRED")

    async def test_stale_claim_returns_conflict(self):
        connection = FakeConnection(claimed_id=None, existing_status="ACTIVE")

        with self.assertRaises(HTTPException) as raised:
            await claim_case(17, request_for(connection), user())

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "CASE_NOT_CLAIMABLE")

    async def test_case_detail_includes_local_reporter_and_redacts_foreign_source(self):
        local_scan = {
            "id": 30,
            "scanned_at": NOW,
            "latitude": 33.749,
            "longitude": -84.388,
            "image_url": "https://example.com/local.jpg",
            "reporter_first_name": "Local",
            "reporter_last_name": "Agent",
            "camera_id": 3,
            "camera_serial_number": "CAM_A_1001",
            "agency_vehicle_id": 2,
            "agency_vehicle_identifier": "TRUCK_A_001",
        }
        foreign_scan = {
            "id": 31,
            "scanned_at": NOW,
            "latitude": 33.75,
            "longitude": -84.389,
            "image_url": "https://example.com/foreign.jpg",
            "reporter_first_name": None,
            "reporter_last_name": None,
            "camera_id": None,
            "camera_serial_number": None,
            "agency_vehicle_id": None,
            "agency_vehicle_identifier": None,
        }
        connection = FakeConnection(
            case_row=summary_row(), scan_rows=[local_scan, foreign_scan]
        )

        result = await get_case(17, request_for(connection), user())

        self.assertEqual(result.scans[0].reported_by.first_name, "Local")
        self.assertEqual(result.scans[0].camera.serial_number, "CAM_A_1001")
        self.assertIsNone(result.scans[1].reported_by)
        self.assertIsNone(result.scans[1].camera)
        self.assertIsNone(result.scans[1].agency_vehicle)


if __name__ == "__main__":
    unittest.main()
