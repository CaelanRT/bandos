const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { once } = require('node:events');
const http = require('node:http');
const { Client } = require('pg');
const signature = require('cookie-signature');
const bcrypt = require('bcrypt');

const adminUrl = process.env.TEST_PG_ADMIN_URL;
assert.ok(adminUrl, 'TEST_PG_ADMIN_URL must identify a disposable PostgreSQL server with CREATEDB permission');

test('bounded PostgreSQL sessions, access, Origin and commit checks', async (t) => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_sessions_${randomUUID().replaceAll('-', '')}`;
  let fixture;
  let server;
  let db;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    await fixture.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));
    const reservation = http.createServer().listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const secret = 'disposable-bounded-session-secret';
    Object.assign(process.env, {
      NODE_ENV: 'test', PORT: String(port), CLIENT_ORIGIN: 'http://client.example.test',
      SESSION_SECRET: secret, DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database,
      DB_USERNAME: decodeURIComponent(url.username), DB_PASSWORD: decodeURIComponent(url.password),
      DB_SSL: 'false', BCRYPT_ROUNDS: '4',
    });
    delete process.env.DB_SSL_CA_FILE;
    const runtime = require('../app');
    server = runtime.server;
    if (!server.listening) await once(server, 'listening');
    db = require('../db');
    const { IDLE_MS, ABSOLUTE_MS, loadAccount, withSessionMutation } = require('../utils/account-session');
    let time = Date.now();
    runtime.app.locals.sessionClock = () => time;
    const hash = await bcrypt.hash('Password123!', 4);
    const user = (await fixture.query(`INSERT INTO users (username,first_name,last_name,email,password_hash,email_verified_at)
      VALUES ('verified','First','Last','verified@example.test',$1,now()) RETURNING *`, [hash])).rows[0];
    const unverified = (await fixture.query(`INSERT INTO users (username,first_name,last_name,email,password_hash)
      VALUES ('unverified','First','Last','unverified@example.test',$1) RETURNING *`, [hash])).rows[0];

    async function session(account = user, overrides = {}) {
      const sid = randomUUID();
      const facts = { cookie: { originalMaxAge: IDLE_MS, expires: new Date(Date.now() + IDLE_MS).toISOString(),
        httpOnly: true, path: '/', sameSite: 'lax', secure: false }, userId: account.user_id,
      sessionGeneration: account.session_generation, authenticatedAt: new Date(time).toISOString(),
      lastActivityAt: new Date(time).toISOString(), access: 'full', registrationOrigin: false, ...overrides };
      await fixture.query(`INSERT INTO session (sid,sess,expire) VALUES ($1,$2,now()+interval '30 days')`, [sid, facts]);
      return { sid, facts, cookie: `bandos.sid=${encodeURIComponent('s:' + signature.sign(sid, secret))}` };
    }
    async function stored(s) {
      return (await fixture.query('SELECT sess,expire FROM session WHERE sid=$1', [s.sid])).rows[0];
    }
    async function request(path, { method = 'GET', cookie, body, rawBody, headers = {} } = {}) {
      const result = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
      return { status: result.status, body: await result.json(), cookie: result.headers.get('set-cookie'), headers: result.headers };
    }
    function req(s) {
      return { session: { ...s.facts, cookie: { ...s.facts.cookie } }, app: runtime.app };
    }

    await t.test('login regenerates IDs, identifies access and never exposes credentials', async () => {
      const old = await session();
      for (const account of [user, unverified]) {
        const login = await request('/auth/login', { method: 'POST', cookie: old.cookie,
          body: { email: account.email, password: 'Password123!' } });
        assert.equal(login.status, 200);
        assert.ok(!login.cookie.startsWith(old.cookie + ';'));
        assert.equal(login.body.data.session.access, account === user ? 'full' : 'verification_required');
        assert.equal(login.body.data.user.email_verified_at !== null, account === user);
        assert.equal(login.body.data.user.pending_email, null);
        assert.equal(login.body.data.user.version, 1);
        assert.equal(login.body.data.user.password_hash, undefined);
        assert.equal(login.body.data.user.session_generation, undefined);
        assert.equal(Date.parse(login.body.data.session.idleExpiresAt), time + IDLE_MS);
        assert.equal(Date.parse(login.body.data.session.absoluteExpiresAt), time + ABSOLUTE_MS);
      }
      assert.equal(await stored(old), undefined, 'old session ID was removed');
      const invalid = await request('/auth/login', { method: 'POST', body: { email: user.email, password: 'wrong' } });
      assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');
      const registration = await request('/auth/register', { method: 'POST', body: {
        username: 'registered', firstName: 'First', lastName: 'Last', email: 'registration@example.test', password: 'Password123!',
      } });
      assert.equal(registration.status, 201);
      assert.equal(registration.body.data.session.access, 'verification_required');
      const origin = await fixture.query("SELECT sess FROM session WHERE (sess->>'userId')::int=$1", [registration.body.data.user.user_id]);
      assert.equal(origin.rows[0].sess.registrationOrigin, true);
    });

    await t.test('only successful explicit GETs and accepted mutations renew activity', async () => {
      const s = await session();
      time += 1000;
      const passive = await request('/users/me', { cookie: s.cookie });
      assert.equal(passive.status, 200);
      assert.equal((await stored(s)).sess.lastActivityAt, s.facts.lastActivityAt);
      const passiveExpiry = (await stored(s)).expire;
      time += 1000;
      await request('/users/me', { cookie: s.cookie });
      assert.deepEqual((await stored(s)).expire, passiveExpiry, 'store touch retains the deadline');
      const failedLogin = await request('/auth/login', { method: 'POST', cookie: s.cookie,
        body: { email: user.email, password: 'wrong' } });
      assert.equal(failedLogin.status, 401);
      assert.deepEqual((await stored(s)).expire, passiveExpiry, 'failed login cannot roll transport expiry');
      assert.equal((await stored(s)).sess.lastActivityAt, s.facts.lastActivityAt);
      const read = await request('/users/me', { cookie: s.cookie, headers: { 'X-bandos-activity': 'user' } });
      assert.equal(Date.parse(read.body.data.session.idleExpiresAt), time + IDLE_MS);
      assert.equal((await stored(s)).sess.lastActivityAt, new Date(time).toISOString());
      time += 1000;
      const fail = await request('/bands/999999', { cookie: s.cookie, headers: { 'X-bandos-activity': 'user' } });
      assert.equal(fail.status, 404);
      assert.notEqual((await stored(s)).sess.lastActivityAt, new Date(time).toISOString());
      const rejected = await request('/bands', { method: 'POST', cookie: s.cookie, body: {} });
      assert.equal(rejected.status, 400);
      assert.notEqual((await stored(s)).sess.lastActivityAt, new Date(time).toISOString());
      const accepted = await request('/users/me', { method: 'PATCH', cookie: s.cookie, body: { firstName: 'Updated' } });
      assert.equal(accepted.status, 200);
      assert.equal((await stored(s)).sess.lastActivityAt, new Date(time).toISOString());
      const band = await request('/bands', { method: 'POST', cookie: s.cookie, body: { name: 'Session smoke' } });
      assert.equal(band.status, 201);
      const path = `/bands/${band.body.data.band.bandId}`;
      assert.equal((await request(path, { cookie: s.cookie })).status, 200);
      assert.equal((await request(path, { method: 'PATCH', cookie: s.cookie, body: { name: 'Renamed' } })).status, 200);
      assert.equal((await request(path, { method: 'DELETE', cookie: s.cookie })).status, 200);
    });

    await t.test('exact idle and absolute boundaries expire before renewal or writes', async () => {
      for (const [overrides, reason] of [
        [{ lastActivityAt: new Date(time - IDLE_MS).toISOString() }, 'idle_expired'],
        [{ authenticatedAt: new Date(time - ABSOLUTE_MS).toISOString() }, 'absolute_expired'],
      ]) {
        const s = await session(user, overrides);
        for (const options of [{ headers: { 'X-bandos-activity': 'user' } }, { method: 'PATCH', body: { firstName: 'Expired' } }]) {
          const result = await request('/users/me', { cookie: s.cookie, ...options });
          assert.equal(result.status, 401);
          assert.ok(result.body.error.reason === reason || result.body.error.reason === undefined);
        }
        assert.equal(await stored(s), undefined);
      }
      const s = await session(user, { authenticatedAt: new Date(time - ABSOLUTE_MS + 1000).toISOString() });
      const result = await request('/users/me', { cookie: s.cookie, headers: { 'X-bandos-activity': 'user' } });
      assert.equal(Date.parse(result.body.data.session.idleExpiresAt), time + 1000);
      assert.ok(new Date((await stored(s)).expire).getTime() <= time + 1000);
      time += 1000;
      assert.equal((await request('/users/me', { cookie: s.cookie })).body.error.reason, 'absolute_expired');
    });

    await t.test('revoked, inactive and missing sessions cannot access protected resources', async () => {
      for (const facts of [{ sessionGeneration: 0 }, { userId: 999999 }]) {
        const s = await session(user, facts);
        const result = await request('/users/me', { cookie: s.cookie });
        assert.equal(result.body.error.reason, 'revoked');
        assert.equal(result.status, 401);
      }
      await fixture.query('UPDATE users SET is_active=false WHERE user_id=$1', [unverified.user_id]);
      const inactive = await session(unverified);
      assert.equal((await request('/users/me', { cookie: inactive.cookie })).body.error.reason, 'revoked');
      await fixture.query('UPDATE users SET is_active=true WHERE user_id=$1', [unverified.user_id]);
      const missing = await session();
      await fixture.query('DELETE FROM session WHERE sid=$1', [missing.sid]);
      const result = await request('/users/me', { cookie: missing.cookie, headers: { 'X-bandos-activity': 'user' } });
      assert.deepEqual(result.body.error, { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' });
    });

    await t.test('restricted access uses current account state; logout is optional and idempotent', async () => {
      const s = await session(unverified); // cached full access must not bypass current state
      const me = await request('/users/me', { cookie: s.cookie });
      assert.equal(me.status, 200);
      assert.equal(me.body.data.session.access, 'verification_required');
      for (const [path, method, body] of [['/bands', 'GET'], ['/users/me', 'PATCH', { firstName: 'No' }]]) {
        const result = await request(path, { method, body, cookie: s.cookie });
        assert.equal(result.status, 403);
        assert.equal(result.body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
      }
      for (let i = 0; i < 2; i++) assert.equal((await request('/auth/logout', { method: 'POST', cookie: s.cookie, body: {} })).status, 200);
    });

    await t.test('Origin checks include auth and cannot be bypassed by activity headers', async () => {
      const s = await session();
      for (const path of ['/auth/login', '/auth/register', '/auth/logout', '/users/me']) {
        const result = await request(path, { method: path === '/users/me' ? 'PATCH' : 'POST', cookie: s.cookie,
          body: {}, headers: { Origin: 'http://evil.example.test', 'X-bandos-activity': 'user' } });
        assert.equal(result.status, 403);
        assert.equal(result.body.error.code, 'ORIGIN_NOT_ALLOWED');
      }
      for (const origin of [process.env.CLIENT_ORIGIN, `http://127.0.0.1:${port}`]) {
        assert.equal((await request('/auth/logout', { method: 'POST', body: {}, headers: { Origin: origin } })).status, 200);
      }
      const malformed = await request('/auth/login', { method: 'POST', rawBody: '{"password":"private",' });
      assert.deepEqual(malformed.body, { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body',
        details: [{ field: 'body', message: 'Malformed JSON' }] } });
      const cors = await request('/users/me', { headers: { Origin: process.env.CLIENT_ORIGIN } });
      assert.equal(cors.headers.get('access-control-allow-origin'), process.env.CLIENT_ORIGIN);
      assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
    });

    await t.test('generation changes racing a mutation and expiry during work roll back all writes', async () => {
      const s = await session();
      const stale = req(s);
      await loadAccount(stale); // request passed its entry check
      const revoker = await db.pool.connect();
      await revoker.query('BEGIN');
      await revoker.query('UPDATE users SET session_generation=session_generation+1 WHERE user_id=$1', [user.user_id]);
      const mutation = withSessionMutation(stale, async client => {
        await client.query("UPDATE users SET first_name='Stale' WHERE user_id=$1", [user.user_id]);
      });
      await revoker.query('COMMIT');
      revoker.release();
      await assert.rejects(mutation, { code: 'AUTHENTICATION_REQUIRED', reason: 'revoked' });
      user.session_generation++;
      const current = req(await session());
      await assert.rejects(withSessionMutation(current, async client => {
        await client.query("UPDATE users SET first_name='Expired' WHERE user_id=$1", [user.user_id]);
        time += IDLE_MS;
      }), { code: 'AUTHENTICATION_REQUIRED', reason: 'idle_expired' });
      assert.equal((await fixture.query('SELECT first_name FROM users WHERE user_id=$1', [user.user_id])).rows[0].first_name, 'Updated');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
