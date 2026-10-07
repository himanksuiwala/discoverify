# Archetype

Minimal FastAPI and React health dashboard backed by PostgreSQL, with a raw-SQL
LPR vehicle-recovery schema and deterministic development data.

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

## Health endpoint

`GET http://localhost:8000/api/health` returns HTTP 200 when the API and
database are available. If PostgreSQL cannot be reached, it returns HTTP 503
with the backend still reported as available.

## Reset development data

From `backend/`, run:

```sh
.venv/bin/python -m app.db.seed
```

The command applies `app/db/schema.sql`, clears the existing local application
tables, loads deterministic Faker data, validates the required business
invariants, and prints a summary. It is intended for development data only.
