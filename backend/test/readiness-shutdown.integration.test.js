const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { spawn, execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const { loadConfig } = require('../config');

// This runner stops/pauses the entire fixture. Never use a retained database.
const container = process.env.TEST_PG_CONTAINER;
assert.equal(container, 'bandos-readiness-test', 'requires the dedicated disposable TEST_PG_CONTAINER=bandos-readiness-test');
const env = { ...process.env, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.example.test',
  SESSION_SECRET: 'disposable-session-secret', DB_SSL: 'false', DB_SSL_CA_FILE: undefined,
  TRUST_PROXY: 'false', DB_CONNECTION_TIMEOUT_MS: '300', HEALTH_QUERY_TIMEOUT_MS: '300',
  SHUTDOWN_TIMEOUT_MS: '2000', DOTENV_CONFIG_QUIET: 'true' };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function docker(action) { execFileSync('docker', [action, container], { stdio: 'ignore' }); }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await delay(30); }
  assert.fail('timed out waiting for process/database state');
}
function request(port, path = '/api/v1/health', method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(4000, () => req.destroy(new Error('HTTP check timed out')));
    req.on('error', reject);
    req.end();
  });
}
async function start(overrides = {}) {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const name = `readiness_${port}`;
  const child = spawn(process.execPath, ['app.js'], { cwd: require('node:path').join(__dirname, '..'),
    env: { ...env, PORT: String(port), PGAPPNAME: name, ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  await until(() => { assert.equal(child.exitCode, null, output); return output.includes('listening'); });
  return { child, port, name, exited, output: () => output };
}
async function stop(api) {
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL');
  await api.exited;
}

// Sequential because outage checks mutate the dedicated PostgreSQL fixture.
test('exact private probe, bounded outage/query failures, idle errors, and database recovery', async () => {
  const api = await start();
  const admin = new Pool(loadConfig(env).database);
  admin.on('error', () => {});
  try {
    assert.deepEqual(await request(api.port), { status: 200, body: '{"data":{"status":"ok"}}' });
    assert.equal((await request(api.port, '/api/v1/health?probe=1')).status, 200);
    for (const [path, method] of [['/api/v1/health/', 'GET'], ['/api/v1/health/extra', 'GET'],
      ['/API/v1/health', 'GET'], ['/api/v1/health', 'HEAD'], ['/api/v1/health', 'POST'],
      ['/api/v1/health', 'OPTIONS'], ['/api/v1/users/me', 'GET']]) {
      assert.equal((await request(api.port, path, method, { 'X-Forwarded-Proto': 'https' })).status, 426, `${method} ${path}`);
    }
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1', [api.name]);
    await until(() => api.output().includes('Database idle connection failed'));
    assert.equal((await request(api.port)).status, 200);
    docker('pause');
    const started = Date.now();
    // A signed cookie for a nonexistent/expired session must not trigger session lookup.
    const signed = 's:' + require('cookie-signature').sign('expired-session', env.SESSION_SECRET);
    const failed = await request(api.port, '/api/v1/health', 'GET', { Cookie: `bandos.sid=${encodeURIComponent(signed)}` });
    assert.equal(failed.status, 503);
    assert.equal(JSON.parse(failed.body).error.code, 'DATABASE_UNAVAILABLE');
    assert.ok(Date.now() - started < 1500, 'query timeout is bounded');
    docker('unpause');
    await until(async () => (await request(api.port)).status === 200);
    docker('stop');
    const down = await request(api.port);
    assert.equal(down.status, 503);
    assert.equal(api.child.exitCode, null, 'outage does not restart the API');
    docker('start');
    await until(async () => (await request(api.port)).status === 200);
  } finally {
    try { docker('unpause'); } catch {}
    docker('start');
    await admin.end();
    await stop(api);
  }
});

test('connection establishment timeout is bounded even when a peer accepts but never responds', async () => {
  const sockets = new Set();
  const blackhole = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); }).listen(0, '127.0.0.1');
  await once(blackhole, 'listening');
  const api = await start({ DB_PORT: String(blackhole.address().port) });
  try {
    const started = Date.now();
    assert.equal((await request(api.port)).status, 503);
    assert.ok(Date.now() - started < 1500);
  } finally {
    await stop(api);
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => blackhole.close(resolve));
  }
});

test('SIGTERM and SIGINT drain active requests, reject new connections, close the pool once', async () => {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const api = await start({ HEALTH_QUERY_TIMEOUT_MS: '3000' });
    const admin = new Pool(loadConfig(env).database);
  admin.on('error', () => {});
    try {
      assert.equal((await request(api.port)).status, 200);
      docker('pause');
      const active = request(api.port);
      await delay(100);
      const started = Date.now();
      api.child.kill(signal);
      await until(() => api.output().includes('Shutdown started'));
      api.child.kill(signal === 'SIGTERM' ? 'SIGINT' : 'SIGTERM');
      await assert.rejects(request(api.port), /ECONNREFUSED|ECONNRESET/);
      docker('unpause');
      assert.equal((await active).status, 200, 'in-flight response drains');
      assert.deepEqual(await api.exited, [0, null], api.output());
      assert.ok(Date.now() - started < 2500);
      assert.equal(api.output().match(/Shutdown started/g).length, 1);
      assert.equal(api.output().match(/Shutdown complete; database pool closed/g).length, 1);
      assert.equal((await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=$1', [api.name])).rows[0].count, 0);
    } finally {
      try { docker('unpause'); } catch {}
      await admin.end();
      await stop(api);
    }
  }
});

test('stuck active work uses forced exit only after the shutdown deadline', async () => {
  const api = await start({ HEALTH_QUERY_TIMEOUT_MS: '5000', SHUTDOWN_TIMEOUT_MS: '400' });
  try {
    assert.equal((await request(api.port)).status, 200);
    docker('pause');
    const active = request(api.port).catch(() => null);
    await delay(100);
    const started = Date.now();
    api.child.kill('SIGTERM');
    assert.deepEqual(await api.exited, [1, null]);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 350 && elapsed < 1500, `forced deadline: ${elapsed}ms`);
    assert.match(api.output(), /Shutdown deadline exceeded; forcing exit/);
    assert.ok(!api.output().includes('Shutdown complete'));
    await active;
  } finally {
    try { docker('unpause'); } catch {}
    await stop(api);
  }
});
