# Archetype

FastAPI and React application backed by PostgreSQL, with JWT authentication,
a raw-SQL LPR vehicle-recovery schema, and deterministic development data.

## Prerequisites

- Docker with Compose
- Python 3.12 and [`uv`](https://docs.astral.sh/uv/)
- Node.js 20+ and npm

## Run locally

1. Copy the local environment defaults:

   ```sh
   cp .env.example .env
   ```

2. Start PostgreSQL:

   ```sh
   docker compose up -d
   ```

3. Start the backend:

   ```sh
   cd backend
   uv venv --python 3.12
   uv pip install -r requirements.txt
   .venv/bin/python -m app.db.seed
   .venv/bin/uvicorn app.main:app --reload
   ```

4. In another terminal, start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

Open <http://localhost:5173>. Vite proxies `/api` requests to the backend at
<http://localhost:8000>.

## Demo authentication

The seed creates twelve users across three tenants. Every seeded user uses the
password `ArchetypeDemo!2026`; the seed command prints the full credential list.
For example:

```text
tenant1.admin@archetype.local
ArchetypeDemo!2026
```

Authentication uses a 30-minute JWT stored in an HttpOnly, SameSite cookie.
The browser never sends a user or tenant ID to identify the current user.

- `POST /api/auth/login` accepts `email` and `password`.
- `POST /api/auth/logout` clears the authentication cookie.
- `GET /api/profile` returns the authenticated user's identity and tenant.

## Health endpoint

`GET http://localhost:8000/api/health` returns HTTP 200 when the API and
database are available. If PostgreSQL cannot be reached, it returns HTTP 503
with the backend still reported as available.

## Scan ingestion

Simulated cameras can submit a registry-backed sighting to
`POST /api/v1/scans` without a user login. `camera_id` is the numeric
`cameras.id`, and the tenant is resolved from that camera's agency vehicle.
VINs are trimmed and uppercased, and plates are uppercased with spaces and
hyphens removed before registry lookup.

Every accepted sighting creates a scan. The response reports whether the
vehicle already has an open case, is ineligible, or received a new
`PENDING_CLAIM` case. The database permits one global pending case per vehicle
and one active case per tenant and vehicle, while allowing historical closed
cases.

`POST /mock/partner-network/eligibility` exposes the local partner stub. A VIN
is eligible only when its final character is an even digit.

## Recovery cases

Authenticated staff and administrators can read their tenant's active and
closed cases through `GET /api/v1/cases` and `GET /api/v1/cases/{case_id}`.
Only staff can browse the global pending pool at
`GET /api/v1/cases/claimable` and atomically claim a pending case with
`POST /api/v1/cases/{case_id}/claim`.

The React workspace provides responsive My Cases, Claimable Cases, and Case
Detail views. Staff can confirm a claim from the shared pool and move directly
into its scan history; administrators retain tenant-scoped read access, while
agents remain outside the case-management workspace.

The list endpoints support exact normalized VIN/plate search and offset
pagination with a default limit of 25 and maximum of 50. Case detail includes
the vehicle's scan trail; source identities are redacted for scans originating
from another tenant.

## Reset development data

From `backend/`, run:

```sh
.venv/bin/python -m app.db.seed
```

The command applies `app/db/schema.sql`, clears the existing local application
tables, loads deterministic Faker data, validates the required business
invariants, and prints a summary. It is intended for development data only.

## Spec-driven development

This repository is initialized with GitHub Spec Kit's Codex integration. Spec
Kit's shared templates and scripts live in `.specify/`; its project-local Codex
skills live in `.agents/skills/`.

Run the following skills in Codex chat, not in the terminal:

1. `$speckit-constitution` once, to agree on the project's engineering rules.
2. `$speckit-specify` to describe a bounded feature and its intended outcome.
3. `$speckit-clarify` when requirements still contain meaningful ambiguity.
4. `$speckit-plan` to design the change against the existing codebase.
5. `$speckit-tasks` to produce an actionable implementation sequence.
6. `$speckit-analyze` to check consistency before implementation.
7. `$speckit-implement` to execute the approved tasks.
8. `$speckit-converge` to find remaining gaps; repeat implementation and
   convergence until the result is converged.

Keep each feature bounded and review the generated specification and plan before
continuing. Existing code remains implementation context; a new specification
describes the intended change rather than retroactively documenting the entire
system.
