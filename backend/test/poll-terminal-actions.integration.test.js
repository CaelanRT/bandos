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

test('atomic poll terminal actions', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_poll_${randomUUID().replaceAll('-', '')}`;
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
    const leader = await account(), member = await account(), outsider = await account();
    let cookie = (await storedSession(leader)).cookie;
    const memberCookie = (await storedSession(member)).cookie;
    const outsiderCookie = (await storedSession(outsider)).cookie;
    const band = (await request('/bands', { name: 'Test band', leaderInstrumentIds: [1,2],
      instrumentation: [{ instrumentId: 2, label: 'Guitar 1' }, { instrumentId: 2, label: 'Guitar 2' }] }, cookie)).body.data.band;
    const guitar = band.instrumentation[0].instrumentId;
    const vocals = band.instruments.find(i => i.name === 'Vocals').instrumentId;
    await request(`/bands/${band.bandId}/members`, { expectedVersion: band.version, username: member.username,
      instrumentIds: [guitar,vocals] }, cookie);
    const bandVersion = band.version + 1;
    const option = (day = 21, startTime = '18:00', endTime = '20:00') => ({ clientKey: randomUUID(),
      date: `2030-11-${day}`, startTime, endTime });
    const base = { name: ' Poll ', timezone: 'UTC', location: ' Hall ', hideFromUninvited: false };
    const fresh = (userId = null, instrumentId = guitar) => ({ clientKey: randomUUID(), instrumentId, label: 'Guitar', userId });
    const path = `/bands/${band.bandId}/polls`;
    const create = (body = {}, key, who = cookie) => request(path, { ...base, templateVersion: bandVersion,
      slots: [fresh(member.user_id), fresh(leader.user_id)], options: [option(), option(22)], ...body }, who, 'POST', key);
    const patch = (poll, body, who = cookie, key) => request(`${path}/${poll.pollId}`, { expectedVersion: poll.version, ...body }, who, 'PATCH', key);
    const get = (poll, who = cookie) => request(`${path}/${poll.pollId}`, undefined, who, 'GET');
    const writeSlots = poll => poll.slots.map(s => ({slotId:s.slotId, templateSlotId:s.templateSlotId,
      instrumentId:s.instrumentId,label:s.label,userId:s.musician?.userId ?? null}));
    const own = (poll, user = member) => poll.responses.find(r => r.userId === user.user_id);
    const answers = (poll, answer = 'yes') => poll.options.map(o => ({ optionId: o.optionId, optionRevision: o.revision, answer }));
    const save = (poll, body = {}, who = memberCookie, key) => request(`${path}/${poll.pollId}/availability`, {
      expectedVersion: poll.version, expectedVoteVersion: own(poll, who === cookie ? leader : member)?.voteVersion ?? 0,
      answers: answers(poll), ...body,
    }, who, 'PUT', key);
    const finalize = (poll, body = {}, who = cookie, key) => request(`${path}/${poll.pollId}/finalize`, {
      expectedVersion: poll.version, optionId: poll.options[0].optionId, optionRevision: poll.options[0].revision, ...body,
    }, who, 'POST', key);
    const cancel = (poll, body = {}, who = cookie, key) => request(`${path}/${poll.pollId}/cancel`, {
      expectedVersion: poll.version, ...body,
    }, who, 'POST', key);
    const effects = async () => (await fixture.query(`SELECT
      (SELECT count(*)::int FROM events) AS events,
      (SELECT count(*)::int FROM event_invitations) AS invitations,
      (SELECT count(*)::int FROM email_outbox) AS mail`)).rows[0];

    await t.test('empty lineup, stale/revision/elapsed/authorization/input failures have no effects', async () => {
      let poll = (await create()).body.data.poll;
      const foreign = (await create()).body.data.poll;
      const before = await effects();
      for (const body of [{ expectedVersion: 99 }, { optionRevision: 99 }, { optionId: foreign.options[0].optionId },
        { optionId: undefined }, { extra: true }]) {
        assert.ok([400,409].includes((await finalize(poll, body)).status));
      }
      assert.equal((await finalize(poll, {}, memberCookie)).status, 403);
      assert.equal((await finalize(poll, {}, outsiderCookie)).status, 404);
      assert.equal((await cancel(poll, { expectedVersion: 99 })).body.error.code, 'STALE_VERSION');
      assert.equal((await cancel(poll, {}, memberCookie)).status, 403);
      assert.deepEqual(await effects(), before);
      poll = (await patch(poll, { slots: writeSlots(poll).map(s => ({ ...s, userId: null })) })).body.data.poll;
      const emptyBefore = await effects();
      const empty = await finalize(poll);
      assert.equal(empty.status, 400); assert.equal(empty.body.error.code, 'VALIDATION_ERROR');
      assert.equal(empty.body.error.details[0].field, 'slots');
      assert.equal((await get(poll)).body.data.poll.state, 'open');
      assert.deepEqual(await effects(), emptyBefore);
      poll = (await create({ options: [option(20, '13:00', '14:00')] })).body.data.poll;
      time = Date.UTC(2030, 10, 20, 13);
      const elapsedBefore = await effects();
      assert.equal((await finalize(poll)).status, 400);
      assert.deepEqual(await effects(), elapsedBefore);
      time = Date.UTC(2030, 10, 20, 12);
      // Fresh event assignments must still be eligible at finalization.
      await fixture.query('DELETE FROM member_instruments WHERE band_id=$1 AND user_id=$2', [band.bandId, member.user_id]);
      assert.equal((await finalize(poll)).status, 400);
      assert.deepEqual(await effects(), elapsedBefore);
      await fixture.query('INSERT INTO member_instruments (band_id,user_id,instrument_id) VALUES ($1,$2,$3)', [band.bandId, member.user_id, guitar]);
    });

    await t.test('copies snapshots/details, No/missing/Yes all become fresh Pending; repeats survive replay expiry', async () => {
      let poll = (await create({ hideFromUninvited: true, description: 'Closing description', slots: [fresh(member.user_id), fresh(leader.user_id), fresh()] })).body.data.poll;
      poll = (await save(poll, { answers: answers(poll, 'no') })).body.data.poll;
      const initial = poll, key = randomUUID(), before = await effects();
      const result = await finalize(poll, {}, cookie, key);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const { event } = result.body.data;
      poll = result.body.data.poll;
      assert.equal(poll.state, 'finalized'); assert.equal(poll.version, initial.version + 1);
      assert.equal(poll.finalizedEventId, event.eventId); assert.equal(poll.canVote, false);
      assert.deepEqual(poll.responses, initial.responses);
      for (const field of ['name','description','location','timezone','hideFromUninvited']) assert.equal(event[field], poll[field]);
      for (const field of ['date','startTime','endTime','startsAt','endsAt']) assert.equal(event[field], poll.options[0][field]);
      assert.equal(event.type, 'rehearsal'); assert.equal(event.slots.length, 3);
      assert.ok(event.slots.slice(0,2).every(s => s.invitation.status === 'pending' && s.invitation.respondedAt === null));
      assert.equal(event.slots[2].invitation, null);
      const after = await effects();
      assert.deepEqual(after, { events: before.events+1, invitations: before.invitations+2, mail: before.mail+2 });
      assert.deepEqual((await finalize(initial, {}, cookie, key)).body, result.body);
      await fixture.query("UPDATE api_idempotency SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day'");
      assert.deepEqual((await finalize(initial, {}, cookie, key)).body, result.body);
      assert.equal((await finalize(initial, { optionId: poll.options[1].optionId })).body.error.code, 'POLL_CLOSED');
      assert.deepEqual(await effects(), after);
      assert.equal((await patch(poll, { name: 'Reopen' })).body.error.code, 'POLL_CLOSED');
      assert.equal((await save(poll)).body.error.code, 'POLL_CLOSED');
      assert.equal((await cancel(poll)).body.error.code, 'POLL_CLOSED');
      // Changing event visibility/lineup does not change closing poll access or answers.
      let updated = await request(`/bands/${band.bandId}/events/${event.eventId}`, {
        expectedVersion: event.version, slots: event.slots.map(s => ({ slotId:s.slotId, templateSlotId:s.templateSlotId,
          instrumentId:s.instrumentId,label:s.label,userId:null })),
      }, cookie, 'PATCH');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal((await get(poll, memberCookie)).status, 200);
      assert.equal((await request(`/bands/${band.bandId}/events/${event.eventId}`, undefined, memberCookie, 'GET')).status, 404);
      const yes = (await create()).body.data.poll;
      const voted = (await save(yes)).body.data.poll;
      assert.ok((await finalize(voted)).body.data.event.slots.every(s => s.invitation.status === 'pending'));
    });

    await t.test('cancellation preserves closing answers, notifies only current invitees and replays once', async () => {
      let poll = (await create({ hideFromUninvited: true })).body.data.poll;
      poll = (await save(poll)).body.data.poll;
      poll = (await patch(poll, { slots: writeSlots(poll).map(s => s.userId === member.user_id ? { ...s, userId:null } : s) })).body.data.poll;
      const before = await effects(), key = randomUUID();
      const result = await cancel(poll, {}, cookie, key);
      assert.equal(result.status, 200); assert.equal(result.body.data.poll.state, 'cancelled');
      assert.equal(result.body.data.poll.finalizedEventId, null);
      assert.deepEqual(result.body.data.poll.responses, poll.responses);
      const after = await effects();
      assert.deepEqual(after, { ...before, mail: before.mail+1 });
      const recipients = (await fixture.query("SELECT recipient_user_id FROM email_outbox WHERE kind='poll_cancellation' AND payload->>'path'=$1", [`/bands/${band.bandId}/polls/${poll.pollId}`])).rows;
      assert.deepEqual(recipients, [{ recipient_user_id:leader.user_id }]);
      assert.deepEqual((await cancel(poll, {}, cookie, key)).body, result.body);
      assert.equal((await cancel(result.body.data.poll)).body.error.code, 'POLL_CLOSED');
      assert.equal((await get(poll, memberCookie)).status, 404);
      assert.equal((await finalize(poll)).body.error.code, 'POLL_CLOSED');
      assert.deepEqual(await effects(), after);
    });

    await t.test('finalize/finalize and finalize/cancel races commit one terminal outcome', async () => {
      for (const sameKey of [false,true]) {
        const poll = (await create()).body.data.poll, key = randomUUID(), before = await effects();
        const results = await Promise.all([finalize(poll, {}, cookie, key), finalize(poll, {}, cookie, sameKey ? key : randomUUID())]);
        assert.deepEqual(results.map(r => r.status), [200,200]);
        assert.deepEqual(results[0].body, results[1].body);
        assert.deepEqual(await effects(), { events:before.events+1, invitations:before.invitations+2, mail:before.mail+2 });
      }
      for (const cancelFirst of [false, true]) {
        const poll = (await create()).body.data.poll, before = await effects();
        const results = await Promise.all(cancelFirst ? [cancel(poll), finalize(poll)] : [finalize(poll), cancel(poll)]);
        assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
        assert.equal(results.find(r => r.status===409).body.error.code, 'POLL_CLOSED');
        const closed = (await get(poll)).body.data.poll;
        const after = await effects();
        assert.equal(after.events-before.events, closed.state==='finalized' ? 1 : 0);
        assert.equal(after.mail-before.mail, 2);
      }
    });

    await t.test('outbox failures roll back event, invitations and terminal state together', async () => {
      const poll = (await create()).body.data.poll, before = await effects();
      await fixture.query(`CREATE FUNCTION reject_terminal_mail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.kind IN ('event_invitation','poll_cancellation') THEN RAISE EXCEPTION 'test outbox failure'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER reject_terminal_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_terminal_mail()`);
      try {
        assert.equal((await finalize(poll)).status, 500);
        assert.equal((await cancel(poll)).status, 500);
        assert.deepEqual(await effects(), before);
        assert.deepEqual((await get(poll)).body.data.poll, poll);
      } finally {
        await fixture.query('DROP TRIGGER reject_terminal_mail ON email_outbox; DROP FUNCTION reject_terminal_mail()');
      }
    });

    await t.test('revoked/expired sessions and inaccessible linked-event replay have zero effects', async () => {
      const poll = (await create()).body.data.poll, before = await effects();
      const expired = (await storedSession(leader)).cookie;
      await fixture.query("UPDATE session SET sess=jsonb_set(sess::jsonb,'{lastActivityAt}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE sid=$1", [decodeURIComponent(expired.split('=')[1]).slice(2).split('.')[0]]);
      assert.equal((await finalize(poll, {}, expired)).status, 401);
      await fixture.query('UPDATE users SET session_generation=session_generation+1 WHERE user_id=$1', [leader.user_id]);
      assert.equal((await finalize(poll)).status, 401);
      assert.deepEqual(await effects(), before);
      const refreshed = (await fixture.query('SELECT * FROM users WHERE user_id=$1', [leader.user_id])).rows[0];
      cookie = (await storedSession(refreshed)).cookie;
      const key = randomUUID(), result = await finalize(poll, {}, cookie, key);
      assert.equal(result.status, 200);
      await request(`/bands/${band.bandId}/events/${result.body.data.event.eventId}`, { expectedVersion:1 }, cookie, 'DELETE');
      const after = await effects();
      assert.equal((await finalize(poll, {}, cookie, key)).status, 404);
      assert.equal((await finalize(poll)).status, 404);
      assert.deepEqual(await effects(), after);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
