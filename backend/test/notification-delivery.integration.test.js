const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');
const express = require('express');
const session = require('express-session');
const { once } = require('node:events');

const adminUrl = process.env.TEST_PG_ADMIN_URL;
assert.ok(adminUrl, 'TEST_PG_ADMIN_URL must identify a disposable PostgreSQL server');

test('preferences and recoverable notification delivery on PostgreSQL', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_mail_${randomUUID().replaceAll('-', '')}`;
  let fixture, db, server;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    await fixture.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));
    Object.assign(process.env, { NODE_ENV: 'test', CLIENT_ORIGIN: 'http://client.example.test', SESSION_SECRET: 'disposable',
      DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database,
      DB_USERNAME: decodeURIComponent(url.username), DB_PASSWORD: decodeURIComponent(url.password), DB_SSL: 'false' });
    delete process.env.DB_SSL_CA_FILE;
    db = require('../db');
    const { enqueueNotification, createDispatcher, RETRY_OFFSETS, SAFE_WINDOW } = require('../utils/notification-outbox');
    const { encrypt, decrypt } = require('../utils/notification-mail');
    const { preferenceColumns } = require('../utils/notification-preferences');
    const key = randomBytes(32);
    let time = Date.now() + 10000;
    const users = (await fixture.query(`INSERT INTO users (username,first_name,last_name,email,password_hash,email_verified_at)
      SELECT 'user'||n,'First','Last',n||'@example.test','hash',now() FROM generate_series(1,3) n RETURNING *`)).rows;
    const userId = users[0].user_id;
    const calls = [];
    let provider = async () => ({ status: 'accepted', id: 'provider-id' });
    const adapter = { send: async (payload, providerKey) => {
      calls.push({ payload, providerKey });
      return provider(payload, providerKey);
    } };
    const worker = () => createDispatcher({ pool: db.pool, adapter, origin: process.env.CLIENT_ORIGIN, from: 'bandos@example.test',
      encryptionKey: key, clock: () => time, random: () => 0 });
    let dispatcher = worker();
    const payload = { subject: 'Invitation', text: '<script>private & text</script>', path: '/bands/1?event=2' };
    const effect = (extra = {}) => ({ transitionId: randomUUID(), kind: 'invitation', recipientIdentity: String(userId),
      recipientUserId: userId, category: 'invitations', payload, ...extra });
    const enqueue = (extra = {}) => enqueueNotification(fixture, effect(extra), key);
    const row = async id => (await fixture.query('SELECT * FROM email_outbox WHERE notification_id=$1', [id])).rows[0];
    const reset = async () => {
      time = Date.now() + 10000;
      calls.length = 0;
      provider = async () => ({ status: 'accepted', id: 'provider-id' });
      await fixture.query('DELETE FROM email_outbox');
      await fixture.query('DELETE FROM notification_preferences');
    };

    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'disposable-http', resave: false, saveUninitialized: false }));
    app.post('/login-fixture', (req, res) => {
      Object.assign(req.session, { userId: req.body.userId || userId, sessionGeneration: 1,
        authenticatedAt: new Date(time).toISOString(), lastActivityAt: new Date(time).toISOString(), access: 'full' });
      res.json({});
    });
    app.locals.sessionClock = () => time;
    app.use('/api/v1/users', require('../routes/user.routes'));
    app.use(require('../middleware/errors').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login-fixture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    async function request(method, body, sessionCookie = cookie) {
      const response = await fetch(`${base}/api/v1/users/me/notification-preferences`, { method,
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }

    await t.test('HTTP defaults, master/category preservation, stale/no-op and strict validation', async () => {
      const defaults = (await request('GET')).body.data.preferences;
      assert.deepEqual(defaults, { version: 1, ...Object.fromEntries(Object.keys(preferenceColumns).map(k => [k, true])) });
      const { version, ...booleans } = defaults;
      let write = { expectedVersion: version, ...booleans, enabled: false, pollResponses: false };
      const saved = await request('PUT', write);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.preferences.version, 2);
      assert.equal(saved.body.data.preferences.pollResponses, false);
      assert.equal((await request('PUT', write)).body.error.code, 'STALE_VERSION');
      write.expectedVersion = 2;
      assert.deepEqual(await request('PUT', write), saved);
      const enabled = await request('PUT', { ...write, enabled: true });
      assert.equal(enabled.body.data.preferences.pollResponses, false);
      for (const invalid of [{ ...write, enabled: 'false' }, { ...write, extra: true }, { expectedVersion: 3 }]) {
        assert.equal((await request('PUT', invalid)).status, 400);
      }
      assert.equal((await request('GET', null, '')).status, 401);
      assert.equal((await fixture.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n, 0);
      assert.equal((await fixture.query('SELECT version FROM users WHERE user_id=$1', [userId])).rows[0].version, 1);
    });

    await t.test('every category and master opt-out suppress terminally; defaults send and former members receive removal', async () => {
      for (const [category, column] of Object.entries(preferenceColumns).filter(([k]) => k !== 'enabled')) {
        for (const master of [true, false]) {
          await reset();
          await fixture.query(`INSERT INTO notification_preferences (user_id,enabled,${column}) VALUES ($1,$2,$3)`, [userId, master, !master]);
          const id = await enqueue({ category });
          await dispatcher.dispatchOne();
          assert.equal((await row(id)).state, 'suppressed');
          assert.equal(calls.length, 0);
          await fixture.query('DELETE FROM notification_preferences');
          assert.equal(await dispatcher.dispatchOne(), false);
        }
        await reset();
        const id = await enqueue({ category });
        await dispatcher.dispatchOne();
        assert.equal((await row(id)).state, 'sent');
      }
      assert.equal((await fixture.query('SELECT * FROM user_bands WHERE user_id=$1', [userId])).rowCount, 0);
      assert.ok(calls[0].payload.html.includes('&lt;script&gt;private &amp; text&lt;/script&gt;'));
      assert.ok(calls[0].payload.html.includes('http://client.example.test/bands/1?event=2'));
    });

    await t.test('enqueue uniqueness, rollback and provider outage leave committed success durable', async () => {
      await reset();
      const value = effect();
      await fixture.query('BEGIN');
      const id = await enqueueNotification(fixture, value, key);
      assert.equal(await enqueueNotification(fixture, value, key), undefined);
      assert.equal(await dispatcher.dispatchOne(), false, 'uncommitted effect is invisible');
      await fixture.query('ROLLBACK');
      assert.equal(await row(id), undefined);
      const committed = await enqueue();
      provider = async () => { throw new Error('private provider secret'); };
      await dispatcher.dispatchOne();
      assert.equal((await row(committed)).state, 'retryable');
      assert.equal((await row(committed)).last_error_class, 'provider_transient');
    });

    await t.test('leader transfer redirects queued mail, active checks do not require membership', async () => {
      await reset();
      await fixture.query('BEGIN');
      const band = (await fixture.query(`INSERT INTO bands (name,owner_user_id) VALUES ('Band',$1) RETURNING band_id`, [userId])).rows[0];
      await fixture.query(`INSERT INTO user_bands (band_id,user_id,role) VALUES ($1,$2,'leader'),($1,$3,'member')`, [band.band_id, userId, users[1].user_id]);
      await fixture.query('COMMIT');
      const id = await enqueue({ recipientUserId: undefined, recipientBandId: band.band_id, recipientIdentity: `leader:${band.band_id}`, category: 'pollResponses' });
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$1 WHERE band_id=$2', [users[1].user_id, band.band_id]);
      await fixture.query(`UPDATE user_bands SET role=CASE WHEN user_id=$1 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$2`, [users[1].user_id, band.band_id]);
      await fixture.query('COMMIT');
      await dispatcher.dispatchOne();
      assert.equal((await row(id)).frozen_recipient_address, users[1].email);
      await fixture.query('UPDATE users SET is_active=false WHERE user_id=$1', [users[2].user_id]);
      const inactive = await enqueue({ recipientUserId: users[2].user_id });
      await dispatcher.dispatchOne();
      assert.equal((await row(inactive)).state, 'suppressed');
    });

    await t.test('frozen payload/key survive retries, lease recovery, preference and address changes', async () => {
      await reset();
      const id = await enqueue();
      provider = async () => ({ status: 'transient' });
      await dispatcher.dispatchOne();
      const first = await row(id);
      assert.equal(first.provider_key, `bandos-notification/${id}`);
      assert.equal(first.request_fingerprint.length, 32);
      await fixture.query(`UPDATE users SET email='changed@example.test' WHERE user_id=$1`, [userId]);
      await fixture.query('INSERT INTO notification_preferences (user_id,enabled) VALUES ($1,false)', [userId]);
      // Simulate process loss after durable claim, before recording provider result.
      await fixture.query(`UPDATE email_outbox SET state='sending',lease_owner='lost-worker',lease_expires_at=$2 WHERE notification_id=$1`, [id, new Date(time + 60000)]);
      assert.equal(await worker().dispatchOne(), false);
      time = +first.next_attempt_at;
      dispatcher = worker();
      provider = async () => ({ status: 'accepted', id: 'recovered-id' });
      await Promise.all([dispatcher.dispatchOne(), worker().dispatchOne()]);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0], calls[1]);
      assert.equal((await row(id)).provider_id, 'recovered-id');
      assert.equal((await row(id)).attempt_count, 2);
      // Late completion cannot overwrite a reclaimed lease's result.
      await fixture.query(`UPDATE email_outbox SET state='failed' WHERE notification_id=$1 AND lease_owner='lost-worker'`, [id]);
      assert.equal((await row(id)).state, 'sent');
      await fixture.query('UPDATE users SET email=$2 WHERE user_id=$1', [userId, users[0].email]);
    });

    await t.test('multiple dispatchers hold one lease while provider request is in flight', async () => {
      await reset();
      const id = await enqueue();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let entered;
      const ready = new Promise(resolve => { entered = resolve; });
      provider = async () => { entered(); await gate; return { status: 'accepted', id: 'once' }; };
      const sending = dispatcher.dispatchOne();
      await ready;
      assert.equal(await worker().dispatchOne(), false);
      release();
      await sending;
      assert.equal(calls.length, 1);
      assert.equal((await row(id)).state, 'sent');
    });

    await t.test('retry offsets are bounded; permanent failure and unknown delivery never blindly resend', async () => {
      await reset();
      const id = await enqueue();
      provider = async () => ({ status: 'transient' });
      const firstTime = time;
      for (let attempt = 0; attempt < RETRY_OFFSETS.length; attempt++) {
        time = firstTime + RETRY_OFFSETS[attempt];
        assert.equal(await dispatcher.dispatchOne(), true);
      }
      assert.equal((await row(id)).state, 'delivery_unknown');
      assert.equal(calls.length, 7);
      time = firstTime + 25 * 3600000;
      assert.equal(await dispatcher.dispatchOne(), false);
      await reset();
      const expired = await enqueue();
      provider = async () => ({ status: 'transient' });
      await dispatcher.dispatchOne();
      time += SAFE_WINDOW;
      await dispatcher.dispatchOne();
      assert.equal((await row(expired)).state, 'delivery_unknown');
      assert.equal(calls.length, 1);
      await reset();
      provider = async () => ({ status: 'transient', retryAt: time + SAFE_WINDOW });
      const beyond = await enqueue();
      await dispatcher.dispatchOne();
      assert.equal((await row(beyond)).state, 'delivery_unknown');
      await reset();
      provider = async () => ({ status: 'permanent' });
      const invalid = await enqueue();
      await dispatcher.dispatchOne();
      assert.equal((await row(invalid)).state, 'failed');
    });

    await t.test('security bypass, obsolete-token suppression, encrypted frozen retries and expiry clearing', async () => {
      const rawToken = 'private-token-should-never-be-plaintext';
      async function security() {
        const token = (await fixture.query(`INSERT INTO account_tokens (user_id,purpose,token_digest,expires_at)
          VALUES ($1,'password_reset',$2,$3) RETURNING token_id`, [userId, createHash('sha256').update(randomUUID()).digest(), new Date(time + 30 * 60000)])).rows[0];
        const id = await enqueue({ category: undefined, securityPurpose: 'password_reset', securityAddress: users[0].email,
          tokenId: token.token_id, token: rawToken, tokenExpiresAt: new Date(time + 30 * 60000), payload: { ...payload, path: '/reset-password' } });
        return { id, tokenId: token.token_id };
      }
      for (const obsolete of ['consumed_at', 'revoked_at', 'expires_at', 'deleted']) {
        await reset();
        const { id, tokenId } = await security();
        if (obsolete === 'expires_at') time += 30 * 60000;
        else if (obsolete === 'deleted') await fixture.query('DELETE FROM account_tokens WHERE token_id=$1', [tokenId]);
        else await fixture.query(`UPDATE account_tokens SET ${obsolete}=now() WHERE token_id=$1`, [tokenId]);
        await dispatcher.dispatchOne();
        assert.equal((await row(id)).state, 'suppressed');
        assert.equal((await row(id)).encrypted_security_payload, null);
        assert.equal(calls.length, 0);
      }
      await reset();
      await fixture.query('INSERT INTO notification_preferences (user_id,enabled) VALUES ($1,false)', [userId]);
      const { id } = await security();
      const initial = await row(id);
      assert.equal(decrypt(initial.encrypted_security_payload, key).token, rawToken);
      assert.ok(!JSON.stringify(initial).includes(rawToken));
      const tampered = Buffer.from(initial.encrypted_security_payload);
      tampered[30] ^= 1;
      assert.throws(() => decrypt(tampered, key));
      assert.notDeepEqual(encrypt({ token: rawToken }, key), initial.encrypted_security_payload);
      provider = async () => ({ status: 'transient' });
      await dispatcher.dispatchOne();
      const attempted = await row(id);
      assert.ok(!JSON.stringify(attempted).includes(rawToken));
      assert.ok(decrypt(attempted.encrypted_security_payload, key).request.text.includes(rawToken));
      time = +attempted.next_attempt_at;
      provider = async () => ({ status: 'accepted', id: 'security-id' });
      await dispatcher.dispatchOne();
      assert.deepEqual(calls[0], calls[1]);
      const sent = await row(id);
      assert.equal(sent.state, 'sent');
      assert.equal(sent.encrypted_security_payload, null);
      assert.equal(sent.frozen_payload, null);
      await reset();
      const expiring = await security();
      provider = async () => ({ status: 'transient', retryAt: time + 2 * 3600000 });
      await dispatcher.dispatchOne();
      time += 30 * 60000;
      await dispatcher.dispatchOne();
      assert.equal((await row(expiring.id)).state, 'delivery_unknown');
      assert.equal((await row(expiring.id)).encrypted_security_payload, null);
      assert.equal(calls.length, 1);
    });

    await t.test('untrusted links fail locally without provider calls or secret persistence', async () => {
      for (const path of ['//evil.test/reset', '/\\evil.test/reset', 'https://evil.test/reset']) {
        await reset();
        const id = await enqueue({ payload: { ...payload, path } });
        await dispatcher.dispatchOne();
        assert.equal((await row(id)).state, 'failed');
        assert.equal(calls.length, 0);
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
