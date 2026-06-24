#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
SERVICE="${SERVICE:-kueli-api}"

cd "$SCRIPT_DIR"

exec docker compose -f "$COMPOSE_FILE" run --rm --entrypoint /kueli-admin "$SERVICE" "$@"