const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { mountFrontend } = require('../frontend');
const { notFound, errorHandler } = require('../middleware/errors');

function request(port, url, method = 'GET', extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method,
      headers: { Accept: 'text/html', 'X-Forwarded-Proto': 'https', ...extraHeaders } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('actual production app serves the generated bundle without accessing sessions/database', async () => {
  const directory = path.resolve(__dirname, '../../frontend/dist');
  const index = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const reservation = http.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  // Any session lookup/query fails: the real app runs against an unavailable DB.
  const child = spawn(process.execPath, ['-e', `
    const db = require('./db');
    db.pool.query = db.query = () => {
      console.error('TEST_DATABASE_ACCESSED');
      return Promise.reject(new Error('test database unavailable'));
    };
    require('./app');
  `], { cwd: path.resolve(__dirname, '..'), env: { ...process.env,
    NODE_ENV: 'production', PORT: String(port), CLIENT_ORIGIN: 'https://app.example.test',
    SESSION_SECRET: 'disposable-frontend-test-secret', TRUST_PROXY: '127.0.0.1/32',
    DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'disposable', DB_USERNAME: 'disposable',
    DB_PASSWORD: 'disposable', DB_SSL: 'false', DB_SSL_CA_FILE: undefined, DOTENV_CONFIG_QUIET: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  try {
    for (let i = 0; i < 100 && !output.includes('listening'); i++) {
      assert.equal(child.exitCode, null, output);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.match(output, /listening/);
    const signed = 's:' + require('cookie-signature').sign('existing-session', 'disposable-frontend-test-secret');
    const cookie = { Cookie: `bandos.sid=${encodeURIComponent(signed)}` };
    for (const url of ['/', '/index.html', '/bands/7/events/12', '/unknown-ui-route']) {
      for (const method of ['GET', 'HEAD']) {
        const res = await request(port, url, method, cookie);
        assert.equal(res.status, 200, url);
        assert.match(res.headers['content-type'], /text\/html/);
        assert.equal(res.headers['cache-control'], 'no-cache');
        assert.ok(res.headers['content-security-policy'].includes("connect-src")
          || res.headers['content-security-policy'].includes("default-src 'self'"));
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
        assert.equal(res.headers['set-cookie'], undefined);
        assert.equal(res.body, method === 'HEAD' ? '' : index);
      }
    }
    const assets = fs.readdirSync(path.join(directory, 'assets'));
    for (const [extension, type] of [['js', /javascript/], ['css', /text\/css/], ['ttf', /font\/ttf/]]) {
      const filename = assets.find((file) => file.endsWith('.' + extension));
      assert.ok(filename, `built ${extension} exists`);
      const res = await request(port, '/assets/' + filename, 'GET', cookie);
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], type);
      assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
      assert.ok(res.headers['content-security-policy']);
      assert.equal(res.headers['set-cookie'], undefined);
    }
    for (const [url, method] of [['/assets/missing.js', 'GET'], ['/assets/missing', 'GET'],
      ['/missing.css', 'GET'], ['/app.js', 'GET'], ['/.env', 'GET'], ['/backend/app.js', 'GET'],
      ['/api/v1/unknown', 'GET'], ['/api/v1/unknown', 'HEAD'], ['/unknown-ui-route', 'POST'],
      ['/bands/7', 'PUT']]) {
      const res = await request(port, url, method);
      assert.equal(res.status, 404, `${method} ${url}`);
      assert.match(res.headers['content-type'], /application\/json/);
      if (method !== 'HEAD') assert.equal(JSON.parse(res.body).error.code, 'NOT_FOUND');
    }
    assert.equal((await request(port, '/', 'GET', { 'X-Forwarded-Proto': 'http' })).status, 426);
    assert.equal((await request(port, '/api/v1/users/me')).status, 401);
    assert.ok(!output.includes('TEST_DATABASE_ACCESSED'), output);
    // Prove the signed cookie would access the session store on API requests.
    assert.equal((await request(port, '/api/v1/users/me', 'GET', cookie)).status, 500);
    assert.match(output, /TEST_DATABASE_ACCESSED/);
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
});

test('absent build permits API-only development and fails packaged startup', async () => {
  const app = express();
  assert.throws(() => mountFrontend(app, { required: true, directory: '/nonexistent/bandos-build' }), /Frontend build missing/);
  mountFrontend(app, { directory: '/nonexistent/bandos-build' });
  app.use(notFound);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    assert.equal((await request(server.address().port, '/bands/7')).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
