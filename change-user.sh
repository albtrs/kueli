#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
	echo "usage: ./change-user.sh <container-name> [kueli-admin args...]" >&2
	exit 1
fi

container_name="$1"
shift

exec docker exec "$container_name" /kueli-admin "$@"