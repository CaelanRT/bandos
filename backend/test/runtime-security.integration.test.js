const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const express = require('express');
const { loadConfig } = require('../config');

function request(port, path, { headers = {}, body, localAddress } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, localAddress,
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

const env = { ...process.env, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.example.test',
  SESSION_SECRET: 'disposable-test-session-secret-only', DB_SSL: 'true', TRUST_PROXY: '127.0.0.1/32' };
// Verify required fixtures up front; absence must not silently skip required checks.
assert.ok(env.DB_SSL_CA_FILE, 'DB_SSL_CA_FILE is required');
assert.ok(env.TEST_UNTRUSTED_CA_FILE, 'TEST_UNTRUSTED_CA_FILE is required');

test('database TLS accepts trusted CA, rejects unknown CA and incorrect host, and supports private plaintext', async () => {
  for (const [overrides, succeeds] of [
    [{}, true],
    [{ DB_SSL_CA_FILE: env.TEST_UNTRUSTED_CA_FILE }, false],
    [{ DB_SSL_CA_FILE: undefined }, false],
    [{ DB_HOST: '127.0.0.1' }, false],
    [{ DB_SSL: 'false', DB_SSL_CA_FILE: undefined }, true],
  ]) {
    const pool = new Pool({ ...loadConfig({ ...env, ...overrides }).database, connectionTimeoutMillis: 3000 });
    try {
      if (succeeds) assert.equal((await pool.query('SELECT 1 AS value')).rows[0].value, 1);
      else await assert.rejects(pool.query('SELECT 1'), /certificate|altname|self.signed|issuer/i);
    } finally { await pool.end(); }
  }
});

test('only trusted socket peers influence Express protocol and client IP', async () => {
  const app = express();
  app.set('trust proxy', loadConfig(env).trustProxy);
  app.get('/', (req, res) => res.json({ secure: req.secure, ip: req.ip }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const options = { headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '198.51.100.42' } };
    const trusted = await request(server.address().port, '/', options);
    assert.deepEqual(JSON.parse(trusted.data), { secure: true, ip: '198.51.100.42' });
    const untrusted = await request(server.address().port, '/', { ...options, localAddress: '127.0.0.2' });
    assert.deepEqual(JSON.parse(untrusted.data), { secure: false, ip: '127.0.0.2' });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('production rejects HTTP and preserves CORS, default-cost authentication and rolling secure cookies', async () => {
  const reservation = http.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['app.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...env, PORT: String(port), BCRYPT_ROUNDS: undefined, DOTENV_CONFIG_QUIET: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const pool = new Pool(loadConfig(env).database);
  try {
    for (let attempt = 0; attempt < 100 && !output.includes('listening'); attempt++) {
      if (child.exitCode !== null) throw new Error(`API failed to start: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(output, /listening/);
    assert.equal((await request(port, '/api/v1/health')).status, 426);
    const headers = { 'X-Forwarded-Proto': 'https', Origin: env.CLIENT_ORIGIN };
    assert.equal((await request(port, '/api/v1/health', { headers, localAddress: '127.0.0.2' })).status, 426);
    const health = await request(port, '/api/v1/health', { headers });
    assert.equal(health.status, 200);
    assert.equal(health.headers['access-control-allow-origin'], env.CLIENT_ORIGIN);
    assert.equal(health.headers['access-control-allow-credentials'], 'true');
    const other = await request(port, '/api/v1/health', { headers: { ...headers, Origin: 'https://untrusted.example.test' } });
    assert.notEqual(other.headers['access-control-allow-origin'], 'https://untrusted.example.test');
    const username = `runtime_${Date.now()}`;
    const body = { username, firstName: 'Runtime', lastName: 'Test', email: `${username}@example.test`, password: 'DisposablePassword123!' };
    const registered = await request(port, '/api/v1/auth/register', { headers, body });
    assert.equal(registered.status, 201, registered.data);
    const hash = (await pool.query('SELECT password_hash FROM users WHERE username=$1', [username])).rows[0].password_hash;
    assert.equal(bcrypt.getRounds(hash), 12);
    const cookie = registered.headers['set-cookie'][0];
    for (const property of ['bandos.sid=', 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(cookie.includes(property));
    const expires = new Date(cookie.match(/Expires=([^;]+)/)[1]);
    assert.ok(Math.abs(expires.getTime() - Date.now() - 7 * 86400000) < 5000);
    const authenticatedHeaders = { ...headers, Cookie: cookie.split(';')[0] };
    const me = await request(port, '/api/v1/users/me', { headers: authenticatedHeaders });
    assert.equal(me.status, 200);
    assert.ok(me.headers['set-cookie'][0].includes('bandos.sid='), 'rolling cookie is refreshed');
    assert.equal((await request(port, '/api/v1/auth/logout', { headers: authenticatedHeaders, body: {} })).status, 200);
    const login = await request(port, '/api/v1/auth/login', { headers, body: { email: body.email, password: body.password } });
    assert.equal(login.status, 200, login.data);
    assert.ok(login.headers['set-cookie'][0].includes('Secure'));
  } finally {
    await pool.end();
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
});
