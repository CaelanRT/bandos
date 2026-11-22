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

test('atomic account deactivation', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_deactivation_${randomUUID().replaceAll('-', '')}`;
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
    const { IDLE_MS } = require('../utils/account-session');
    const bcrypt = require('bcrypt');
    const key = randomBytes(32);
    let time = Date.UTC(2030, 10, 20, 12);
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
    app.use('/api/v1/instruments', require('../routes/instrument.routes'));
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
    async function setup(existingMember) {
      time = Date.UTC(2030, 10, 20, 12);
      const leader = await account(), member = existingMember || await account(), other = await account();
      const cookie = (await storedSession(leader)).cookie, memberCookie = (await storedSession(member)).cookie;
      let band = (await request('/bands', { name: 'Lifecycle', leaderInstrumentIds: [2],
        instrumentation: [{ instrumentId: 2, label: 'Guitar' }] }, cookie)).body.data.band;
      const root = `/bands/${band.bandId}`, instrumentId = band.instrumentation[0].instrumentId;
      for (const user of [member, other]) band = (await request(`${root}/members`, {
        username: user.username, instrumentIds: [instrumentId], expectedVersion: band.version }, cookie)).body.data.band;
      const slots = users => users.map(user => ({ clientKey: randomUUID(), instrumentId, label: 'Guitar', userId: user.user_id }));
      async function event(users = [member], status = 'pending', start = '2030-11-21T18:00:00Z') {
        const result = await request(`${root}/events`, { name: 'Rehearsal', type: 'rehearsal', date: '2030-11-21',
          startTime: '18:00', endTime: '20:00', timezone: 'UTC', location: 'Hall', hideFromUninvited: false,
          templateVersion: band.version, slots: slots(users) }, cookie);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        const saved = result.body.data.event;
        await fixture.query('UPDATE events SET starts_at=$2,ends_at=$2::timestamptz+interval \'2 hours\' WHERE event_id=$1', [saved.eventId, start]);
        await fixture.query('UPDATE event_invitations SET status=$2 WHERE event_id=$1', [saved.eventId, status]);
        return saved;
      }
      async function poll(users = [member], closed = false) {
        const result = await request(`${root}/polls`, { name: 'Poll', timezone: 'UTC', location: 'Hall',
          hideFromUninvited: false, templateVersion: band.version, slots: slots(users),
          options: [{ clientKey: randomUUID(), date: '2030-11-21', startTime: '18:00', endTime: '20:00' }] }, cookie);
        assert.equal(result.status, 201, JSON.stringify(result.body));
        let saved = result.body.data.poll;
        if (users.includes(member)) {
          const response = await request(`${root}/polls/${saved.pollId}/availability`, { expectedVersion: saved.version,
            expectedVoteVersion: 0, answers: saved.options.map(o => ({ optionId: o.optionId, optionRevision: o.revision, answer: 'yes' })) }, memberCookie, 'PUT');
          assert.equal(response.status, 200, JSON.stringify(response.body));
          saved = response.body.data.poll;
        }
        if (closed) {
          const response = await request(`${root}/polls/${saved.pollId}/finalize`, { expectedVersion: saved.version,
            optionId: saved.options[0].optionId, optionRevision: saved.options[0].revision }, cookie);
          assert.equal(response.status, 200, JSON.stringify(response.body));
          saved = response.body.data.poll;
        }
        return saved;
      }
      const detail = async (who = cookie) => request(root, undefined, who, 'GET');
      const remove = (user = member, version = band.version, who = cookie, key) => request(`${root}/members/${user.user_id}`,
        { expectedVersion: version }, who, 'DELETE', key);
      const transfer = (user = member, who = cookie, version = band.version, key) => request(`${root}/ownership`,
        { userId: user.user_id, expectedVersion: version }, who, 'POST', key);
      return { leader, member, cookie, memberCookie, band, root, event, poll, detail, remove, transfer };
    }

    const deactivate = (user, cookie, body = {}, intentKey) => request('/users/me', {
      expectedVersion: user.version, password: originalPassword, ...body,
    }, cookie, 'DELETE', intentKey);
    const userRow = async user => (await fixture.query('SELECT * FROM users WHERE user_id=$1', [user.user_id])).rows[0];
    async function state(user) {
      const result = {};
      for (const table of ['users','user_bands','account_tokens','event_invitations','poll_assignments']) {
        result[table] = (await fixture.query(`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY 1`, [user.user_id])).rows;
      }
      result.effects = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1 ORDER BY notification_id', [user.user_id])).rows;
      return result;
    }
    async function waitForLock(pattern) {
      for (let n = 0; n < 100; n++) {
        await fixture.query('SELECT pg_stat_clear_snapshot()');
        if ((await fixture.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE $1`, [pattern])).rowCount) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail('Expected a waiting transaction');
    }

    await t.test('all owned active bands block with only actor bands and no partial effects', async () => {
      const s = await setup(), second = await setup(s.leader);
      const owned = await request('/bands', { name: 'Second owned band', instrumentation: [{ instrumentId: 2, label: 'Guitar' }] }, s.cookie);
      assert.equal(owned.status, 201);
      const deleted = await request('/bands', { name: 'Deleted owned band', instrumentation: [{ instrumentId: 2, label: 'Guitar' }] }, s.cookie);
      assert.equal(deleted.status, 201);
      assert.equal((await request('/bands/' + deleted.body.data.band.bandId,
        { expectedVersion: deleted.body.data.band.version }, s.cookie, 'DELETE')).status, 200);
      await second.event(); await second.poll();
      const before = await state(s.leader);
      const result = await deactivate(s.leader, s.cookie);
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal(result.body.error.code, 'LEADERSHIP_TRANSFER_REQUIRED');
      assert.deepEqual(result.body.error.details.bands, [
        { bandId: s.band.bandId, name: s.band.name },
        { bandId: owned.body.data.band.bandId, name: 'Second owned band' },
      ]);
      assert.deepEqual(await state(s.leader), before);
      assert.equal((await request('/users/me', undefined, s.cookie, 'GET')).status, 200);
    });

    await t.test('strict validation, credentials, version and session failures preserve state', async () => {
      const s = await setup(); await s.event(); await s.poll();
      const before = await state(s.member);
      for (const body of [{ password: null }, { password: '' }, { expectedVersion: 0 }, { expectedVersion: '1' }, { extra: true }]) {
        assert.equal((await deactivate(s.member, s.memberCookie, body)).status, 400);
      }
      const missing = await request('/users/me', { password: originalPassword }, s.memberCookie, 'DELETE');
      assert.equal(missing.status, 400);
      assert.equal((await deactivate(s.member, s.memberCookie, {}, '')).status, 400);
      const wrong = await deactivate(s.member, s.memberCookie, { password: 'wrong' });
      assert.equal(wrong.status, 401);
      assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal((await request('/users/me', undefined, s.memberCookie, 'GET')).status, 200);
      assert.equal((await deactivate(s.member, s.memberCookie, { expectedVersion: 99 })).body.error.code, 'STALE_VERSION');
      const stale = await storedSession({ ...s.member, session_generation: 99 });
      assert.equal((await deactivate(s.member, stale.cookie)).body.error.code, 'AUTHENTICATION_REQUIRED');
      const restricted = await account({ verified: false }), session = await storedSession(restricted);
      assert.equal((await deactivate(restricted, session.cookie)).status, 403);
      time += IDLE_MS;
      assert.equal((await deactivate(s.member, s.memberCookie)).body.error.code, 'AUTHENTICATION_REQUIRED');
      assert.deepEqual(await state(s.member), before);
    });

    await t.test('multi-band deactivation preserves history, revokes credentials and suppresses ordinary mail', async () => {
      const s = await setup(), second = await setup(s.member);
      const events = [];
      for (const status of ['pending','accepted','declined']) events.push(await s.event([s.member], status));
      const past = await s.event([s.member], 'accepted', '2030-11-19T12:00:00Z');
      const exact = await s.event([s.member], 'accepted', '2030-11-20T12:00:00Z');
      const open = await s.poll(), closed = await s.poll([s.member], true);
      await second.event(); await second.poll();
      const saved = await request(s.root + '/default-lineup', { expectedVersion: s.band.version,
        assignments: [{ slotId: s.band.instrumentation[0].slotId, userId: s.member.user_id }] }, s.cookie, 'PUT');
      assert.equal(saved.status, 200);
      await fixture.query('UPDATE users SET pending_email=$2 WHERE user_id=$1', [s.member.user_id, 'pending@example.test']);
      const { issueToken } = require('../utils/account-tokens');
      const current = await userRow(s.member);
      for (const purpose of ['registration_verification','password_reset','email_change']) {
        await issueToken(fixture, { user: current, purpose, address: purpose === 'email_change' ? current.pending_email : current.email,
          now: time, encryptionKey: key });
      }
      const extra = await storedSession(s.member), intentKey = randomUUID();
      const before = await state(s.member);
      const result = await deactivate(s.member, s.memberCookie, {}, intentKey);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body, { data: { message: 'Account deactivated' } });
      const after = await state(s.member), user = after.users[0];
      assert.equal(user.is_active, false);
      assert.equal(user.pending_email, null);
      assert.equal(user.version, s.member.version + 1);
      assert.equal(user.session_generation, s.member.session_generation + 1);
      assert.equal(user.first_name, s.member.first_name);
      assert.equal(after.user_bands.length, 0);
      assert.ok(after.account_tokens.every(token => token.revoked_at));
      for (const event of [past, exact]) {
        assert.deepEqual(after.event_invitations.find(i => i.event_id === event.eventId), before.event_invitations.find(i => i.event_id === event.eventId));
      }
      for (const event of events) assert.equal(after.event_invitations.find(i => i.event_id === event.eventId).retirement_cause, 'account_deactivated');
      assert.equal(after.poll_assignments.find(a => a.poll_id === open.pollId).retirement_cause, 'account_deactivated');
      assert.deepEqual(after.poll_assignments.find(a => a.poll_id === closed.pollId), before.poll_assignments.find(a => a.poll_id === closed.pollId));
      assert.equal((await fixture.query('SELECT count(*)::int n FROM poll_vote_cells c JOIN poll_assignments a USING(assignment_id) WHERE a.user_id=$1', [s.member.user_id])).rows[0].n, 3);
      assert.equal((await s.detail()).body.data.band.defaultLineup.isApplicable, false);
      for (const cookie of [s.memberCookie, extra.cookie]) assert.equal((await request('/users/me', undefined, cookie, 'GET')).status, 401);
      assert.equal((await fixture.query("SELECT 1 FROM session WHERE sess->>'userId'=$1", [String(s.member.user_id)])).rowCount, 0);
      assert.equal((await request('/auth/login', { email: s.member.email, password: originalPassword })).status, 401);
      assert.equal((await deactivate(s.member, s.memberCookie, {}, intentKey)).status, 401);
      assert.deepEqual(await state(s.member), after);
      assert.equal((await fixture.query("SELECT 1 FROM api_idempotency WHERE actor_user_id=$1 AND method='DELETE' AND path='/api/v1/users/me'", [s.member.user_id])).rowCount, 1);
      const deliveries = [];
      const dispatcher = require('../utils/notification-outbox').createDispatcher({ pool: db.pool, encryptionKey: key,
        origin: 'http://client.example.test', from: 'bandos@example.test', clock: () => time,
        adapter: { send: async mail => { deliveries.push(mail); return { status: 'accepted', id: randomUUID() }; } } });
      for (let n = 0; n < 500 && await dispatcher.dispatchOne(); n++) {}
      assert.ok(deliveries.every(mail => !mail.to.includes(s.member.email) && !mail.to.includes(current.pending_email)));
      assert.ok((await state(s.member)).effects.every(mail => mail.state === 'suppressed'));
      // Even a forged current-generation session cannot restore former access.
      const forged = await storedSession(user);
      assert.equal((await request(s.root + '/events/' + past.eventId, undefined, forged.cookie, 'GET')).status, 401);
      assert.equal((await request(s.root + '/polls/' + closed.pollId, undefined, forged.cookie, 'GET')).status, 401);
    });

    await t.test('failure in the second band rolls back earlier retirements, mail and revocation', async () => {
      const s = await setup(), second = await setup(s.member);
      await s.event(); await s.poll(); await second.event();
      const before = await state(s.member), bandBefore = await s.detail();
      await fixture.query(`CREATE FUNCTION reject_second_removal() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF OLD.band_id=${second.band.bandId} THEN RAISE EXCEPTION 'forced second band failure'; END IF; RETURN OLD; END $$;
        CREATE TRIGGER reject_second_removal BEFORE DELETE ON user_bands FOR EACH ROW EXECUTE FUNCTION reject_second_removal()`);
      const log = console.error; console.error = () => {};
      try { assert.equal((await deactivate(s.member, s.memberCookie)).status, 500); }
      finally {
        console.error = log;
        await fixture.query('DROP TRIGGER reject_second_removal ON user_bands; DROP FUNCTION reject_second_removal()');
      }
      assert.deepEqual(await state(s.member), before);
      assert.deepEqual((await s.detail()).body, bandBefore.body);
      assert.equal((await request('/users/me', undefined, s.memberCookie, 'GET')).status, 200);
    });

    await t.test('transfer into an account during discovery forces a recheck and blocks deactivation', async () => {
      const s = await setup(), otherBand = await setup();
      const blocker = await db.pool.connect();
      await blocker.query('BEGIN');
      await blocker.query('SELECT 1 FROM users WHERE user_id=$1 FOR UPDATE', [s.member.user_id]);
      const pending = deactivate(s.member, s.memberCookie);
      try {
        await waitForLock('SELECT * FROM users%');
        // Simulate the competing add/transfer while its affected-user lock is held.
        await blocker.query("INSERT INTO user_bands(user_id,band_id,role) VALUES($1,$2,'leader')", [s.member.user_id, otherBand.band.bandId]);
        await blocker.query("UPDATE user_bands SET role='member' WHERE user_id=$1 AND band_id=$2", [otherBand.leader.user_id, otherBand.band.bandId]);
        await blocker.query('UPDATE bands SET owner_user_id=$1,version=version+1 WHERE band_id=$2', [s.member.user_id, otherBand.band.bandId]);
        await blocker.query('COMMIT');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      const result = await pending;
      assert.equal(result.body.error.code, 'LEADERSHIP_TRANSFER_REQUIRED');
      assert.deepEqual(result.body.error.details.bands.map(b => b.bandId), [otherBand.band.bandId]);
      assert.equal((await userRow(s.member)).is_active, true);
      assert.equal((await state(s.member)).user_bands.length, 2);
    });

    await t.test('transfer/removal/deactivation races never strand ownership or duplicate retirement', async () => {
      for (const action of ['transfer','remove']) {
        const s = await setup(), second = await setup(s.member);
        await s.event(); await second.event();
        const baseline = (await state(s.member)).effects.length;
        const results = await Promise.all([deactivate(s.member, s.memberCookie),
          action === 'transfer' ? s.transfer() : s.remove()]);
        assert.ok(results.some(result => result.status === 200));
        const current = await userRow(s.member), after = await state(s.member);
        if (current.is_active) {
          assert.equal(action, 'transfer');
          assert.equal(results[0].body.error.code, 'LEADERSHIP_TRANSFER_REQUIRED');
          assert.equal(after.user_bands.length, 2);
          assert.equal(after.effects.length, baseline);
        } else {
          assert.equal(after.user_bands.length, 0);
          assert.equal(after.effects.length - baseline, 2);
          assert.equal((await fixture.query('SELECT owner_user_id FROM bands WHERE band_id=$1', [s.band.bandId])).rows[0].owner_user_id, s.leader.user_id);
        }
      }
    });

    await t.test('old session write waiting on deactivation cannot commit; cleanup failure cannot undo success', async () => {
      const s = await setup(); await s.event();
      // Keep the transaction in progress at the band lock, after it locks the account.
      await fixture.query('BEGIN');
      await fixture.query('SELECT 1 FROM bands WHERE band_id=$1 FOR UPDATE', [s.band.bandId]);
      const pending = deactivate(s.member, s.memberCookie);
      let write;
      const query = db.query;
      try {
        await waitForLock('SELECT * FROM bands%');
        write = request('/users/me', { expectedVersion: s.member.version, firstName: 'Forbidden' }, s.memberCookie, 'PATCH');
        await waitForLock('SELECT * FROM users%');
        db.query = async (sql, args) => {
          if (sql.startsWith('DELETE FROM session')) throw new Error('forced cleanup failure');
          return query(sql, args);
        };
        await fixture.query('COMMIT');
        assert.equal((await pending).status, 200);
        assert.equal((await write).body.error.code, 'AUTHENTICATION_REQUIRED');
        assert.equal((await userRow(s.member)).first_name, s.member.first_name);
        assert.equal((await userRow(s.member)).is_active, false);
      } finally {
        db.query = query;
        await fixture.query('ROLLBACK');
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
