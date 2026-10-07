# Handoff — PostgreSQL Schema + Faker Seed Data

## Goal

Set up the local PostgreSQL database for the LPR vehicle-recovery FastAPI project using **PostgreSQL + asyncpg + raw SQL + Faker**.

Do **not** introduce SQLAlchemy or Alembic. No migration framework is required at this stage.

## Local PostgreSQL

Use PostgreSQL in Docker.

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: lpr_user
      POSTGRES_PASSWORD: lpr_password
      POSTGRES_DB: lpr_db
    ports:
      - "5432:5432"
    volumes:
      - lpr_postgres_data:/var/lib/postgresql/data

volumes:
  lpr_postgres_data:
```

```env
DATABASE_URL=postgresql://lpr_user:lpr_password@localhost:5432/lpr_db
```

Create a small `asyncpg` connection-pool module and explicit local DB setup tooling.

---

## Schema

### Tenant

```text
id PK
name
location
created_at
updated_at
```

### AgencyVehicle

```text
id PK
tenant_id FK -> Tenant.id
identifier UNIQUE
created_at
updated_at
```

Represents the recovery agency's own truck/vehicle.

### Camera

```text
id PK
agency_vehicle_id FK -> AgencyVehicle.id
serial_number UNIQUE
created_at
updated_at
```

Tenant ownership is derived through:

```text
Camera -> AgencyVehicle -> Tenant
```

### AppUser

```text
id PK
tenant_id FK -> Tenant.id
first_name
last_name
email UNIQUE
role [ADMIN, STAFF, AGENT]
created_at
updated_at
```

### TargetVehicle

```text
id PK
vin UNIQUE
plate
make
model
created_at
updated_at
```

Notes:
- Represents non-agency vehicles.
- Keep separate from `AgencyVehicle`.
- `vin` is the strongest identity.
- `make` + `model` are useful business/UI context.

### RecoveryCase

```text
id PK
vehicle_id FK -> TargetVehicle.id
status [PENDING_CLAIM, ACTIVE, CLOSED]
tenant_id FK -> Tenant.id NULL
assignee_id FK -> AppUser.id NULL
created_at
updated_at
```

Rules:

```text
PENDING_CLAIM
tenant_id = NULL
assignee_id = NULL
```

```text
ACTIVE / CLOSED
tenant_id != NULL
assignee_id != NULL
```

### Scan

```text
id PK
camera_id FK -> Camera.id
reported_by FK -> AppUser.id
vehicle_id FK -> TargetVehicle.id NULL
image_url
latitude
longitude
scanned_at
created_at
```

Rules:
- `reported_by` should reference an `AGENT`.
- Do not add `case_id`.
- Scan history relates to cases through `TargetVehicle`.

---

## Relationships

```text
Tenant
 ├── AppUsers
 ├── AgencyVehicles
 │     └── Cameras
 │           └── Scans
 └── RecoveryCases

TargetVehicle
 ├── RecoveryCases
 └── Scans
```

---

## Constraints / Indexes

### Unique

```text
AppUser.email
AgencyVehicle.identifier
Camera.serial_number
TargetVehicle.vin
```

### Indexes

```text
RecoveryCase(status)
RecoveryCase(tenant_id)
RecoveryCase(vehicle_id)

Scan(vehicle_id)
Scan(camera_id)
Scan(scanned_at)
Scan(vehicle_id, scanned_at)

AppUser(tenant_id)
AgencyVehicle(tenant_id)
```

---

## Suggested DB Structure

```text
app/
  db/
    connection.py
    schema.sql
    seed.py
```

- `connection.py` — create/manage the `asyncpg` pool.
- `schema.sql` — raw `CREATE TABLE IF NOT EXISTS` statements, constraints, indexes.
- `seed.py` — deterministic development seed data.

---

## Seed Data

Use Faker with deterministic seeds:

```python
from faker import Faker
import random

Faker.seed(42)
random.seed(42)
```

Suggested volume:

```text
3 tenants

Per tenant:
- 3–5 users
- 2–4 agency vehicles
- 1–2 cameras per agency vehicle

30–50 target vehicles
20–30 recovery cases
100–200 scans
```

Exact counts are flexible.

### Required scenarios

1. **Active case with rich scan history**
   - tenant + agent assignee
   - target vehicle
   - 5–10 scans
   - varied timestamps
   - nearby coordinates

2. **Closed case**
   - at least one `CLOSED` case

3. **Claimable cases**
   - 5–10 records with:
   ```text
   status = PENDING_CLAIM
   tenant_id = NULL
   assignee_id = NULL
   ```

4. **Scan without a case**
   - target vehicles with scans but no recovery case

5. **Case with little/no scan history**
   - at least one active case with 0–1 scans

6. **Cross-tenant isolation**
   - every tenant owns distinct active/closed cases

---

## Fake Data Guidance

Use Faker for:
- names
- emails
- tenant names
- locations
- timestamps

Prefer readable deterministic domain identifiers:

```text
TRUCK_A_001
CAM_A_1001
7XYZ123
1FTFW1E51NFA12345
```

Populate realistic target-vehicle values:

```text
make: Ford
model: F-150
```

For scan locations, generate clusters around a base point instead of random worldwide coordinates:

```text
latitude  = base_lat ± 0.01
longitude = base_lng ± 0.01
```

This keeps future map/heatmap data meaningful.

---

## Seed Integrity Checks

Validate after seeding:

- every `ACTIVE` / `CLOSED` case has tenant + assignee
- every `PENDING_CLAIM` has neither
- case assignee belongs to the case tenant
- scan reporter is an `AGENT`
- scan reporter belongs to the same tenant as the camera's agency vehicle
- all referenced users/cameras/vehicles exist

Fail loudly if an invariant is violated.

Print a concise summary such as:

```text
Seed completed

Tenants: 3
Users: 12
Agency vehicles: 8
Cameras: 10
Target vehicles: 40
Cases:
  Pending claim: 8
  Active: 12
  Closed: 5
Scans: 150
```

---

## Out of Scope

Do not add:

- SQLAlchemy
- Alembic/migrations
- lender tables
- partner-network persistence
- notification tables
- image/blob storage
- claimant history
- reassignment workflow
- generic shared Vehicle table
- real auth-provider integration

---

## Definition of Done

- PostgreSQL runs locally.
- FastAPI connects through `asyncpg`.
- `schema.sql` creates the required tables and indexes.
- `seed.py` populates deterministic Faker data.
- all required business scenarios exist.
- seed integrity checks pass.
- DB is ready for:
  - tenant case list
  - case detail + scan trail
  - claimable-case list
  - claim action
  - scan ingestion
