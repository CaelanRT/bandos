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

test('registration verification, bounded continuation and shared security limits', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_verify_${randomUUID().replaceAll('-', '')}`;
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
    const { digest, issueToken, accountIssuance } = require('../utils/account-tokens');
    const { IDLE_MS, ABSOLUTE_MS } = require('../utils/account-session');
    const { createDispatcher } = require('../utils/notification-outbox');
    const key = randomBytes(32);
    let time = Date.now();
    const app = express();
    app.locals.sessionClock = () => time;
    app.locals.outboxEncryptionKey = key;
    app.use(express.json());
    app.use(session({ name: 'bandos.sid', secret: 'test-secret', store: new PgStore({ pool: db.pool }),
      resave: false, saveUninitialized: false, cookie: { maxAge: IDLE_MS } }));
    app.use('/api/v1/auth', require('../routes/auth.routes'));
    app.use('/api/v1/users', require('../routes/user.routes'));
    app.use('/api/v1/bands', require('../routes/band.routes'));
    app.use(require('../middleware/errors').notFound);
    app.use(require('../middleware/errors').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    async function request(path, body, cookie, method = 'POST') {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0],
        retry: response.headers.get('retry-after') };
    }
    let serial = 0;
    const details = () => ({ username: `registered${++serial}`, firstName: ' First ', lastName: 'Last',
      email: `person${serial}@example.test`, password: 'Password123!' });
    async function register() {
      // Baseline IP limiter is tested separately below; keep fixtures out of its count.
      const body = details();
      await resetBaseline();
      const result = await request('/auth/register', body);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      const user = result.body.data.user;
      const row = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 ORDER BY notification_id DESC', [user.user_id])).rows[0];
      return { ...result, user, email: body.email, token: decrypt(row.encrypted_security_payload, key).token, row };
    }
    // Invoke route limiter stores directly only for independent fixture setup.
    async function resetBaseline() {
      const router = require('../routes/auth.routes');
      for (const layer of router.stack) {
        if (layer.route?.path === '/register') await layer.route.stack[0].handle.resetKey('127.0.0.1');
      }
    }
    const confirm = (token, cookie) => request('/auth/verification/confirm', { token }, cookie);
    const userRow = async id => (await fixture.query('SELECT * FROM users WHERE user_id=$1', [id])).rows[0];
    async function storedSession(user, overrides = {}) {
      const sid = randomUUID();
      const facts = { cookie: { expires: new Date(Date.now() + IDLE_MS).toISOString(), originalMaxAge: IDLE_MS, httpOnly: true, path: '/' },
        userId: user.user_id, sessionGeneration: user.session_generation, authenticatedAt: new Date(time).toISOString(),
        lastActivityAt: new Date(time).toISOString(), access: 'verification_required', registrationOrigin: true, ...overrides };
      await fixture.query("INSERT INTO session (sid,sess,expire) VALUES ($1,$2,now()+interval '30 days')", [sid, facts]);
      return `bandos.sid=${encodeURIComponent('s:' + signature.sign(sid, 'test-secret'))}`;
    }

    await t.test('atomic registration, encrypted mail and only original bounded continuation', async () => {
      const r = await register();
      assert.equal(r.user.first_name, 'First');
      assert.equal(r.user.email_verified_at, null);
      assert.equal(r.body.data.session.access, 'verification_required');
      assert.equal((await request('/bands', undefined, r.cookie, 'GET')).body.error.code, 'EMAIL_VERIFICATION_REQUIRED');
      const token = (await fixture.query('SELECT * FROM account_tokens WHERE user_id=$1', [r.user.user_id])).rows[0];
      assert.deepEqual(token.token_digest, digest(r.token));
      assert.match(r.token, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(+token.expires_at - +token.issued_at, IDLE_MS);
      assert.ok(!JSON.stringify(r.body).includes(r.token));
      assert.ok(!JSON.stringify(r.row.payload).includes(r.token));
      assert.equal((await request(`/auth/verification/confirm?token=${r.token}`, undefined, r.cookie, 'GET')).status, 404);
      assert.equal((await userRow(r.user.user_id)).email_verified_at, null);
      const later = await request('/auth/login', { email: r.email, password: 'Password123!' });
      time += 60000;
      const verified = await confirm(r.token, r.cookie);
      assert.equal(verified.status, 200);
      assert.equal(verified.body.data.session.access, 'full');
      assert.equal(verified.body.data.session.authenticatedAt, r.body.data.session.authenticatedAt);
      assert.equal(verified.body.data.session.absoluteExpiresAt, r.body.data.session.absoluteExpiresAt);
      assert.equal(Date.parse(verified.body.data.session.idleExpiresAt), time + IDLE_MS);
      assert.notEqual(verified.cookie, r.cookie);
      assert.equal(verified.body.data.user.password_hash, undefined);
      assert.equal((await userRow(r.user.user_id)).session_generation, 2);
      assert.equal((await request('/users/me', undefined, later.cookie, 'GET')).status, 401);
      assert.equal((await request('/users/me', undefined, r.cookie, 'GET')).status, 401);
      assert.equal((await request('/users/me', undefined, verified.cookie, 'GET')).status, 200);
      assert.equal((await confirm(r.token)).body.error.code, 'TOKEN_INVALID_OR_EXPIRED');
    });

    await t.test('absent, idle/absolute expired, mismatched, revoked and later-login sessions never authenticate', async () => {
      const other = await register();
      const otherUser = await userRow(other.user.user_id);
      for (const kind of ['absent', 'idle', 'absolute', 'different', 'later', 'revoked']) {
        time += 3600001; // independent address and issuance IP windows
        const r = await register();
        const user = await userRow(r.user.user_id);
        let cookie;
        if (kind === 'idle') cookie = await storedSession(user, { lastActivityAt: new Date(time - IDLE_MS).toISOString() });
        if (kind === 'absolute') cookie = await storedSession(user, { authenticatedAt: new Date(time - ABSOLUTE_MS).toISOString() });
        if (kind === 'different') cookie = await storedSession(otherUser);
        if (kind === 'later') cookie = (await request('/auth/login', { email: r.email, password: 'Password123!' })).cookie;
        if (kind === 'revoked') cookie = await storedSession(user, { sessionGeneration: 0 });
        const result = await confirm(r.token, cookie);
        assert.equal(result.status, 200, kind);
        assert.equal(result.body.data.user, null, kind);
        assert.equal(result.body.data.session, null, kind);
        assert.ok((await userRow(user.user_id)).email_verified_at);
        if (kind === 'different') {
          const me = await request('/users/me', undefined, result.cookie || cookie, 'GET');
          assert.equal(me.body.data.user.user_id, other.user.user_id);
        }
      }
    });

    await t.test('near absolute deadline promotion renews only within original deadline', async () => {
      time += 3600001;
      const r = await register();
      const cookie = await storedSession(await userRow(r.user.user_id), {
        authenticatedAt: new Date(time - ABSOLUTE_MS + 30000).toISOString() });
      const result = await confirm(r.token, cookie);
      assert.equal(result.status, 200);
      assert.equal(Date.parse(result.body.data.session.idleExpiresAt), time + 30000);
      assert.equal(Date.parse(result.body.data.session.absoluteExpiresAt), time + 30000);
    });

    await t.test('replacement, rejected issuance, wrong purpose, expiry and concurrent consumption', async () => {
      time += 3600001;
      const r = await register();
      let resend = await request('/auth/verification/resend', { email: ` ${r.email.toUpperCase()} ` });
      assert.equal(resend.status, 429);
      assert.equal(resend.retry, '60');
      assert.equal((await fixture.query('SELECT revoked_at FROM account_tokens WHERE token_id=$1', [r.row.token_id])).rows[0].revoked_at, null);
      time += 60000;
      resend = await request('/auth/verification/resend', { email: r.email });
      assert.equal(resend.status, 202);
      const rows = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 ORDER BY notification_id DESC', [r.user.user_id])).rows;
      const newest = decrypt(rows[0].encrypted_security_payload, key).token;
      const invalid = (await confirm(r.token)).body;
      assert.deepEqual((await confirm('unknown')).body, invalid);
      assert.deepEqual((await request('/auth/verification/confirm', {})).body, invalid);
      // A separate purpose cannot be consumed by registration confirmation.
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const user = (await client.query('SELECT * FROM users WHERE user_id=$1 FOR UPDATE', [r.user.user_id])).rows[0];
        await issueToken(client, { user, purpose: 'password_reset', address: user.email, now: time, encryptionKey: key });
        await client.query('COMMIT');
      } finally { client.release(); }
      const wrong = (await fixture.query("SELECT * FROM email_outbox WHERE security_purpose='password_reset' ORDER BY notification_id DESC LIMIT 1")).rows[0];
      assert.deepEqual((await confirm(decrypt(wrong.encrypted_security_payload, key).token)).body, invalid);
      const results = await Promise.all([confirm(newest), confirm(newest)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      time += 3600001;
      const expired = await register();
      time += IDLE_MS;
      assert.deepEqual((await confirm(expired.token)).body, invalid);
      // Fake provider sees only current mail, never replaced/consumed/expired links.
      const sent = [];
      const dispatcher = createDispatcher({ pool: db.pool, adapter: { send: async payload => { sent.push(payload); return { status: 'accepted', id: 'fake' }; } },
        origin: process.env.CLIENT_ORIGIN, from: 'bandos@example.test', encryptionKey: key, clock: () => time });
      while (await dispatcher.dispatchOne()) {}
      assert.ok(!sent.some(mail => mail.text.includes(r.token) || mail.text.includes(newest) || mail.text.includes(expired.token)));
      const fresh = await register();
      while (await dispatcher.dispatchOne()) {}
      assert.ok(sent.some(mail => mail.text.includes(`/verify-email?token=${fresh.token}`)));
      const cleaned = (await fixture.query('SELECT encrypted_security_payload FROM email_outbox WHERE notification_id=$1', [fresh.row.notification_id])).rows[0];
      assert.equal(cleaned.encrypted_security_payload, null);
    });

    await t.test('known and unknown address cooldown/hourly patterns match and are shared across purposes', async () => {
      time += 3600001;
      const r = await register();
      const unknown = 'unknown@example.test';
      assert.equal((await request('/auth/verification/resend', { email: unknown })).status, 202);
      for (let n = 1; n <= 5; n++) {
        for (const email of [r.email, unknown]) {
          const blocked = await request('/auth/verification/resend', { email });
          assert.equal(blocked.status, 429);
          assert.equal(blocked.retry, n === 5 ? '3360' : '60');
        }
        if (n < 5) {
          time += 60000;
          for (const email of [r.email, unknown]) assert.equal((await request('/auth/verification/resend', { email })).status, 202);
        }
      }
      // The same helper is used by subsequent reset/email-change endpoints.
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await assert.rejects(accountIssuance(client, { email: r.email, ip: 'different-ip', now: time }), { status: 429 });
        await client.query('ROLLBACK');
      } finally { client.release(); }
      time += 3600001;
      for (let n = 0; n < 20; n++) assert.equal((await request('/auth/verification/resend', { email: `unknown${n}@example.test` })).status, 202);
      const ipBlocked = await request('/auth/verification/resend', { email: 'extra@example.test' });
      assert.equal(ipBlocked.status, 429);
      assert.equal(ipBlocked.retry, '3600');
    });

    await t.test('failed registration/replacement roll back and registration resend cannot issue email-change credentials', async () => {
      time += 3600001;
      const body = details();
      await resetBaseline();
      app.locals.outboxEncryptionKey = null;
      const unavailable = await request('/auth/register', body);
      assert.equal(unavailable.status, 503);
      assert.equal((await fixture.query('SELECT * FROM users WHERE email=$1', [body.email])).rowCount, 0);
      for (const email of [body.email, 'missing@example.test']) {
        assert.equal((await request('/auth/verification/resend', { email })).status, 503);
      }
      app.locals.outboxEncryptionKey = key;
      const r = await register();
      time += 60000;
      // Encryption failure occurs after replacement revocation; the transaction must restore it.
      app.locals.outboxEncryptionKey = Buffer.alloc(1);
      const oldError = console.error;
      console.error = () => {};
      try { assert.equal((await request('/auth/verification/resend', { email: r.email })).status, 500); }
      finally { console.error = oldError; app.locals.outboxEncryptionKey = key; }
      const current = (await fixture.query('SELECT * FROM account_tokens WHERE token_id=$1', [r.row.token_id])).rows[0];
      assert.equal(current.revoked_at, null);
      assert.equal((await fixture.query('SELECT * FROM account_tokens WHERE user_id=$1', [r.user.user_id])).rowCount, 1);
      await fixture.query('UPDATE users SET pending_email=$2 WHERE user_id=$1', [r.user.user_id, 'pending@example.test']);
      const issued = await Promise.all([
        request('/auth/verification/resend', { email: r.email }),
        request('/auth/verification/resend', { email: r.email }),
      ]);
      assert.deepEqual(issued.map(result => result.status).sort(), [202, 429]);
      assert.equal((await fixture.query("SELECT * FROM account_tokens WHERE user_id=$1 AND purpose='email_change'", [r.user.user_id])).rowCount, 0);
      assert.equal((await request('/auth/verification/resend', { email: 'pending@example.test' })).status, 202);
      assert.equal((await fixture.query("SELECT * FROM email_outbox WHERE security_recipient_address='pending@example.test'")).rowCount, 0);
    });

    await t.test('failed confirm limit counts failures only, with generic responses and Retry-After', async () => {
      time += 3600001;
      const r = await register();
      for (let n = 0; n < 10; n++) assert.equal((await confirm(`invalid${n}`)).status, 400);
      const blocked = await confirm(r.token);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.retry, '900');
      time += 900000;
      assert.equal((await confirm(r.token)).status, 200);
    });

    await t.test('UTF-8 password bounds, strict fields, no trimming and registration/login baselines', async () => {
      time += 3600001;
      await resetBaseline();
      for (const password of ['short', 'é'.repeat(37)]) {
        const result = await request('/auth/register', { ...details(), password });
        assert.equal(result.status, 400);
        assert.equal(result.body.error.details[0].field, 'password');
      }
      const body = { ...details(), password: 'é'.repeat(35) + '  ' };
      const accepted = await request('/auth/register', body);
      assert.equal(accepted.status, 201);
      assert.equal((await request('/auth/login', { email: body.email, password: body.password })).status, 200);
      assert.equal((await request('/auth/login', { email: body.email, password: body.password.trim() })).status, 401);
      assert.equal((await request('/auth/register', { ...details(), extra: true })).status, 400);
      assert.equal((await request('/auth/register', { ...details(), password: 'x' })).status, 400);
      assert.equal((await request('/auth/register', details())).status, 429);
      for (let n = 0; n < 10; n++) await request('/auth/login', { email: 'none@example.test', password: 'wrong' });
      assert.equal((await request('/auth/login', { email: body.email, password: body.password })).status, 429);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
