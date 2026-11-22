#!/usr/bin/env bash
set -euo pipefail
if (( $# > 0 )); then
  printf 'Legacy prefix cleanup is no longer supported. Preserve old data for manual inspection.\n' >&2
  exit 2
fi
printf 'V2 smoke runners clean up their own isolated databases, including on failure. No teardown needed.\n'
