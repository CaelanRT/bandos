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

test('atomic band lifecycle', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_lifecycle_${randomUUID().replaceAll('-', '')}`;
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
    async function setup() {
      time = Date.UTC(2030, 10, 20, 12);
      const leader = await account(), member = await account(), other = await account();
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
      const destroy = (version = band.version, who = cookie, key) => request(root, { expectedVersion: version }, who, 'DELETE', key);
      const transfer = (user = member, who = cookie, version = band.version, key) => request(`${root}/ownership`,
        { userId: user.user_id, expectedVersion: version }, who, 'POST', key);
      const mail = async () => (await fixture.query(`SELECT * FROM email_outbox WHERE notification_id>$1 ORDER BY notification_id`, [baseline])).rows;
      const baseline = (await fixture.query('SELECT COALESCE(max(notification_id),0)::int AS id FROM email_outbox')).rows[0].id;
      return { leader, member, other, cookie, memberCookie, band, root, event, poll, detail, remove, destroy, transfer, mail };
    }

    await t.test('removal retires every future status/open generation, preserves history and invalidates the default', async () => {
      const s = await setup();
      const events = [];
      for (const status of ['pending','accepted','declined']) events.push(await s.event([s.member], status));
      const past = await s.event([s.member], 'accepted', '2030-11-19T18:00:00Z');
      const exact = await s.event([s.member], 'declined', '2030-11-20T12:00:00Z');
      const open = await s.poll(), closed = await s.poll([s.member], true);
      const saved = await request(`${s.root}/default-lineup`, { expectedVersion: s.band.version,
        assignments: [{ slotId: s.band.instrumentation[0].slotId, userId: s.member.user_id }] }, s.cookie, 'PUT');
      s.band = saved.body.data.band;
      const before = await s.mail(), intentKey = randomUUID();
      const result = await s.remove(s.member, s.band.version, s.cookie, intentKey);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const band = result.body.data.band;
      assert.equal(band.version, s.band.version + 1);
      assert.deepEqual(band.instrumentation, s.band.instrumentation);
      assert.equal(band.defaultLineup.isApplicable, false);
      assert.equal(band.defaultLineup.version, s.band.defaultLineup.version);
      assert.equal(band.defaultLineup.invalidReasons[0].code, 'MEMBER_UNAVAILABLE');
      assert.equal(band.members.some(m => m.userId === s.member.user_id), false);
      const rows = (await fixture.query('SELECT * FROM event_invitations WHERE band_id=$1', [band.bandId])).rows;
      for (const e of events) assert.equal(rows.find(i => i.event_id === e.eventId).retirement_cause, 'member_removed');
      for (const e of [past,exact]) assert.equal(rows.find(i => i.event_id === e.eventId).retired_at, null);
      const assignments = (await fixture.query('SELECT * FROM poll_assignments WHERE band_id=$1 ORDER BY poll_id', [band.bandId])).rows;
      assert.equal(assignments[0].retirement_cause, 'member_removed');
      assert.equal(assignments[1].retired_at, null);
      assert.equal((await fixture.query(`SELECT count(*)::int AS n FROM poll_vote_cells c JOIN poll_assignments a USING(assignment_id)
        WHERE a.band_id=$1`, [band.bandId])).rows[0].n, 2);
      assert.equal((await s.mail()).length - before.length, 5); // three issued events, finalized rehearsal, open poll
      assert.deepEqual((await s.remove(s.member, s.band.version, s.cookie, intentKey)).body, result.body);
      assert.equal((await s.mail()).length - before.length, 5);
      assert.equal((await s.remove(s.member, band.version, s.cookie, intentKey)).body.error.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal((await s.remove(s.member, band.version)).status, 404);
      assert.equal((await s.detail(s.memberCookie)).status, 404);
      assert.equal((await request('/bands', undefined, s.memberCookie, 'GET')).body.data.bands.some(b => b.bandId === band.bandId), false);
      for (const path of [`/events/${past.eventId}`, `/events/${exact.eventId}`, `/events`, `/polls/${closed.pollId}`, '/polls']) {
        assert.equal((await request(s.root + path, undefined, s.memberCookie, 'GET')).status, 404);
      }
      const current = (await request(`${s.root}/polls/${open.pollId}`, undefined, s.cookie, 'GET')).body.data.poll;
      assert.deepEqual(current.responses, []);
      assert.equal(current.slots[0].musician, null);
      // Dispatch-time suppression does not depend on membership; preferences still apply.
      const { createDispatcher } = require('../utils/notification-outbox');
      await fixture.query("UPDATE email_outbox SET state='suppressed' WHERE notification_id <= $1", [(await s.mail()).at(-6)?.notification_id || 0]);
      const deliveries = [];
      const dispatcher = createDispatcher({ pool: db.pool, adapter: { send: async mail => { deliveries.push(mail); return { status: 'accepted', id: randomUUID() }; } },
        origin: 'http://client.example.test', from: 'bandos@example.test', encryptionKey: key });
      // All queued messages can still resolve this active former member's address.
      for (let i = 0; i < 5; i++) await dispatcher.dispatchOne();
      assert.equal(deliveries.length, 5);
      assert.ok(deliveries.every(mail => mail.to[0] === s.member.email));
    });

    await t.test('strict input, stale versions, target and owner restrictions have no effects', async () => {
      const s = await setup(), outsider = await account();
      const before = await s.mail();
      assert.equal((await s.remove(s.leader)).status, 400);
      assert.equal((await s.remove(outsider)).status, 404);
      assert.equal((await s.remove(s.member, 99)).body.error.code, 'STALE_VERSION');
      assert.equal((await s.remove(s.other, s.band.version, s.memberCookie)).status, 403);
      assert.equal((await s.transfer(s.leader)).status, 400);
      assert.equal((await s.transfer(outsider)).status, 404);
      await fixture.query('UPDATE users SET email_verified_at=NULL WHERE user_id=$1', [s.other.user_id]);
      assert.equal((await s.transfer(s.other)).status, 404);
      await fixture.query('UPDATE users SET is_active=false WHERE user_id=$1', [s.other.user_id]);
      assert.equal((await s.transfer(s.other)).status, 404);
      assert.equal((await s.destroy(99)).body.error.code, 'STALE_VERSION');
      for (const [path, method, body] of [[s.root,'DELETE',{}], [s.root+'/ownership','POST',{userId:s.member.user_id,expectedVersion:s.band.version,extra:true}],
        [s.root+'/members/'+s.member.user_id,'DELETE',{expectedVersion:0}]]) assert.equal((await request(path, body, s.cookie, method)).status,400);
      assert.deepEqual(await s.mail(), before);
      assert.equal((await s.detail()).body.data.band.version, s.band.version);
    });

    await t.test('ownership preserves eligibility and assignments, redirects queued leader mail and rejects old-leader writes', async () => {
      const s = await setup(), event = await s.event([s.leader,s.member]), poll = await s.poll([s.leader,s.member]);
      const { enqueueNotification, createDispatcher } = require('../utils/notification-outbox');
      const id = await enqueueNotification(fixture, { transitionId: randomUUID(), kind: 'response', category: 'invitationResponses',
        recipientIdentity: `band:${s.band.bandId}`, recipientBandId: s.band.bandId, payload: {subject:'Leader notice',text:'Response'} });
      const before = (await s.detail()).body.data.band;
      const result = await s.transfer();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.band.currentUserRole, 'member');
      assert.deepEqual(result.body.data.band.members.map(m => [m.userId,m.instrumentIds]).sort(), before.members.map(m => [m.userId,m.instrumentIds]).sort());
      const owners = (await fixture.query("SELECT user_id FROM user_bands WHERE band_id=$1 AND role='leader'", [s.band.bandId])).rows;
      assert.deepEqual(owners, [{user_id:s.member.user_id}]);
      assert.equal((await s.transfer()).status,403);
      assert.equal((await request(s.root,{name:'Forbidden',expectedVersion:result.body.data.band.version},s.cookie,'PATCH')).status,403);
      assert.equal((await request(`${s.root}/events/${event.eventId}`,undefined,s.memberCookie,'GET')).body.data.event.slots.length,2);
      assert.equal((await request(`${s.root}/polls/${poll.pollId}`,undefined,s.memberCookie,'GET')).body.data.poll.responses.length,2);
      await fixture.query("UPDATE email_outbox SET state='suppressed' WHERE notification_id<>$1",[id]);
      const deliveries=[];
      const dispatcher=createDispatcher({pool:db.pool,adapter:{send:async mail=>{deliveries.push(mail);return {status:'accepted',id:'sent'};}},
        origin:'http://client.example.test',from:'bandos@example.test',encryptionKey:key});
      await dispatcher.dispatchOne();
      assert.deepEqual(deliveries[0].to,[s.member.email]);
    });

    await t.test('a waiting old-leader write rechecks ownership under the band lock', async () => {
      const s = await setup();
      await fixture.query('BEGIN');
      await fixture.query('SELECT 1 FROM bands WHERE band_id=$1 FOR UPDATE',[s.band.bandId]);
      const pending=request(s.root,{name:'Forbidden',expectedVersion:s.band.version},s.cookie,'PATCH');
      try {
        let waiting=false;
        for(let n=0;n<100;n++) {
          await fixture.query('SELECT pg_stat_clear_snapshot()');
          waiting=(await fixture.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM bands%'`)).rowCount>0;
          if(waiting) break;
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.ok(waiting);
        await fixture.query('UPDATE bands SET owner_user_id=$2,version=version+1 WHERE band_id=$1',[s.band.bandId,s.member.user_id]);
        await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[s.band.bandId,s.member.user_id]);
        await fixture.query('COMMIT');
      } finally { await fixture.query('ROLLBACK'); }
      assert.equal((await pending).status,403);
      assert.equal((await s.detail()).body.data.band.name,'Lifecycle');
    });

    await t.test('deletion cancels future/open resources with exact recipients and retains past/closed snapshots', async () => {
      const s = await setup();
      const future=await s.event([s.leader,s.member,s.other]);
      await fixture.query("UPDATE event_invitations SET status='declined' WHERE event_id=$1 AND user_id=$2",[future.eventId,s.other.user_id]);
      await s.event([s.leader], 'declined'); // A current Declined invitee also receives no cancellation.
      const past=await s.event([s.member],'accepted','2030-11-19T12:00:00Z');
      const exact=await s.event([s.member],'accepted','2030-11-20T12:00:00Z');
      const open=await s.poll([s.leader,s.member,s.other]), closed=await s.poll([s.member],true);
      const removed=await s.remove(s.other);
      const baseline=(await s.mail()).length;
      const result=await s.destroy(removed.body.data.band.version);
      assert.equal(result.status,200,JSON.stringify(result.body));
      const effects=(await s.mail()).slice(baseline);
      assert.deepEqual(effects.map(m=>[m.kind,m.recipient_user_id]).sort(),[
        ['event_cancellation',s.leader.user_id],['event_cancellation',s.member.user_id],
        ['event_cancellation',s.member.user_id], // rehearsal finalized from closed poll
        ['poll_cancellation',s.leader.user_id],['poll_cancellation',s.member.user_id]].sort());
      const rows=(await fixture.query('SELECT event_id,is_active FROM events WHERE band_id=$1',[s.band.bandId])).rows;
      assert.equal(rows.find(e=>e.event_id===future.eventId).is_active,false);
      for(const event of [past,exact]) assert.equal(rows.find(e=>e.event_id===event.eventId).is_active,true);
      const polls=(await fixture.query('SELECT * FROM polls WHERE band_id=$1',[s.band.bandId])).rows;
      assert.equal(polls.find(p=>p.poll_id===open.pollId).state,'cancelled');
      assert.equal(polls.find(p=>p.poll_id===closed.pollId).state,'finalized');
      assert.equal((await s.detail()).status,404);
      assert.equal((await s.destroy()).status,404);
      assert.equal((await request(`${s.root}/polls/${open.pollId}`,undefined,s.memberCookie,'GET')).status,404);
      // Category preference suppresses cancellation dispatch after access disappears.
      await fixture.query("UPDATE email_outbox SET state='suppressed' WHERE notification_id<$1",[effects[0].notification_id]);
      await fixture.query('INSERT INTO notification_preferences(user_id,removals_and_cancellations) VALUES($1,false)',[s.member.user_id]);
      const deliveries=[];
      const dispatcher=require('../utils/notification-outbox').createDispatcher({pool:db.pool,adapter:{send:async mail=>{deliveries.push(mail);return {status:'accepted',id:randomUUID()};}},
        origin:'http://client.example.test',from:'bandos@example.test',encryptionKey:key});
      for(let i=0;i<effects.length;i++) await dispatcher.dispatchOne();
      assert.equal(deliveries.length,2);
      assert.ok(deliveries.every(mail=>mail.to[0]===s.leader.email));
    });

    await t.test('cancel/remove/delete races notify each assignment once and leave no active future participation', async () => {
      for (const race of ['event','poll','band']) {
        const s=await setup(), event=await s.event(), poll=await s.poll();
        const baseline=(await s.mail()).length;
        const competing=race==='event'
          ? request(`${s.root}/events/${event.eventId}`,{expectedVersion:event.version},s.cookie,'DELETE')
          : race==='poll' ? request(`${s.root}/polls/${poll.pollId}/cancel`,{expectedVersion:poll.version},s.cookie)
            : s.destroy();
        const results=await Promise.all([s.remove(),competing]);
        assert.ok(results.some(r=>r.status===200));
        if(race==='band' && (await s.detail()).status===200) {
          await s.destroy((await s.detail()).body.data.band.version);
        } else if(race!=='band' && (await s.detail()).body.data.band.members.some(m=>m.userId===s.member.user_id)) {
          await s.remove(s.member,(await s.detail()).body.data.band.version);
        }
        const effects=(await s.mail()).slice(baseline);
        assert.equal(effects.filter(m=>m.kind.startsWith('event_')).length,1);
        assert.equal(effects.filter(m=>m.kind.startsWith('poll_')).length,1);
        assert.equal((await fixture.query(`SELECT 1 FROM event_invitations i JOIN events e USING(event_id)
          WHERE e.band_id=$1 AND e.is_active AND i.retired_at IS NULL`,[s.band.bandId])).rowCount,0);
        assert.equal((await fixture.query(`SELECT 1 FROM poll_assignments a JOIN polls p USING(poll_id)
          WHERE p.band_id=$1 AND p.state='open' AND a.retired_at IS NULL`,[s.band.bandId])).rowCount,0);
      }
    });

    await t.test('outbox failure rolls back the entire removal and deletion', async () => {
      const s=await setup(); await s.event(); await s.poll();
      const before=await s.mail();
      await fixture.query(`CREATE FUNCTION reject_lifecycle_mail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'forced outbox failure'; END $$;
        CREATE TRIGGER reject_lifecycle_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_mail()`);
      try {
        assert.equal((await s.remove()).status,500);
        assert.equal((await s.destroy()).status,500);
        assert.equal((await s.detail()).body.data.band.version,s.band.version);
        assert.equal((await fixture.query('SELECT 1 FROM event_invitations WHERE band_id=$1 AND retired_at IS NOT NULL',[s.band.bandId])).rowCount,0);
        assert.equal((await fixture.query("SELECT 1 FROM polls WHERE band_id=$1 AND state<>'open'",[s.band.bandId])).rowCount,0);
        assert.deepEqual(await s.mail(),before);
      } finally { await fixture.query('DROP TRIGGER reject_lifecycle_mail ON email_outbox; DROP FUNCTION reject_lifecycle_mail()'); }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
