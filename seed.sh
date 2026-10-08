#!/usr/bin/env bash
# ==============================================================================
# Discovery File Operations - Database Seeding & Schema Rebuild Script
# ==============================================================================
# Usage:
#   ./seed.sh               # Recreates schema from scratch and seeds data
#   ./seed.sh --fresh       # Explicitly drop all tables CASCADE and rebuild schema
#   ./seed.sh --no-fresh    # Only truncate table data without dropping schema
#   ./seed.sh --scans 200   # Custom number of scans
#   ./seed.sh --help        # Display full options
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

# Load local environment if available
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
elif [[ -f "${BACKEND_DIR}/.env" ]]; then
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

# Locate Python environment
PYTHON_BIN=""
if [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${BACKEND_DIR}/.venv/bin/python"
elif [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
elif command -v python3 &>/dev/null; then
  PYTHON_BIN="$(command -v python3)"
else
  echo "Error: Python 3 not found. Please setup backend virtual environment (.venv)." >&2
  exit 1
fi

echo "=================================================="
echo " Discovery File Operations — Database Seeder"
echo "=================================================="

cd "${BACKEND_DIR}"

if [[ "${1:-}" == "--demo" ]]; then
  shift
  exec "${PYTHON_BIN}" -m app.db.seed_demo "$@"
fi

# Execute standard seed script inside backend directory with forwarded arguments
exec "${PYTHON_BIN}" -m app.db.seed "$@"
