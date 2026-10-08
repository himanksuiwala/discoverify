#!/usr/bin/env bash
# ==============================================================================
# Discovery File Operations - Focused 2-Tenant Demo Seeder
# ==============================================================================
# Sets up the exact 2-tenant demonstration scenario:
#   1. Tenant A (cam_1001) -> Existing active case for VIN 1FTFW1E51NFA12345
#   2. Tenant B (cam_2050) -> Brand new vehicle for VIN 5NPE34AF9KH123456
#
# Usage:
#   ./seed_demo.sh
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

cd "${BACKEND_DIR}"
exec "${PYTHON_BIN}" -m app.db.seed_demo "$@"
