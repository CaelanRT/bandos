#!/usr/bin/env bash
set -euo pipefail
exec node "$(dirname "$0")/v2-smoke.cjs" event
