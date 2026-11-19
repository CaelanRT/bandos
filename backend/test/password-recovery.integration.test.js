const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { once } = require('node:events');
const { Client } = require('pg');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const signature = require('cookie-signature');

const adminUrl = process.env.TEST_PG_ADMIN_URL;
assert.ok(adminUrl, 'TEST_PG_ADMIN_URL must identify a disposable PostgreSQL server');

test('password recovery and all-session revocation', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_password_${randomUUID().replaceAll('-', '')}`;
  let fixture, db, server;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    await fixture.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));
    Object.assign(process.env, { NODE_ENV: 'test', CLIENT_ORIGIN: 'http://client.example.test', SESSION_SECRET: 'test-secret',
      DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database,
      DB_USERNAME: decodeURIComponent(url.username), DB_PASSWORD: decodeURIComponent(url.password), DB_SSL: 'false', BCRYPT_ROUNDS: '4' });
    delete process.env.DB_SSL_CA_FILE;
    db = require('../db');
    const { decrypt } = require('../utils/notification-mail');
    const { digest, issueToken } = require('../utils/account-tokens');
    const { IDLE_MS } = require('../utils/account-session');
    const bcrypt = require('bcrypt');
    const { withSessionMutation, loadAccount } = require('../utils/account-session');
    const { createDispatcher } = require('../utils/notification-outbox');
    const key = randomBytes(32);
    let time = Date.now();
    const app = express();
    app.locals.sessionClock = () => time;
    app.locals.outboxEncryptionKey = key;
    app.use(express.json());
    const sessionStore = new PgStore({ pool: db.pool });
    app.use(session({ name: 'bandos.sid', secret: 'test-secret', store: sessionStore,
      resave: false, saveUninitialized: false, cookie: { maxAge: IDLE_MS } }));
    app.use('/api/v1/auth', require('../routes/auth.routes'));
    app.use('/api/v1/users', require('../routes/user.routes'));
    app.use('/api/v1/bands', require('../routes/band.routes'));
    app.use(require('../middleware/errors').notFound);
    app.use(require('../middleware/errors').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    async function request(path, body, cookie, method = 'POST', intentKey = randomUUID()) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intentKey, ...(cookie ? { Cookie: cookie } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0],
        retry: response.headers.get('retry-after') };
    }
    let serial = 0;
    const originalPassword = 'Password123!';
    const newPassword = 'é'.repeat(35) + '  ';
    const userRow = async id => (await fixture.query('SELECT * FROM users WHERE user_id=$1', [id])).rows[0];
    async function account({ verified = true, active = true } = {}) {
      const n = ++serial;
      return (await fixture.query(`INSERT INTO users (username,first_name,last_name,email,password_hash,email_verified_at,is_active)
        VALUES ($1,'First','Last',$2,$3,$4,$5) RETURNING *`, [`person${n}`, `person${n}@example.test`,
      await bcrypt.hash(originalPassword, 4), verified ? new Date(time) : null, active])).rows[0];
    }
    async function storedSession(user) {
      const sid = randomUUID();
      const facts = { cookie: { expires: new Date(Date.now() + IDLE_MS).toISOString(), originalMaxAge: IDLE_MS, httpOnly: true, path: '/' },
        userId: user.user_id, sessionGeneration: user.session_generation, authenticatedAt: new Date(time).toISOString(),
        lastActivityAt: new Date(time).toISOString(), access: user.email_verified_at ? 'full' : 'verification_required' };
      await fixture.query("INSERT INTO session (sid,sess,expire) VALUES ($1,$2,now()+interval '30 days')", [sid, facts]);
      return { facts, cookie: `bandos.sid=${encodeURIComponent('s:' + signature.sign(sid, 'test-secret'))}` };
    }
    const forgot = email => request('/auth/password/forgot', { email });
    const reset = (token, cookie, password = newPassword) => request('/auth/password/reset', { token, newPassword: password }, cookie);
    const change = (user, cookie, overrides = {}, intentKey) => request('/users/me/password', {
      expectedVersion: user.version, currentPassword: originalPassword, newPassword, ...overrides,
    }, cookie, 'POST', intentKey);
    async function latestToken(user, purpose = 'password_reset') {
      const row = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 AND security_purpose=$2 ORDER BY notification_id DESC', [user.user_id, purpose])).rows[0];
      return { row, token: decrypt(row.encrypted_security_payload, key).token };
    }
    async function recovery(user) {
      assert.equal((await forgot(user.email)).status, 202);
      return latestToken(user);
    }
    const notices = async user => (await fixture.query("SELECT * FROM email_outbox WHERE recipient_user_id=$1 AND security_purpose='password_changed'", [user.user_id])).rows;
    const directReq = facts => ({ session: { ...facts, cookie: {} }, app });

    await t.test('known, unknown and inactive requests share confirmation, normalized cooldowns and hourly limits across verification', async () => {
      const known = await account(), inactive = await account({ active: false });
      const emails = [known.email, inactive.email, 'unknown@example.test'];
      const first = await Promise.all(emails.map(email => forgot(` ${email.toUpperCase()} `)));
      assert.deepEqual(first.map(r => r.status), [202, 202, 202]);
      assert.deepEqual(first[0].body, first[1].body);
      assert.deepEqual(first[1].body, first[2].body);
      for (let n = 0; n < 5; n++) {
        if (n) {
          time += 60000;
          for (const email of emails) assert.equal((await forgot(email)).status, 202);
        }
        for (const email of emails) {
          const blocked = await request('/auth/verification/resend', { email });
          assert.equal(blocked.status, 429);
          assert.equal(blocked.retry, n === 4 ? '3360' : '60');
        }
      }
      assert.equal((await fixture.query('SELECT * FROM account_tokens WHERE user_id=$1', [inactive.user_id])).rowCount, 0);
      assert.equal((await userRow(known.user_id)).is_active, true);
      time += 3600001;
      for (let n = 0; n < 20; n++) assert.equal((await forgot(`missing${n}@example.test`)).status, 202);
      assert.equal((await forgot('extra@example.test')).status, 429);
    });

    await t.test('newest-only tokens, exact expiry, wrong purpose and generic missing/used failures; rejected issuance preserves link', async () => {
      time += 3600001;
      const user = await account();
      const first = await recovery(user);
      const row = (await fixture.query('SELECT * FROM account_tokens WHERE token_id=$1', [first.row.token_id])).rows[0];
      assert.equal(+row.expires_at - +row.issued_at, 1800000);
      assert.deepEqual(row.token_digest, digest(first.token));
      assert.ok(!JSON.stringify(first.row.payload).includes(first.token));
      assert.equal((await forgot(user.email)).status, 429);
      assert.equal((await fixture.query('SELECT revoked_at FROM account_tokens WHERE token_id=$1', [row.token_id])).rows[0].revoked_at, null);
      time += 60000;
      app.locals.outboxEncryptionKey = Buffer.alloc(1);
      const oldError = console.error;
      console.error = () => {};
      try { assert.equal((await forgot(user.email)).status, 500); }
      finally { console.error = oldError; app.locals.outboxEncryptionKey = key; }
      assert.equal((await fixture.query('SELECT revoked_at FROM account_tokens WHERE token_id=$1', [row.token_id])).rows[0].revoked_at, null);
      const replacement = await recovery(user);
      const invalid = await reset(first.token);
      assert.equal(invalid.body.error.code, 'TOKEN_INVALID_OR_EXPIRED');
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await issueToken(client, { user, purpose: 'registration_verification', address: user.email, now: time, encryptionKey: key });
        await client.query('COMMIT');
      } finally { client.release(); }
      const wrong = await latestToken(user, 'registration_verification');
      assert.deepEqual((await reset(wrong.token)).body, invalid.body);
      assert.deepEqual((await reset('')).body, invalid.body);
      assert.deepEqual((await request('/auth/password/reset', { newPassword })).body, invalid.body);
      time += 1800000;
      assert.deepEqual((await reset(replacement.token)).body, invalid.body);
      assert.equal((await userRow(user.user_id)).version, user.version);
      assert.equal((await notices(user)).length, 0);
    });

    await t.test('reset without login is single-use under concurrency and never verifies an unverified account', async () => {
      time += 3600001;
      const user = await account({ verified: false });
      const sessionA = await storedSession(user), sessionB = await storedSession(user);
      const issued = await recovery(user);
      const results = await Promise.all([reset(issued.token), reset(issued.token)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      assert.equal(results.find(r => r.status === 200).cookie, undefined);
      assert.equal((await reset(issued.token)).body.error.code, 'TOKEN_INVALID_OR_EXPIRED');
      const updated = await userRow(user.user_id);
      assert.equal(updated.email_verified_at, null);
      assert.equal(updated.version, user.version + 1);
      assert.equal(updated.session_generation, user.session_generation + 1);
      assert.ok(await bcrypt.compare(newPassword, updated.password_hash));
      assert.equal((await notices(user)).length, 1);
      for (const s of [sessionA, sessionB]) assert.equal((await request('/users/me', undefined, s.cookie, 'GET')).status, 401);
      const login = await request('/auth/login', { email: user.email, password: newPassword });
      assert.equal(login.body.data.session.access, 'verification_required');
      assert.equal((await request('/auth/login', { email: user.email, password: originalPassword })).status, 401);
    });

    await t.test('change validates strict input, byte bounds, expected version and current password with no side effects', async () => {
      time += 3600001;
      const user = await account(), s = await storedSession(user);
      for (const password of ['short', 'é'.repeat(37)]) {
        const invalid = await change(user, s.cookie, { newPassword: password });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.error.details[0].field, 'newPassword');
        assert.equal((await reset('invalid', undefined, password)).status, 400);
      }
      assert.equal((await change(user, s.cookie, { extra: true })).status, 400);
      assert.equal((await change(user, s.cookie, { expectedVersion: 2 })).body.error.code, 'STALE_VERSION');
      const wrong = await change(user, s.cookie, { currentPassword: 'wrong' });
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, 'CURRENT_PASSWORD_INCORRECT');
      assert.equal(wrong.body.error.details[0].field, 'currentPassword');
      assert.deepEqual(await userRow(user.user_id), user);
      assert.equal((await notices(user)).length, 0);
      assert.equal((await request('/users/me', undefined, s.cookie, 'GET')).status, 200);
    });

    await t.test('password change revokes caller/all devices, invalidates reset links and retry cannot repeat effects', async () => {
      time += 3600001;
      const user = await account(), s = await storedSession(user), other = await storedSession(user);
      const issued = await recovery(user), intent = randomUUID();
      const result = await change(user, s.cookie, {}, intent);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.cookie, 'bandos.sid=');
      for (const cookie of [s.cookie, other.cookie]) assert.equal((await request('/users/me', undefined, cookie, 'GET')).status, 401);
      assert.equal((await change(user, s.cookie, {}, intent)).status, 401);
      assert.equal((await reset(issued.token)).body.error.code, 'TOKEN_INVALID_OR_EXPIRED');
      const updated = await userRow(user.user_id);
      assert.equal(updated.version, user.version + 1);
      assert.equal(updated.session_generation, user.session_generation + 1);
      assert.ok(await bcrypt.compare(newPassword, updated.password_hash));
      assert.ok(!await bcrypt.compare(newPassword.trim(), updated.password_hash));
      assert.equal((await notices(user)).length, 1);
    });

    await t.test('reset blocks a preauthenticated stale mutation at its account lock', async () => {
      time += 3600001;
      const user = await account(), s = await storedSession(user);
      const req = directReq(s.facts);
      await loadAccount(req); // The request passed authentication before reset.
      const issued = await recovery(user);
      const blocker = await db.pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT 1 FROM users WHERE user_id=$1 FOR UPDATE', [user.user_id]);
        const resetting = reset(issued.token);
        // Wait for reset to reach the row lock, then queue the stale write behind it.
        for (let n = 0; ; n++) {
          const waiting = await fixture.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM users%'", [database]);
          if (waiting.rowCount) break;
          assert.ok(n < 200, 'reset must reach the lock');
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        let wrote = false;
        const stale = assert.rejects(withSessionMutation(req, async () => { wrote = true; }), { code: 'AUTHENTICATION_REQUIRED' });
        await blocker.query('COMMIT');
        assert.equal((await resetting).status, 200);
        await stale;
        assert.equal(wrote, false);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    });

    await t.test('post-commit store failures preserve success and generation revocation', async () => {
      time += 3600001;
      const user = await account(), s = await storedSession(user);
      const original = db.query;
      const originalDestroy = sessionStore.destroy;
      sessionStore.destroy = (sid, callback) => callback(new Error('store unavailable'));
      db.query = async (sql, ...args) => {
        if (sql.startsWith('DELETE FROM session')) throw new Error('cleanup unavailable');
        return original(sql, ...args);
      };
      try {
        const result = await change(user, s.cookie);
        assert.equal(result.status, 200);
        assert.equal(result.cookie, 'bandos.sid=');
      } finally { db.query = original; sessionStore.destroy = originalDestroy; }
      const updated = await userRow(user.user_id);
      assert.equal(updated.session_generation, user.session_generation + 1);
      await assert.rejects(loadAccount(directReq(s.facts)), { code: 'AUTHENTICATION_REQUIRED' });
      assert.equal((await notices(user)).length, 1);
    });

    await t.test('failed reset confirmations use separate purpose limit; security messages bypass preferences and clear encrypted tokens', async () => {
      time += 3600001;
      const user = await account();
      await fixture.query('INSERT INTO notification_preferences (user_id,enabled) VALUES ($1,false)', [user.user_id]);
      const issued = await recovery(user);
      for (let n = 0; n < 10; n++) assert.equal((await reset(`bad${n}`)).status, 400);
      const blocked = await reset(issued.token);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.retry, '900');
      assert.equal((await request('/auth/verification/confirm', { token: 'bad' })).status, 400);
      time += 900000;
      assert.equal((await reset(issued.token)).status, 200);
      const sent = [];
      const dispatcher = createDispatcher({ pool: db.pool, encryptionKey: key, origin: 'https://app.example.test',
        from: 'bandOS <sender@example.test>', clock: () => time, adapter: { send: async mail => { sent.push(mail); return { status: 'accepted', id: 'fake' }; } } });
      for (let n = 0; n < 100 && await dispatcher.dispatchOne(); n++) {}
      const obsolete = (await fixture.query('SELECT * FROM email_outbox WHERE notification_id=$1', [issued.row.notification_id])).rows[0];
      assert.equal(obsolete.state, 'suppressed');
      assert.equal(obsolete.encrypted_security_payload, null);
      const notice = (await notices(user))[0];
      assert.equal(notice.state, 'sent');
      assert.equal(notice.encrypted_security_payload, null);
      assert.ok(sent.some(mail => mail.to.includes(user.email)));
      assert.equal((await notices(user)).length, 1);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
