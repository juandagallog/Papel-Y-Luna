#!/usr/bin/env bash
set -euo pipefail

# Render debe usar la nueva PostgreSQL, nunca una SQLite efímera.
: "${DATABASE_URL:?Configura DATABASE_URL con la base PostgreSQL de Render}"
: "${SECRET_KEY:?Configura una SECRET_KEY privada en Render}"
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "DATABASE_URL debe apuntar a PostgreSQL." >&2; exit 1 ;;
esac
export DEBUG="${DEBUG:-False}"

python backend/manage.py migrate --no-input
exec python -m gunicorn --chdir backend config.wsgi:application --bind "0.0.0.0:${PORT:-8000}"
