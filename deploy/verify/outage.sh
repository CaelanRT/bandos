#!/usr/bin/env bash
set -euo pipefail
node - <<'NODE'
const assert = require('node:assert/strict');
const request = require('/checks/request.cjs');
(async () => {
  const start = Date.now();
  assert.equal((await request('/api/v1/health')).status, 503);
  assert(Date.now() - start < 5000, 'readiness exceeds configured connection/query bound');
  assert.equal((await request('/bands/1/events/1')).status, 200);
  console.log('PASS bounded 503 and static frontend during paused database');
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE
