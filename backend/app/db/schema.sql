CREATE TABLE IF NOT EXISTS tenants (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agency_vehicles (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id),
    identifier TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cameras (
    id BIGSERIAL PRIMARY KEY,
    agency_vehicle_id BIGINT NOT NULL REFERENCES agency_vehicles(id),
    serial_number TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF', 'AGENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS target_vehicles (
    id BIGSERIAL PRIMARY KEY,
    vin TEXT NOT NULL UNIQUE,
    plate TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_cases (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT NOT NULL REFERENCES target_vehicles(id),
    status TEXT NOT NULL CHECK (status IN ('PENDING_CLAIM', 'ACTIVE', 'CLOSED')),
    tenant_id BIGINT REFERENCES tenants(id),
    assignee_id BIGINT REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT recovery_case_assignment_matches_status CHECK (
        (status = 'PENDING_CLAIM' AND tenant_id IS NULL AND assignee_id IS NULL)
        OR
        (status IN ('ACTIVE', 'CLOSED') AND tenant_id IS NOT NULL AND assignee_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS scans (
    id BIGSERIAL PRIMARY KEY,
    camera_id BIGINT NOT NULL REFERENCES cameras(id),
    reported_by BIGINT NOT NULL REFERENCES app_users(id),
    vehicle_id BIGINT REFERENCES target_vehicles(id),
    image_url TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    scanned_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recovery_cases_status_idx ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS recovery_cases_tenant_id_idx ON recovery_cases(tenant_id);
CREATE INDEX IF NOT EXISTS recovery_cases_vehicle_id_idx ON recovery_cases(vehicle_id);

CREATE INDEX IF NOT EXISTS scans_vehicle_id_idx ON scans(vehicle_id);
CREATE INDEX IF NOT EXISTS scans_camera_id_idx ON scans(camera_id);
CREATE INDEX IF NOT EXISTS scans_scanned_at_idx ON scans(scanned_at);
CREATE INDEX IF NOT EXISTS scans_vehicle_id_scanned_at_idx ON scans(vehicle_id, scanned_at);

CREATE INDEX IF NOT EXISTS app_users_tenant_id_idx ON app_users(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_idx ON app_users(LOWER(email));
CREATE INDEX IF NOT EXISTS agency_vehicles_tenant_id_idx ON agency_vehicles(tenant_id);
