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

test('complete own poll availability', async t => {
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
    let bandVersion = band.version + 1;
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
    const writeOptions = poll => poll.options.map(o => ({optionId:o.optionId,date:o.date,startTime:o.startTime,endTime:o.endTime}));
    const own = (poll, user = member) => poll.responses.find(r => r.userId === user.user_id);
    const answers = (poll, answer = 'yes') => poll.options.map(o => ({ optionId: o.optionId, optionRevision: o.revision, answer }));
    const save = (poll, body = {}, who = memberCookie, key) => request(`${path}/${poll.pollId}/availability`, {
      expectedVersion: poll.version, expectedVoteVersion: own(poll, who === cookie ? leader : member)?.voteVersion ?? 0,
      answers: answers(poll), ...body,
    }, who, 'PUT', key);
    const counts = async () => (await fixture.query(`SELECT
      (SELECT count(*)::int FROM poll_vote_rows) AS rows,
      (SELECT count(*)::int FROM poll_vote_cells) AS cells,
      (SELECT count(*)::int FROM email_outbox WHERE kind='poll_response') AS summaries,
      (SELECT count(*)::int FROM api_idempotency) AS retries`)).rows[0];

    await t.test('blank rows, complete sets, strict input and authorization reject without effects', async () => {
      const poll = (await create()).body.data.poll;
      assert.deepEqual(own(poll), { userId: member.user_id, voteVersion: 0, answers: [], needsResponse: true });
      const foreign = (await create()).body.data.poll;
      const before = await counts();
      for (const body of [
        { answers: [] }, { answers: answers(poll).slice(1) },
        { answers: [answers(poll)[0], answers(poll)[0]] },
        { answers: answers(foreign) },
        { answers: answers(poll).map(a => ({ ...a, optionRevision: 2 })) },
        { answers: answers(poll).map(a => ({ ...a, answer: 'maybe' })) },
        { answers: answers(poll).map(a => ({ ...a, userId: leader.user_id })) },
        { userId: leader.user_id }, { assignmentId: 1 }, { expectedVoteVersion: -1 },
        { expectedVersion: undefined }, { expectedVoteVersion: undefined },
      ]) {
        const result = await save(poll, body);
        assert.equal(result.status, 400, JSON.stringify(result.body));
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      }
      assert.equal((await save(poll, { expectedVersion: 99 })).body.error.code, 'STALE_VERSION');
      assert.equal((await save(poll, { expectedVoteVersion: 1 })).body.error.code, 'STALE_VERSION');
      assert.equal((await save(poll, {}, outsiderCookie)).status, 404);
      const unassigned = (await create({ slots: [fresh(member.user_id)] })).body.data.poll;
      const afterCreate = await counts();
      assert.equal((await save(unassigned, {}, cookie)).status, 404);
      assert.deepEqual(await counts(), afterCreate);
      assert.deepEqual({ ...afterCreate, retries: before.retries }, before);
      const otherBand = (await request('/bands', { name: 'Other', instrumentation: [{ instrumentId: 2, label: 'Guitar' }] }, cookie)).body.data.band;
      assert.equal((await request(`/bands/${otherBand.bandId}/polls/${poll.pollId}/availability`, {
        expectedVersion: 1, expectedVoteVersion: 0, answers: answers(poll),
      }, cookie, 'PUT')).status, 404);
    });

    await t.test('changed complete rows increment only own version; reordered no-ops and lost-response retries send nothing extra', async () => {
      let poll = (await create()).body.data.poll;
      const before = await counts(), initial = poll, key = randomUUID();
      const body = { answers: answers(poll, 'no') };
      const result = await save(poll, body, memberCookie, key);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      poll = result.body.data.poll;
      assert.equal(poll.version, initial.version); assert.equal(poll.updatedAt, initial.updatedAt);
      assert.equal(own(poll).voteVersion, 1); assert.equal(own(poll).needsResponse, false);
      assert.ok(own(poll).answers.every(a => a.answer === 'no'));
      assert.equal(own(poll, leader).voteVersion, 0);
      const committed = await counts();
      assert.equal(committed.summaries, before.summaries + 1);
      assert.deepEqual((await save(initial, body, memberCookie, key)).body, result.body);
      assert.deepEqual(await counts(), committed);
      assert.equal((await save(initial, {}, memberCookie, key)).body.error.code, 'IDEMPOTENCY_KEY_REUSED');
      const noOp = await save(poll, { answers: answers(poll, 'no').reverse() });
      assert.deepEqual(noOp.body.data.poll, poll);
      assert.equal((await counts()).summaries, committed.summaries);
      assert.equal((await save(initial)).body.error.code, 'STALE_VERSION');
      poll = (await save(poll)).body.data.poll;
      assert.equal(own(poll).voteVersion, 2);
      const mail = (await fixture.query("SELECT * FROM email_outbox WHERE kind='poll_response' ORDER BY notification_id DESC LIMIT 1")).rows[0];
      assert.equal(mail.recipient_selector, 'current_leader'); assert.equal(mail.recipient_band_id, band.bandId);
      assert.equal(mail.category, 'pollResponses');
      assert.match(mail.payload.text, /2 Yes, 0 No/);
    });

    await t.test('concurrent respondents succeed at one composition; competing own rows have one winner; same-key races replay', async () => {
      let poll = (await create()).body.data.poll;
      const before = await counts();
      const results = await Promise.all([save(poll), save(poll, { answers: answers(poll, 'no') }, cookie)]);
      assert.deepEqual(results.map(r => r.status), [200, 200]);
      poll = (await get(poll)).body.data.poll;
      assert.equal(poll.version, 1); assert.ok(poll.responses.every(r => r.voteVersion === 1));
      assert.equal((await counts()).summaries, before.summaries + 2);
      const race = await Promise.all([save(poll, { answers: answers(poll, 'no') }),
        save(poll, { answers: answers(poll).map((a, i) => ({ ...a, answer: i ? 'no' : 'yes' })) })]);
      assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
      assert.equal(race.find(r => r.status === 409).body.error.code, 'STALE_VERSION');
      poll = (await get(poll)).body.data.poll;
      const key = randomUUID(), body = { answers: own(poll).answers.map(a => ({ ...a, answer: a.answer === 'yes' ? 'no' : 'yes' })) };
      const retried = await Promise.all([save(poll, body, memberCookie, key), save(poll, body, memberCookie, key)]);
      assert.equal(retried[0].status, 200); assert.deepEqual(retried[0].body, retried[1].body);
      assert.equal((await counts()).summaries, before.summaries + 4);
      // Votes leave the leader's composition form valid.
      assert.equal((await patch(poll, { name: 'After votes' })).status, 200);
    });

    await t.test('revisions invalidate affected cells; removal/readdition starts blank and rejects prior generation requests', async () => {
      let poll = (await create()).body.data.poll;
      poll = (await save(poll)).body.data.poll;
      const old = poll;
      poll = (await patch(poll, { options: writeOptions(poll).map((o, i) => i ? o : { ...o, endTime: '21:00' }) })).body.data.poll;
      assert.equal(own(poll).answers.length, 1); assert.equal(own(poll).needsResponse, true);
      let before = await counts();
      assert.equal((await save(old)).body.error.code, 'STALE_VERSION');
      assert.equal((await save(poll, { answers: answers(old) })).status, 400);
      assert.deepEqual(await counts(), before);
      poll = (await save(poll)).body.data.poll;
      assert.equal(own(poll).voteVersion, 2); assert.equal(own(poll).needsResponse, false);
      poll = (await patch(poll, { slots: writeSlots(poll).map(s => s.userId === member.user_id ? { ...s, userId: null } : s) })).body.data.poll;
      before = await counts();
      assert.equal((await save(old)).status, 404); assert.deepEqual(await counts(), before);
      poll = (await patch(poll, { slots: writeSlots(poll).map((s, i) => i ? s : { ...s, userId: member.user_id }) })).body.data.poll;
      assert.deepEqual(own(poll), { userId: member.user_id, voteVersion: 0, answers: [], needsResponse: true });
      before = await counts();
      assert.equal((await save(old)).body.error.code, 'STALE_VERSION');
      assert.equal((await save(poll, { expectedVoteVersion: 2 })).body.error.code, 'STALE_VERSION');
      assert.deepEqual(await counts(), before);
      assert.equal((await save(poll)).body.data.poll.responses.find(r => r.userId === member.user_id).voteVersion, 1);
    });

    await t.test('elapsed open polls accept answers; terminal polls reject atomically; self-leader mail respects preferences', async () => {
      let poll = (await create({ options: [option(20, '13:00', '14:00')] })).body.data.poll;
      time = Date.UTC(2030, 10, 20, 15);
      poll = (await save(poll, {}, cookie)).body.data.poll;
      assert.equal(poll.state, 'open'); assert.equal(own(poll, leader).voteVersion, 1);
      const { createDispatcher } = require('../utils/notification-outbox');
      const sent = [];
      const dispatcher = createDispatcher({ pool: db.pool, adapter: { send: async payload => {
        sent.push(payload); return { status: 'accepted', id: randomUUID() };
      } }, origin: 'http://client.example.test', from: 'bandos@example.test', encryptionKey: key });
      // Isolate summary delivery from invitation/update effects tested by earlier tickets.
      await fixture.query("UPDATE email_outbox SET state='suppressed' WHERE kind<>'poll_response'");
      while (await dispatcher.dispatchOne()) {}
      assert.ok(sent.some(p => p.subject === 'bandOS poll availability' && p.to[0] === leader.email));
      await fixture.query('INSERT INTO notification_preferences (user_id,poll_responses) VALUES ($1,false) ON CONFLICT (user_id) DO UPDATE SET poll_responses=false', [leader.user_id]);
      poll = (await save(poll, { answers: answers(poll, 'no') }, cookie)).body.data.poll;
      const n = sent.length;
      while (await dispatcher.dispatchOne()) {}
      assert.equal(sent.length, n);
      assert.equal((await fixture.query("SELECT state FROM email_outbox WHERE kind='poll_response' ORDER BY notification_id DESC LIMIT 1")).rows[0].state, 'suppressed');
      await fixture.query("UPDATE polls SET state='cancelled',closed_at=now() WHERE poll_id=$1", [poll.pollId]);
      const before = await counts();
      assert.equal((await save(poll)).body.error.code, 'POLL_CLOSED');
      assert.deepEqual(await counts(), before);
      assert.equal((await get(poll)).body.data.poll.canVote, false);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
