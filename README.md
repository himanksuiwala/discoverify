# Discoverify

Discoverify is a multi-tenant vehicle-recovery prototype. Simulated LPR cameras
submit sightings, eligible vehicles enter a shared claimable pool, and recovery
staff can claim and inspect cases without exposing another tenant's camera or
operator identity.

The implementation uses a React/Vite frontend, a FastAPI API, PostgreSQL with
raw SQL, and JWT authentication through an HttpOnly cookie.

## Run locally

### Prerequisites

- Docker with Compose
- Python 3.12 and [`uv`](https://docs.astral.sh/uv/)
- Node.js 20+ and npm

### Setup

Run these commands from the repository root unless a step says otherwise.

1. Create the local environment file and start PostgreSQL:

   ```sh
   cp .env.example .env
   docker compose up -d
   ```

2. Create the backend environment and install its dependencies:

   ```sh
   cd backend
   uv venv --python 3.12
   uv pip install -r requirements.txt
   cd ..
   ```

3. Seed the database. This is destructive: the default command drops and
   recreates the application tables.

   ```sh
   ./seed.sh
   ```

   For the smaller, repeatable presentation scenario, use:

   ```sh
   ./seed_demo.sh
   ```

4. Start the API:

   ```sh
   cd backend
   .venv/bin/uvicorn app.main:app --reload
   ```

5. In another terminal, start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

Open <http://localhost:5173>. Vite forwards `/api` requests to the FastAPI
server at <http://localhost:8000>. The API health check is available at
<http://localhost:8000/api/health>.

The standard seed prints all generated accounts. For a quick login, use:

```text
tenant1.staff@archetype.local
ArchetypeDemo!2026
```

Useful seed options:

```sh
./seed.sh --scans 200  # choose the generated scan count
./seed.sh --no-fresh   # truncate data without rebuilding the schema
./seed.sh --demo       # same focused fixture as ./seed_demo.sh
```

## Implemented scope

- Tenant-scoped login for `ADMIN`, `STAFF`, and `AGENT` users. The 30-minute
  JWT is stored in an HttpOnly, SameSite cookie.
- Camera scan ingestion with VIN/plate normalization and registry matching.
- Automatic creation of an unassigned `PENDING_CLAIM` case for an eligible
  vehicle that does not already have one.
- Tenant-owned active and closed case lists, exact VIN/plate filtering,
  pagination, case details, scan history, and map visualization.
- A shared claimable pool with an atomic staff-only claim operation.
- Redaction of camera, agency-vehicle, and reporter identity when a sighting
  originated from another tenant.
- Database constraints that prevent duplicate global pending cases and more
  than one active case for the same tenant and vehicle.

## Assumptions

- A trusted upstream camera/partner system has already performed plate and VIN
  recognition. Scan ingestion therefore accepts structured metadata and an
  image URL; this service does not perform computer vision.
- Cameras and target vehicles are pre-registered. An unknown camera or a
  VIN/plate pair absent from the local registry is rejected rather than created
  automatically.
- A camera belongs to one agency vehicle, and that vehicle determines the
  tenant that reported the sighting.
- `PENDING_CLAIM` cases are visible across the partner network, but ownership
  begins only when a staff user claims a case. Tenant boundaries apply after
  claiming, and foreign source identities remain hidden.
- Only staff claim cases. Administrators have tenant-scoped read access;
  agents represent scan reporters and do not use the case-management views.
- The partner's repossession-eligibility decision is represented locally by a
  deterministic rule: a VIN is eligible when its final character is an even
  digit. This exists only to make the workflow reproducible.
- Seeded users, organizations, vehicles, coordinates, sightings, and images
  are demonstration data and do not represent real people or operations.

## Incomplete or simplified

- **Camera security:** `POST /api/v1/scans` is intentionally unauthenticated.
  A production integration needs per-device or partner credentials, request
  signing, replay protection, and rate limiting.
- **External integrations:** the partner registry and eligibility check are
  local database/stub behavior; no real lender, registry, LPR, or dispatch
  service is connected.
- **Photo storage:** the API records an `image_url`; it does not upload images
  to S3, issue presigned URLs, or enforce image retention and access policies.
- **Case lifecycle:** claiming is implemented, but assignment changes,
  closing/reopening cases, notes, audit history, and notifications are not.
- **Authentication:** there is no password reset, refresh-token flow, account
  lockout, MFA, SSO, or server-side token revocation.
- **Database evolution:** schema changes use `schema.sql` and destructive seed
  scripts rather than a versioned migration tool. The seed scripts are for
  development/demo use only.
- **Deployment:** the repository has no production AWS infrastructure or
  application Docker image yet. Locally, React is served by Vite. Packaging the
  React build into FastAPI/ECS, using RDS PostgreSQL, and storing scan photos in
  S3 are proposed deployment steps, not current implementation.
- **Scale and resilience:** scan processing is synchronous, and there is no
  queue, background worker, autoscaling configuration, high-availability
  topology, or disaster-recovery setup.

## Tests

With PostgreSQL running and backend dependencies installed:

```sh
cd backend
.venv/bin/python -m unittest discover -s tests
```

Build-check the frontend with:

```sh
cd frontend
npm run build
```
