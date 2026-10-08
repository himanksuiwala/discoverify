import unittest
from types import SimpleNamespace

from pydantic import ValidationError

from app.scans import (
    EligibilityRequest,
    ScanIngestionRequest,
    ingest_scan,
    normalize_plate,
    normalize_vin,
    still_eligible_for_repo,
)


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakeConnection:
    def __init__(self, *, active_case=None, pending_case=None, inserted_case_id=None):
        self.active_case = active_case
        self.pending_case = pending_case
        self.inserted_case_id = inserted_case_id
        self.scan_inserted = False
        self.scan_reported_by = object()

    def transaction(self):
        return FakeTransaction()

    async def fetchrow(self, query, *args):
        if "FROM cameras" in query:
            return {"id": args[0], "tenant_id": 10}
        if "FROM recovery_cases" in query:
            if "status = 'ACTIVE'" in query:
                return self.active_case
            if "status = 'PENDING_CLAIM'" in query:
                return self.pending_case
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def fetch(self, query, *args):
        if "FROM target_vehicles" in query:
            return [{"id": 20, "vin": args[0], "plate": args[1]}]
        raise AssertionError(f"Unexpected fetch query: {query}")

    async def fetchval(self, query, *args):
        if "INSERT INTO scans" in query:
            self.scan_inserted = True
            self.scan_reported_by = args[1]
            return 30
        if "INSERT INTO recovery_cases" in query:
            return self.inserted_case_id
        raise AssertionError(f"Unexpected fetchval query: {query}")


class FakeAcquire:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakePool:
    def __init__(self, *connections):
        self.connections = list(connections)

    def acquire(self):
        if not self.connections:
            raise AssertionError("No fake database connection remains")
        return FakeAcquire(self.connections.pop(0))


def request_for(pool):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db_pool=pool)))


def scan_payload(*, vin="1FTFW1E51NFA12344"):
    return ScanIngestionRequest(
        camera_id=1,
        plate="ab-12 cd",
        vin=vin,
        latitude=33.749,
        longitude=-84.388,
        scanned_at="2026-09-01T14:32:00Z",
        image_url="https://example.com/scans/image.jpg",
    )


class NormalizationAndEligibilityTests(unittest.TestCase):
    def test_identifiers_are_canonicalized(self):
        self.assertEqual(normalize_vin(" 1ftfw1e51nfa12345 "), "1FTFW1E51NFA12345")
        self.assertEqual(normalize_plate(" ab-12 cd "), "AB12CD")
        self.assertEqual(
            EligibilityRequest(vin="1ftfw1e51nfa12345").vin,
            "1FTFW1E51NFA12345",
        )

    def test_only_even_digit_suffix_is_eligible(self):
        self.assertTrue(still_eligible_for_repo("1FTFW1E51NFA12344"))
        self.assertFalse(still_eligible_for_repo("1FTFW1E51NFA12345"))
        self.assertFalse(still_eligible_for_repo("1FTFW1E51NFA1234A"))

    def test_camera_id_rejects_string_coercion(self):
        with self.assertRaises(ValidationError):
            ScanIngestionRequest(
                camera_id="1",
                plate="AB12CD",
                vin="1FTFW1E51NFA12345",
                latitude=33.749,
                longitude=-84.388,
                scanned_at="2026-09-01T14:32:00Z",
                image_url="https://example.com/scans/image.jpg",
            )


class ScanWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_same_tenant_active_case_does_not_create_case(self):
        connection = FakeConnection(
            active_case={"id": 40, "status": "ACTIVE", "tenant_id": 10}
        )

        response = await ingest_scan(scan_payload(), request_for(FakePool(connection)))

        self.assertTrue(connection.scan_inserted)
        self.assertIsNone(connection.scan_reported_by)
        self.assertEqual(response.outcome, "EXISTING_CASE")
        self.assertEqual(response.case_id, 40)
        self.assertIsNone(response.eligible)

    async def test_ineligible_vehicle_preserves_scan_without_case(self):
        connection = FakeConnection()

        response = await ingest_scan(
            scan_payload(vin="1FTFW1E51NFA12345"),
            request_for(FakePool(connection)),
        )

        self.assertTrue(connection.scan_inserted)
        self.assertEqual(response.outcome, "NOT_ELIGIBLE")
        self.assertIsNone(response.case_id)
        self.assertFalse(response.eligible)

    async def test_eligible_vehicle_creates_pending_case(self):
        scan_connection = FakeConnection()
        case_connection = FakeConnection(inserted_case_id=42)

        response = await ingest_scan(
            scan_payload(),
            request_for(FakePool(scan_connection, case_connection)),
        )

        self.assertTrue(scan_connection.scan_inserted)
        self.assertEqual(response.outcome, "CASE_CREATED")
        self.assertEqual(response.case_id, 42)
        self.assertTrue(response.eligible)

    async def test_concurrent_case_winner_is_returned_without_duplicate(self):
        scan_connection = FakeConnection()
        case_connection = FakeConnection(
            pending_case={"id": 43, "status": "PENDING_CLAIM", "tenant_id": None}
        )

        response = await ingest_scan(
            scan_payload(),
            request_for(FakePool(scan_connection, case_connection)),
        )

        self.assertEqual(response.outcome, "OPEN_CASE_EXISTS")
        self.assertEqual(response.case_id, 43)
        self.assertTrue(response.eligible)


if __name__ == "__main__":
    unittest.main()
