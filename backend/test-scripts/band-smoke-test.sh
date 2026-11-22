#!/usr/bin/env bash
set -euo pipefail
# Owns an isolated database and app; never uses .env or the development database.
exec node "$(dirname "$0")/v2-smoke.cjs" band
