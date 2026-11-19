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

test('profile edits and verified email changes', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_email_${randomUUID().replaceAll('-', '')}`;
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
    const { digest } = require('../utils/account-tokens');
    const { IDLE_MS } = require('../utils/account-session');
    const bcrypt = require('bcrypt');
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
    const initiate = (user, cookie, email, overrides = {}, intentKey) => request('/users/me/email-change', {
      expectedVersion: user.version, currentPassword: originalPassword, newEmail: email, ...overrides,
    }, cookie, 'POST', intentKey);
    const confirm = (token, cookie) => request('/auth/email-change/confirm', { token }, cookie);
    const resend = (cookie, intentKey) => request('/users/me/email-change/resend', {}, cookie, 'POST', intentKey);
    async function latestToken(user, purpose = 'email_change') {
      const row = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 AND security_purpose=$2 ORDER BY notification_id DESC', [user.user_id, purpose])).rows[0];
      return { row, token: decrypt(row.encrypted_security_payload, key).token };
    }
    const effects = async user => (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 ORDER BY notification_id', [user.user_id])).rows;
    const getMe = cookie => request('/users/me', undefined, cookie, 'GET');

    await t.test('profile strict subset, bounds, versions, no-op and exact retry behavior', async () => {
      const user = await account(), { cookie } = await storedSession(user);
      const patch = (body, intentKey) => request('/users/me', { expectedVersion: user.version, ...body }, cookie, 'PATCH', intentKey);
      for (const fields of [{}, { email: 'no@example.test' }, { password: 'bad' }, { username: 'ab' },
        { firstName: ' ' }, { lastName: 'x'.repeat(51) }, { username: null }, { extra: true }]) {
        assert.equal((await patch(fields)).status, 400);
      }
      const noOp = await patch({ firstName: ' First ' });
      assert.equal(noOp.body.data.user.version, user.version);
      const intentKey = randomUUID(), body = { username: ' updated ', lastName: ' Name ' };
      const saved = await patch(body, intentKey);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.user.username, 'updated');
      assert.equal(saved.body.data.user.last_name, 'Name');
      assert.equal(saved.body.data.user.version, user.version + 1);
      assert.deepEqual((await patch(body, intentKey)).body, saved.body);
      assert.equal((await patch({ ...body, username: 'updated' }, intentKey)).body.error.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal((await patch({ firstName: 'New' })).body.error.code, 'STALE_VERSION');
      assert.equal((await effects(user)).length, 0);
      assert.ok(!/password|token|session_generation/.test(JSON.stringify(saved.body)));
      const other = await account();
      assert.equal((await request('/users/me', { expectedVersion: saved.body.data.user.version, username: other.username }, cookie, 'PATCH')).body.error.code, 'ACCOUNT_CONFLICT');
      const restricted = await storedSession(await account({ verified: false }));
      assert.equal((await request('/users/me', { expectedVersion: 1, firstName: 'New' }, restricted.cookie, 'PATCH')).status, 403);
    });

    await t.test('password errors, conflicts, stale writes and rejected issuance preserve session and state', async () => {
      time += 3600001;
      const user = await account(), other = await account(), { cookie } = await storedSession(user);
      const wrong = await initiate(user, cookie, 'target@example.test', { currentPassword: 'wrong' });
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, 'CURRENT_PASSWORD_INCORRECT');
      assert.equal(wrong.body.error.details[0].field, 'currentPassword');
      assert.equal((await getMe(cookie)).status, 200);
      assert.equal((await initiate(user, cookie, other.email)).body.error.code, 'ACCOUNT_CONFLICT');
      assert.equal((await initiate(user, cookie, 'target@example.test', { expectedVersion: 99 })).body.error.code, 'STALE_VERSION');
      assert.equal((await resend(cookie)).status, 400);
      assert.equal((await request('/users/me/email-change/resend', { email: other.email }, cookie)).status, 400);
      assert.equal((await request('/auth/password/forgot', { email: 'target@example.test' })).status, 202);
      const limited = await initiate(user, cookie, ' TARGET@example.test ');
      assert.equal(limited.status, 429);
      assert.equal(limited.retry, '60');
      assert.equal((await userRow(user.user_id)).pending_email, null);
      assert.equal((await effects(user)).length, 0);
      app.locals.outboxEncryptionKey = Buffer.alloc(1);
      const log = console.error; console.error = () => {};
      try { assert.equal((await initiate(user, cookie, 'rollback@example.test')).status, 500); }
      finally { console.error = log; app.locals.outboxEncryptionKey = key; }
      assert.equal((await userRow(user.user_id)).version, user.version);
      assert.equal((await effects(user)).length, 0);
      assert.equal((await fixture.query("SELECT * FROM account_token_attempts WHERE rate_key='address:rollback@example.test'")).rowCount, 0);
    });

    await t.test('pending address preserves login and ordinary delivery; replacement and resend are newest-only and retry-safe', async () => {
      time += 3600001;
      const user = await account(), { cookie } = await storedSession(user), intentKey = randomUUID();
      const target = 'new-address@example.test';
      const first = await initiate(user, cookie, ` ${target.toUpperCase()} `, {}, intentKey);
      assert.equal(first.status, 202);
      assert.equal(first.body.data.user.email, user.email);
      assert.equal(first.body.data.user.pending_email, target);
      assert.equal(first.body.data.user.version, user.version + 1);
      assert.ok(!/password|token|session_generation/.test(JSON.stringify(first.body)));
      assert.deepEqual((await initiate(user, cookie, ` ${target.toUpperCase()} `, {}, intentKey)).body, first.body);
      const issued = await latestToken(user);
      assert.equal((await effects(user)).length, 2);
      const tokenRow = (await fixture.query('SELECT * FROM account_tokens WHERE token_id=$1', [issued.row.token_id])).rows[0];
      assert.deepEqual(tokenRow.token_digest, digest(issued.token));
      assert.equal(+tokenRow.expires_at - +tokenRow.issued_at, 86400000);
      assert.equal((await request('/auth/login', { email: target, password: originalPassword })).status, 401);
      assert.equal((await request('/auth/login', { email: user.email, password: originalPassword })).status, 200);
      const { enqueueNotification } = require('../utils/notification-outbox');
      await enqueueNotification(fixture, { transitionId: randomUUID(), kind: 'test_ordinary', category: 'invitations',
        recipientUserId: user.user_id, recipientIdentity: String(user.user_id), payload: { subject: 'Ordinary', text: 'Hello', path: '/' } });
      const sent = [];
      const dispatcher = createDispatcher({ pool: db.pool, encryptionKey: key, origin: 'https://app.example.test',
        from: 'bandOS <sender@example.test>', clock: () => time, adapter: { send: async mail => { sent.push(mail); return { status: 'accepted', id: 'fake' }; } } });
      for (let n = 0; n < 100 && await dispatcher.dispatchOne(); n++) {}
      assert.deepEqual(sent.filter(mail => mail.subject === 'Ordinary').flatMap(mail => mail.to), [user.email]);
      const current = first.body.data.user;
      const count = (await effects(user)).length;
      assert.equal((await initiate(current, cookie, target)).body.data.user.version, current.version);
      assert.equal((await effects(user)).length, count);
      assert.equal((await resend(cookie)).status, 429);
      const replacement = await initiate(current, cookie, 'replacement@example.test');
      assert.equal(replacement.status, 202);
      const replaced = await latestToken(user);
      assert.equal((await confirm(issued.token)).body.error.code, 'TOKEN_INVALID_OR_EXPIRED');
      assert.equal((await resend(cookie)).status, 429);
      assert.equal((await fixture.query('SELECT revoked_at FROM account_tokens WHERE token_id=$1', [replaced.row.token_id])).rows[0].revoked_at, null);
      time += 60000;
      const resendKey = randomUUID();
      const resent = await resend(cookie, resendKey);
      assert.deepEqual(resent.body, { data: { message: 'A verification email has been queued for your pending address' } });
      const newest = await latestToken(user);
      assert.equal(newest.row.security_recipient_address, 'replacement@example.test');
      assert.deepEqual((await resend(cookie, resendKey)).body, resent.body);
      assert.equal((await latestToken(user)).token, newest.token);
      assert.equal((await confirm(replaced.token)).status, 400);
      assert.equal((await request('/auth/verification/resend', { email: 'replacement@example.test' })).status, 429);
      assert.equal((await userRow(user.user_id)).email, user.email);
    });

    await t.test('confirmation atomically swaps email, revokes every session and reset/change credential, and bypasses opt-outs', async () => {
      time += 3600001;
      const user = await account(), a = await storedSession(user), b = await storedSession(user);
      await fixture.query(`INSERT INTO notification_preferences (user_id,enabled) VALUES ($1,false)
        ON CONFLICT (user_id) DO UPDATE SET enabled=false`, [user.user_id]);
      assert.equal((await request('/auth/password/forgot', { email: user.email })).status, 202);
      const reset = await latestToken(user, 'password_reset');
      const target = 'confirmed@example.test';
      assert.equal((await initiate(user, a.cookie, target)).status, 202);
      const issued = await latestToken(user);
      const result = await confirm(issued.token, a.cookie);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { data: { message: 'Email address updated; please log in again' } });
      assert.ok(result.cookie.includes('bandos.sid='));
      const changed = await userRow(user.user_id);
      assert.equal(changed.email, target);
      assert.equal(changed.pending_email, null);
      assert.equal(changed.version, user.version + 2);
      assert.equal(changed.session_generation, user.session_generation + 1);
      assert.equal((await getMe(a.cookie)).status, 401);
      assert.equal((await getMe(b.cookie)).status, 401);
      assert.equal((await fixture.query("SELECT * FROM session WHERE sess->>'userId'=$1", [String(user.user_id)])).rowCount, 0);
      assert.equal((await request('/auth/login', { email: user.email, password: originalPassword })).status, 401);
      assert.equal((await request('/auth/login', { email: target, password: originalPassword })).status, 200);
      assert.equal((await confirm(issued.token)).status, 400);
      assert.equal((await request('/auth/password/reset', { token: reset.token, newPassword })).status, 400);
      const count = (await effects(user)).length;
      const sent = [];
      const dispatcher = createDispatcher({ pool: db.pool, encryptionKey: key, origin: 'https://app.example.test',
        from: 'bandOS <sender@example.test>', clock: () => time, adapter: { send: async mail => { sent.push(mail); return { status: 'accepted', id: 'fake' }; } } });
      for (let n = 0; n < 100 && await dispatcher.dispatchOne(); n++) {}
      const notices = (await effects(user)).filter(row => row.security_purpose === 'email_change_notice');
      assert.equal(notices.length, 3);
      assert.ok(notices.every(row => row.state === 'sent'));
      assert.deepEqual(notices.map(row => row.security_recipient_address).sort(), [user.email, user.email, target].sort());
      assert.equal((await effects(user)).length, count);
    });

    await t.test('concurrent claims allow one winner, preserve loser active address and leave no confirmation effects', async () => {
      time += 3600001;
      const a = await account(), b = await account(), target = 'race@example.test';
      const sa = await storedSession(a), sb = await storedSession(b);
      assert.equal((await initiate(a, sa.cookie, target)).status, 202);
      const ta = await latestToken(a);
      time += 60000;
      assert.equal((await initiate(b, sb.cookie, target)).status, 202);
      const tb = await latestToken(b);
      const results = await Promise.all([confirm(ta.token), confirm(tb.token)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(results.find(r => r.status === 409).body.error.code, 'ACCOUNT_CONFLICT');
      const loser = results[0].status === 409 ? a : b;
      const unchanged = await userRow(loser.user_id);
      assert.equal(unchanged.email, loser.email);
      assert.equal(unchanged.pending_email, target);
      assert.equal(unchanged.session_generation, loser.session_generation);
      assert.equal((await effects(loser)).length, 2);
      const winnerToken = results[0].status === 200 ? ta : tb;
      assert.equal((await confirm(winnerToken.token)).status, 400);
    });

    await t.test('concurrent confirmation of one token commits one transition and notice pair', async () => {
      time += 3600001;
      const user = await account(), { cookie } = await storedSession(user);
      await initiate(user, cookie, 'single-use@example.test');
      const issued = await latestToken(user);
      const results = await Promise.all([confirm(issued.token), confirm(issued.token)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      assert.equal((await userRow(user.user_id)).version, user.version + 2);
      assert.equal((await effects(user)).length, 4);
    });

    await t.test('wrong-purpose, exact expiry and submission throttles have no account/mail effects', async () => {
      time += 3600001;
      const user = await account(), { cookie } = await storedSession(user);
      assert.equal((await initiate(user, cookie, 'expiry@example.test')).status, 202);
      const issued = await latestToken(user);
      const before = await userRow(user.user_id), count = (await effects(user)).length;
      assert.equal((await request('/auth/verification/confirm', { token: issued.token })).status, 400);
      assert.equal((await request('/auth/password/reset', { token: issued.token, newPassword })).status, 400);
      time += 86400000;
      const expired = await confirm(issued.token);
      assert.equal(expired.status, 400);
      for (let n = 0; n < 9; n++) assert.deepEqual((await confirm('missing')).body, expired.body);
      const limited = await confirm(issued.token);
      assert.equal(limited.status, 429);
      assert.equal(limited.retry, '900');
      assert.deepEqual(await userRow(user.user_id), before);
      assert.equal((await effects(user)).length, count);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
