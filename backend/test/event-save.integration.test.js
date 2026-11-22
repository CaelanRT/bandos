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

test('atomic event saves and invitations', async t => {
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
    const { IDLE_MS } = require('../utils/account-session');
    const bcrypt = require('bcrypt');
    const key = randomBytes(32);
    // Keep cookie/store wall-clock expiry ahead of the real clock as in other v2 fixtures.
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
    const base = { name: ' Concert ', type: 'performance', date: new Date(time + 86400000).toISOString().slice(0,10),
      startTime: '18:00', endTime: '20:00', timezone: 'UTC', location: ' Hall ', hideFromUninvited: false };
    const fresh = (userId = null, instrumentId = guitar) => ({ clientKey: randomUUID(), instrumentId, label: ' Guitar ', userId });
    const path = `/bands/${band.bandId}/events`;
    const create = (body = {}, key) => request(path, { ...base, templateVersion: bandVersion, slots: [fresh(member.user_id), fresh()], ...body }, cookie, 'POST', key);
    const patch = (event, body, who = cookie, key) => request(`${path}/${event.eventId}`, { expectedVersion: event.version, ...body }, who, 'PATCH', key);
    const get = (event, who = cookie) => request(`${path}/${event.eventId}`, undefined, who, 'GET');
    const writeSlots = event => event.slots.map(s => ({slotId:s.slotId, templateSlotId:s.templateSlotId,
      instrumentId:s.instrumentId,label:s.label,userId:s.invitation?.userId ?? null}));
    const effects = async () => (await fixture.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n;
    const counts = async () => (await fixture.query(`SELECT
      (SELECT count(*)::int FROM events) AS events,(SELECT count(*)::int FROM event_slots) AS slots,
      (SELECT count(*)::int FROM event_invitations) AS invitations,(SELECT count(*)::int FROM email_outbox) AS emails,
      (SELECT count(*)::int FROM invitation_history) AS history,
      (SELECT count(*)::int FROM api_idempotency) AS replays`)).rows[0];
    let event;

    await t.test('partial creation commits snapshot IDs, Pending invitations and one outbox effect; retries replay once', async () => {
      const key = randomUUID();
      const body = { slots: [{...fresh(member.user_id),templateSlotId:band.instrumentation[0].slotId},fresh()] };
      const before = await counts();
      const response = await create(body,key);
      assert.equal(response.status,201,JSON.stringify(response.body));
      event = response.body.data.event;
      assert.equal(event.version,1);
      assert.equal(event.name,'Concert');
      assert.equal(event.location,'Hall');
      assert.equal(event.startsAt,`${base.date}T18:00:00.000Z`);
      assert.equal(event.endsAt,`${base.date}T20:00:00.000Z`);
      assert.equal(event.slots.length,2);
      assert.equal(event.slots[0].templateSlotId,band.instrumentation[0].slotId);
      assert.equal(event.slots[0].invitation.status,'pending');
      assert.equal(event.slots[1].invitation,null);
      assert.equal(event.myInvitationId,null);
      assert.equal(event.canManage,true);
      assert.equal(event.canRespond,false);
      assert.deepEqual((await create(body,key)).body,response.body);
      const after = await counts();
      assert.equal(after.events,before.events+1);
      assert.equal(after.invitations,before.invitations+1);
      assert.equal(after.emails,before.emails+1);
      assert.deepEqual((await get(event)).body.data.event,event);
      assert.equal((await create({...body,name:'Different'},key)).body.error.code,'IDEMPOTENCY_KEY_REUSED');
    });

    await t.test('normalized no-ops, omitted collections, reordering and label edits retain invitation identity and response', async () => {
      const id = event.slots[0].invitation.invitationId;
      await fixture.query("UPDATE event_invitations SET status='declined',decline_reason='Private',responded_at=now() WHERE invitation_id=$1",[id]);
      event = (await get(event)).body.data.event;
      const n = await effects();
      const noop = await patch(event,{name:'  Concert ',slots:writeSlots(event)});
      assert.equal(noop.status,200,JSON.stringify(noop.body));
      assert.deepEqual(noop.body.data.event,event);
      assert.deepEqual((await patch(event,{})).body.data.event,event);
      const changed = await patch(event,{slots:writeSlots(event).reverse().map(s=>({...s,label:'Renamed'}))});
      assert.equal(changed.status,200);
      event = changed.body.data.event;
      assert.equal(event.version,2);
      assert.equal(event.slots[1].invitation.invitationId,id);
      assert.equal(event.slots[1].invitation.status,'declined');
      assert.equal(event.slots[1].invitation.declineReason,'Private');
      assert.equal(await effects(),n);
      event = (await patch(event,{description:'Details'})).body.data.event;
      assert.equal(event.slots[1].invitation.invitationId,id);
      assert.equal(await effects(),n); // Declined recipients do not receive details.
    });

    await t.test('moving, instrument changes, explicit empties and re-additions retire old identities including Declined', async () => {
      const n = await effects();
      const old = event.slots[1].invitation.invitationId;
      event = (await patch(event,{slots:writeSlots(event).map((s,i)=>({...s,userId:i===0?member.user_id:null}))})).body.data.event;
      assert.notEqual(event.slots[0].invitation.invitationId,old);
      assert.equal(event.slots[0].invitation.status,'pending');
      assert.equal(event.slots[1].invitation,null);
      assert.equal(await effects(),n+2);
      assert.ok((await fixture.query('SELECT retired_at FROM event_invitations WHERE invitation_id=$1',[old])).rows[0].retired_at);
      const moved = event.slots[0].invitation.invitationId;
      event = (await patch(event,{slots:writeSlots(event).map((s,i)=>i===0?{...s,instrumentId:vocals}:s)})).body.data.event;
      assert.notEqual(event.slots[0].invitation.invitationId,moved);
      assert.equal(await effects(),n+4);
      event = (await patch(event,{slots:writeSlots(event).map(s=>({...s,userId:null}))})).body.data.event;
      assert.equal(await effects(),n+5);
      assert.equal(event.slots[0].invitation,null);
      event = (await patch(event,{slots:writeSlots(event).map((s,i)=>({...s,userId:i===0?member.user_id:null}))})).body.data.event;
      assert.equal(await effects(),n+6);
      event = (await patch(event,{slots:[writeSlots(event)[1]]})).body.data.event;
      assert.equal(event.slots.length,1);
      assert.equal(await effects(),n+7);
    });

    await t.test('lineup-only PATCH can add new empty or assigned slots with client keys and replay persisted IDs', async () => {
      let current = (await create({slots:[fresh()]})).body.data.event;
      const n = await effects();
      const empty = await patch(current,{slots:[...writeSlots(current),fresh()]});
      assert.equal(empty.status,200,JSON.stringify(empty.body));
      current = empty.body.data.event;
      assert.equal(current.slots.length,2);
      assert.equal(current.slots[1].invitation,null);
      assert.equal(await effects(),n);
      const key = randomUUID();
      const body = {slots:[...writeSlots(current),fresh(member.user_id)]};
      const assigned = await patch(current,body,cookie,key);
      assert.equal(assigned.status,200,JSON.stringify(assigned.body));
      assert.equal(assigned.body.data.event.version,current.version+1);
      assert.equal(assigned.body.data.event.slots.length,3);
      assert.equal(assigned.body.data.event.slots[2].invitation.status,'pending');
      assert.deepEqual((await patch(current,body,cookie,key)).body,assigned.body);
      assert.equal(await effects(),n+1);
    });

    await t.test('same-slot musician replacements get fresh Pending identities; detail changes notify retained invitees only', async () => {
      let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id)]})).body.data.event;
      const old = current.slots[0].invitation.invitationId;
      await fixture.query("UPDATE event_invitations SET status='accepted',responded_at=now() WHERE invitation_id=$1",[old]);
      current = (await get(current)).body.data.event;
      const key = randomUUID();
      const body = {location:'Another hall',slots:[{...writeSlots(current)[0],userId:outsider.user_id}]};
      // Give the replacement a current membership without changing API setup below.
      await fixture.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')",[outsider.user_id,band.bandId]);
      await fixture.query('INSERT INTO member_instruments (band_id,user_id,instrument_id) VALUES ($1,$2,$3)',[band.bandId,outsider.user_id,guitar]);
      const n = await effects();
      const result = await patch(current,body,cookie,key);
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.notEqual(result.body.data.event.slots[0].invitation.invitationId,old);
      assert.equal(result.body.data.event.slots[0].invitation.status,'pending');
      assert.equal(await effects(),n+3); // Two removals and the replacement invitation; no update.
      assert.deepEqual((await patch(current,body,cookie,key)).body,result.body);
      assert.equal(await effects(),n+3);
      await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[band.bandId,outsider.user_id]);
    });

    await t.test('bounds, missing/null collections, duplicate/foreign IDs and ineligible selections leave zero effects', async () => {
      const foreign = (await request('/bands', {name:'Other',instrumentation:[{instrumentId:2,label:'Other'}]},cookie)).body.data.band;
      const before = await counts();
      const bad = [ {slots:[]},{slots:null},{slots:Array.from({length:51},()=>fresh())},
        {slots:[{clientKey:randomUUID(),instrumentId:guitar,label:'Guitar'}]},
        {slots:[fresh(member.user_id),fresh(member.user_id)]},{slots:[fresh(outsider.user_id)]},
        {slots:[fresh(member.user_id,foreign.instruments[0].instrumentId)]},
        {slots:[{...fresh(),templateSlotId:foreign.instrumentation[0].slotId}]},
        {slots:[{...fresh(),slotId:event.slots[0].slotId}]},
        {slots:[{...fresh(),userId:String(member.user_id)}]},
        {slots:[{...fresh(),instrumentId:band.instruments.find(i=>i.name==='Drums').instrumentId,userId:member.user_id}]},
        {slots:[fresh()],unknown:true},{templateVersion:bandVersion-1} ];
      for (const body of bad) {
        const result = await create(body);
        assert.ok([400,409].includes(result.status),JSON.stringify({body,result}));
      }
      assert.deepEqual(await counts(),before);
      const other = (await create()).body.data.event;
      const duplicate = [writeSlots(event)[0],writeSlots(event)[0]];
      for (const slots of [duplicate,[writeSlots(other)[0]],[{...writeSlots(event)[0],templateSlotId:band.instrumentation[1].slotId}]]) {
        const result = await patch(event,{slots});
        assert.equal(result.status,400,JSON.stringify(result.body));
      }
      assert.equal((await patch({...event,version:event.version-1},{name:'Stale'})).body.error.code,'STALE_VERSION');
      const linked = (await create({slots:[{...fresh(),templateSlotId:band.instrumentation[0].slotId}]})).body.data.event;
      assert.equal((await patch(linked,{slots:[{...writeSlots(linked)[0],templateSlotId:null}]})).status,400);
      const fifty = await create({slots:Array.from({length:50},()=>fresh())});
      assert.equal(fifty.status,201);
      assert.equal(fifty.body.data.event.slots.length,50);
      assert.equal((await create({slots:[fresh()]})).status,201);
    });

    await t.test('unchanged assignments survive eligibility removal but fresh/moved assignments revalidate', async () => {
      let current = (await create()).body.data.event;
      const id = current.slots[0].invitation.invitationId;
      const result = await request(`/bands/${band.bandId}/members/${member.user_id}`,{expectedVersion:bandVersion,instrumentIds:[]},cookie,'PATCH');
      assert.equal(result.status,200);
      bandVersion++;
      current = (await patch(current,{slots:writeSlots(current).map(s=>({...s,label:'Label'}))})).body.data.event;
      assert.equal(current.slots[0].invitation.invitationId,id);
      assert.equal((await patch(current,{slots:writeSlots(current).map((s,i)=>({...s,userId:i===1?member.user_id:null}))})).status,400);
      assert.equal((await create()).status,400);
      await request(`/bands/${band.bandId}/members/${member.user_id}`,{expectedVersion:bandVersion,instrumentIds:[guitar,vocals]},cookie,'PATCH');
      bandVersion++;
    });

    await t.test('leader authorization, hidden resources and decline reasons are enforced in responses and reads', async () => {
      const current = (await create({hideFromUninvited:true})).body.data.event;
      assert.equal((await patch(current,{name:'No'},memberCookie)).status,403);
      assert.equal((await patch(current,{name:'No'},outsiderCookie)).status,404);
      assert.equal((await get(current,outsiderCookie)).status,404);
      const id = current.slots[0].invitation.invitationId;
      await fixture.query("UPDATE event_invitations SET status='declined',decline_reason='Only me' WHERE invitation_id=$1",[id]);
      assert.equal((await get(current,memberCookie)).body.data.event.slots[0].invitation.declineReason,'Only me');
      await request(`/bands/${band.bandId}/members`,{expectedVersion:bandVersion,username:outsider.username,instrumentIds:[guitar]},cookie);
      bandVersion++;
      assert.equal((await get(current,outsiderCookie)).status,404);
      assert.ok(!(await request(path,undefined,outsiderCookie,'GET')).body.data.events.some(e=>e.eventId===current.eventId));
      const visible = (await patch(current,{hideFromUninvited:false})).body.data.event;
      const otherView = (await get(visible,outsiderCookie)).body.data.event;
      assert.equal(Object.hasOwn(otherView.slots[0].invitation,'declineReason'),false);
      assert.equal(otherView.canManage,false);
      const foreign = (await request('/bands',{name:'Foreign',instrumentation:[{instrumentId:2,label:'Guitar'}]},cookie)).body.data.band;
      assert.equal((await request(`/bands/${foreign.bandId}/events/${current.eventId}`,{expectedVersion:visible.version,name:'No'},cookie,'PATCH')).status,404);
    });

    await t.test('schedule resolves DST overlaps, rejects gaps/same-day errors and guards exact stored start before future edits', async () => {
      const gap = await create({date:'2031-03-09',startTime:'02:30',endTime:'04:00',timezone:'America/New_York'});
      assert.equal(gap.status,400);
      const overlap = await create({date:'2031-11-02',startTime:'01:30',endTime:'03:00',timezone:'America/New_York'});
      assert.equal(overlap.status,201,JSON.stringify(overlap.body));
      assert.equal(overlap.body.data.event.startsAt,'2031-11-02T05:30:00.000Z');
      assert.equal((await create({startTime:'20:00',endTime:'18:00'})).status,400);
      const current = (await create()).body.data.event;
      const originalTime = time;
      await fixture.query('UPDATE events SET starts_at=$2 WHERE event_id=$1',[current.eventId,new Date(time)]);
      const before = await counts();
      assert.equal((await patch(current,{date:'2031-12-01'})).body.error.code,'EVENT_STARTED');
      time++;
      assert.equal((await patch(current,{date:'2031-12-01'})).body.error.code,'EVENT_STARTED');
      assert.deepEqual(await counts(),before);
      time=originalTime;
    });

    await t.test('transaction failure and commit-boundary session loss roll back slots, invitations, mail and replay', async () => {
      const before = await counts();
      await fixture.query(`CREATE FUNCTION reject_event_mail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test failure'; END $$;
        CREATE TRIGGER reject_event_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_event_mail()`);
      const key = randomUUID();
      const body = {slots:[fresh(member.user_id)]};
      assert.equal((await create(body,key)).status,500);
      assert.deepEqual(await counts(),before);
      await fixture.query('DROP TRIGGER reject_event_mail ON email_outbox; DROP FUNCTION reject_event_mail()');
      assert.equal((await create(body,key)).status,201);
      const originalTime = time;
      const query = db.pool.connect.bind(db.pool);
      let expire = true;
      db.pool.connect = async function (...args) {
        const client = await query(...args);
        if (!args.length && expire) {
          const original = client.query;
          client.query = async function (sql,...params) {
            const result = await original.call(this,sql,...params);
            if (typeof sql==='string' && sql.startsWith('INSERT INTO api_idempotency')) {time+=IDLE_MS;expire=false;}
            return result;
          };
          const release = client.release;
          client.release = function (...args) {client.query=original;client.release=release;return release.apply(this,args);};
        }
        return client;
      };
      try {
        const savedCounts = await counts();
        assert.equal((await create()).status,401);
        assert.deepEqual(await counts(),savedCounts);
      } finally {db.pool.connect=query;time=originalTime;cookie=(await storedSession(leader)).cookie;}
    });

    await t.test('same-key concurrent creates and stale concurrent saves commit a single change', async () => {
      const key = randomUUID();
      const body = {slots:[fresh(member.user_id)]};
      const n = await effects();
      const [a,b] = await Promise.all([create(body,key),create(body,key)]);
      assert.equal(a.status,201);
      assert.deepEqual(a.body,b.body);
      assert.equal(await effects(),n+1);
      const results = await Promise.all([patch(a.body.data.event,{location:'One'}),patch(a.body.data.event,{location:'Two'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal(await effects(),n+2);
    });

    const respond = (event, status, reason, who = memberCookie, id = event.slots[0].invitation.invitationId, key) =>
      request(`${path}/${event.eventId}/invitations/${id}/response`,
        {expectedVersion:event.version,status,...(reason === undefined ? {} : {declineReason:reason})},who,'PUT',key);
    const history = async id => (await fixture.query('SELECT * FROM invitation_history WHERE invitation_id=$1 ORDER BY history_id',[id])).rows;
    const mailSince = async n => (await fixture.query(`SELECT kind,recipient_selector,recipient_user_id,recipient_band_id,payload
      FROM email_outbox WHERE notification_id>$1 ORDER BY notification_id`,[n])).rows;
    const lastMail = async () => (await fixture.query('SELECT COALESCE(max(notification_id),0)::int AS n FROM email_outbox')).rows[0].n;

    await t.test('own response transitions, private reasons, normalized no-ops and replay record only actual changes', async () => {
      let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id)]})).body.data.event;
      const id = current.slots[0].invitation.invitationId;
      const n = await lastMail();
      const key = randomUUID();
      const original = current;
      const accepted = await respond(current,'accepted',undefined,memberCookie,id,key);
      assert.equal(accepted.status,200,JSON.stringify(accepted.body));
      current = accepted.body.data.event;
      assert.equal(current.version,original.version+1);
      assert.equal(current.slots[0].invitation.status,'accepted');
      assert.equal(current.slots[1].invitation.status,'pending'); // Leader receives no implicit acceptance.
      assert.equal(current.slots[0].invitation.respondedAt,new Date(time).toISOString());
      assert.equal(current.slots[0].invitation.declineReason,null);
      assert.deepEqual((await respond(original,'accepted',undefined,memberCookie,id,key)).body,accepted.body);
      assert.deepEqual((await respond(current,'accepted')).body,accepted.body);
      assert.equal((await history(id)).length,1);
      const responseMail = await mailSince(n);
      assert.equal(responseMail.length,1);
      assert.equal(responseMail[0].kind,'invitation_response');
      assert.equal(responseMail[0].recipient_selector,'current_leader');
      assert.equal(responseMail[0].recipient_band_id,band.bandId);
      assert.equal(responseMail[0].recipient_user_id,null);
      current = (await respond(current,'declined','  Private  ')).body.data.event;
      assert.equal(current.slots[0].invitation.declineReason,'Private');
      const respondedAt = current.slots[0].invitation.respondedAt;
      const n2 = await lastMail();
      current = (await respond(current,'declined','  Revised  ')).body.data.event;
      assert.equal(current.slots[0].invitation.respondedAt,respondedAt);
      assert.equal(current.slots[0].invitation.declineReason,'Revised');
      assert.equal(await lastMail(),n2);
      assert.equal((await get(current)).body.data.event.slots[0].invitation.declineReason,'Revised');
      const otherView = (await get(current,outsiderCookie)).body.data.event;
      assert.equal(Object.hasOwn(otherView.slots[0].invitation,'declineReason'),false);
      assert.equal(JSON.stringify(await mailSince(n)).includes('Private'),false);
      assert.equal(JSON.stringify(await mailSince(n)).includes('Revised'),false);
      current = (await respond(current,'declined','  ')).body.data.event;
      assert.equal(current.slots[0].invitation.declineReason,null);
      const version = current.version;
      current = (await respond(current,'declined',null)).body.data.event;
      assert.equal(current.version,version);
      current = (await respond(current,'declined','  '+'x'.repeat(1000)+'  ')).body.data.event;
      const before = await counts();
      for (const [status,reason] of [['declined','x'.repeat(1001)],['accepted','no'],['accepted',''],['pending',null]]) {
        const result = await respond(current,status,reason);
        assert.equal(result.status,400,JSON.stringify(result.body));
        if (status !== 'pending') assert.equal(result.body.error.details[0].field,'declineReason');
      }
      assert.deepEqual(await counts(),before);
      current = (await respond(current,'accepted')).body.data.event;
      assert.equal(current.slots[0].invitation.declineReason,null);
      assert.deepEqual((await history(id)).map(h=>h.kind),['response','response','reason_changed','reason_changed','reason_changed','response']);
      const ownLeader = await respond(current,'declined',undefined,cookie,current.slots[1].invitation.invitationId);
      assert.equal(ownLeader.status,200);
      assert.equal(ownLeader.body.data.event.slots[1].invitation.status,'declined');
    });

    await t.test('only active current owners respond; retired, foreign and malformed IDs have zero effects', async () => {
      let current = (await create({hideFromUninvited:true})).body.data.event;
      const id = current.slots[0].invitation.invitationId;
      const foreign = (await create()).body.data.event;
      const before = await counts();
      for (const [who,invitationId] of [[cookie,id],[outsiderCookie,id],[memberCookie,foreign.slots[0].invitation.invitationId],
        [memberCookie,'01'],[memberCookie,'1x']]) {
        assert.ok([400,404].includes((await respond(current,'accepted',undefined,who,invitationId)).status));
      }
      const inactiveCookie = (await storedSession(member)).cookie;
      await fixture.query('UPDATE users SET is_active=false WHERE user_id=$1',[member.user_id]);
      assert.equal((await respond(current,'accepted',undefined,inactiveCookie)).status,401);
      await fixture.query('UPDATE users SET is_active=true WHERE user_id=$1',[member.user_id]);
      await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[band.bandId,member.user_id]);
      assert.equal((await respond(current,'accepted')).status,404);
      await fixture.query("INSERT INTO user_bands (band_id,user_id,role) VALUES ($1,$2,'member')",[band.bandId,member.user_id]);
      // Restore cascaded eligibility for later event fixtures.
      await fixture.query('INSERT INTO member_instruments (band_id,user_id,instrument_id) VALUES ($1,$2,$3),($1,$2,$4)',[band.bandId,member.user_id,guitar,vocals]);
      assert.deepEqual(await counts(),before);
      const replayKey = randomUUID();
      const accepted = await respond(current,'accepted',undefined,memberCookie,id,replayKey);
      assert.equal(accepted.status,200);
      current = accepted.body.data.event;
      current = (await patch(current,{slots:writeSlots(current).map(s=>({...s,userId:null}))})).body.data.event;
      const retiredCounts = await counts();
      assert.equal((await respond(current,'accepted',undefined,memberCookie,id)).status,404);
      assert.equal((await respond({...current,version:1},'accepted',undefined,memberCookie,id,replayKey)).status,404);
      assert.deepEqual(await counts(),retiredCounts);
    });

    await t.test('schedule reconfirmation compares local fields and both instants, preserving Pending/Declined and alias-only responses', async () => {
      for (const edit of [{date:'2030-11-22'},{startTime:'19:00'},{endTime:'21:00'},
        {timezone:'Europe/Paris'}, {startTime:'19:00',endTime:'21:00',timezone:'Europe/Paris'}, {date:'2030-11-22',startTime:'19:00',endTime:'21:00',timezone:'Europe/Paris'}]) {
        let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id),fresh(outsider.user_id)]})).body.data.event;
        current = (await respond(current,'accepted')).body.data.event;
        current = (await respond(current,'declined','Retain me',outsiderCookie,current.slots[2].invitation.invitationId)).body.data.event;
        const id = current.slots[0].invitation.invitationId;
        const n = await lastMail();
        const result = await patch(current,edit);
        assert.equal(result.status,200,JSON.stringify(result.body));
        current = result.body.data.event;
        assert.deepEqual(current.slots.map(s=>s.invitation.status),['pending','pending','declined']);
        assert.equal(current.slots[0].invitation.respondedAt,null);
        assert.equal(current.slots[2].invitation.declineReason,'Retain me');
        const h = await history(id);
        assert.deepEqual(h.map(row=>row.kind),['response','reconfirmation']);
        assert.equal(h[1].actor_user_id,leader.user_id);
        assert.equal(h[1].status,'pending');
        assert.deepEqual((await mailSince(n)).map(m=>[m.kind,m.recipient_user_id]),
          [['event_update',member.user_id],['event_update',leader.user_id]]);
      }
      let current = (await create({slots:[fresh(member.user_id)]})).body.data.event;
      current = (await respond(current,'accepted')).body.data.event;
      const n = await lastMail();
      const id = current.slots[0].invitation.invitationId;
      current = (await patch(current,{timezone:'Etc/UTC'})).body.data.event;
      assert.equal(current.slots[0].invitation.status,'accepted');
      assert.equal((await history(id)).length,1);
      assert.deepEqual((await mailSince(n)).map(m=>[m.kind,m.recipient_user_id]),[['event_update',member.user_id]]);
      const beforeGap = await counts();
      assert.equal((await patch(current,{date:'2031-03-09',startTime:'02:30',endTime:'04:00',timezone:'America/New_York'})).status,400);
      assert.deepEqual(await counts(),beforeGap);
      assert.equal((await get(current)).body.data.event.slots[0].invitation.status,'accepted');
      // Resolved instants alone also require reconfirmation, even with identical local fields.
      await fixture.query("UPDATE events SET ends_at=ends_at-interval '1 hour' WHERE event_id=$1",[current.eventId]);
      current = (await patch(current,{})).body.data.event;
      assert.equal(current.slots[0].invitation.status,'pending');
      assert.equal((await history(id)).length,2);
    });

    await t.test('combined detail/reassignment saves send only retained updates, removals and new invitations', async () => {
      let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id),fresh(outsider.user_id)]})).body.data.event;
      current = (await respond(current,'accepted')).body.data.event;
      current = (await respond(current,'declined',null,outsiderCookie,current.slots[2].invitation.invitationId)).body.data.event;
      current = (await respond(current,'accepted',undefined,cookie,current.slots[1].invitation.invitationId)).body.data.event;
      const n = await lastMail();
      const removedAcceptedId = current.slots[1].invitation.invitationId;
      const removedId = current.slots[2].invitation.invitationId;
      const result = await patch(current,{endTime:'21:00',location:'Other hall',slots:[
        writeSlots(current)[0],{...writeSlots(current)[1],userId:null},fresh(outsider.user_id)]});
      assert.equal(result.status,200,JSON.stringify(result.body));
      const saved = result.body.data.event;
      assert.equal(saved.slots[0].invitation.status,'pending');
      assert.equal(saved.slots[2].invitation.status,'pending');
      assert.notEqual(saved.slots[2].invitation.invitationId,removedId);
      assert.deepEqual((await mailSince(n)).map(m=>[m.kind,m.recipient_user_id]),[
        ['event_update',member.user_id],['event_removal',leader.user_id],['event_removal',outsider.user_id],['event_invitation',outsider.user_id]]);
      assert.equal((await history(removedAcceptedId)).length,1);
      assert.equal((await history(removedId)).length,1); // No reset on a retired Declined invitation.
      const n2 = await lastMail();
      const label = await patch(saved,{slots:writeSlots(saved).reverse().map(s=>({...s,label:'Label only'}))});
      assert.equal(label.status,200);
      assert.equal(await lastMail(),n2);
    });

    await t.test('stale, exact-start and expired-session response writes leave status/history/mail untouched', async () => {
      const current = (await create()).body.data.event;
      const before = await counts();
      assert.equal((await respond({...current,version:current.version+1},'accepted')).body.error.code,'STALE_VERSION');
      const originalTime = time;
      await fixture.query('UPDATE events SET starts_at=$2 WHERE event_id=$1',[current.eventId,new Date(time)]);
      assert.equal((await respond(current,'accepted')).body.error.code,'EVENT_STARTED');
      time++;
      assert.equal((await respond(current,'declined')).body.error.code,'EVENT_STARTED');
      time=originalTime;
      await fixture.query('UPDATE events SET starts_at=$2 WHERE event_id=$1',[current.eventId,current.startsAt]);
      const expired = await storedSession(member);
      time+=IDLE_MS;
      assert.equal((await respond(current,'accepted',null,expired.cookie)).status,401);
      time=originalTime;
      assert.deepEqual(await counts(),before);
      assert.equal((await get(current)).body.data.event.slots[0].invitation.status,'pending');
    });

    await t.test('response failures roll back, concurrent retries commit once and distinct responses reject stale versions', async () => {
      const current = (await create()).body.data.event;
      const before = await counts();
      await fixture.query(`CREATE FUNCTION reject_response_mail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test failure'; END $$;
        CREATE TRIGGER reject_response_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_response_mail()`);
      assert.equal((await respond(current,'accepted')).status,500);
      assert.deepEqual(await counts(),before);
      await fixture.query('DROP TRIGGER reject_response_mail ON email_outbox; DROP FUNCTION reject_response_mail()');
      const key = randomUUID();
      const [a,b] = await Promise.all([respond(current,'accepted',undefined,memberCookie,undefined,key),respond(current,'accepted',undefined,memberCookie,undefined,key)]);
      assert.equal(a.status,200);
      assert.deepEqual(a.body,b.body);
      assert.equal((await history(current.slots[0].invitation.invitationId)).length,1);
      const saved = a.body.data.event;
      const results = await Promise.all([respond(saved,'declined','One'),respond(saved,'declined','Two')]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await history(current.slots[0].invitation.invitationId)).length,2);
    });

    await t.test('response replay filters private reasons after leadership loss while preserving own reason and effects', async () => {
      let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id)]})).body.data.event;
      current = (await respond(current,'declined','Private member reason')).body.data.event;
      const id = current.slots[1].invitation.invitationId;
      const original = current, key = randomUUID();
      const saved = await respond(original,'declined','Own reason',cookie,id,key);
      assert.equal(saved.status,200);
      assert.equal(saved.body.data.event.slots[0].invitation.declineReason,'Private member reason');
      async function setLeader(userId) {
        await fixture.query('BEGIN');
        await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,userId]);
        await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[band.bandId,userId]);
        await fixture.query('COMMIT');
      }
      await setLeader(member.user_id);
      try {
        const before = await counts();
        const view = (await get(current,cookie)).body.data.event;
        assert.equal(Object.hasOwn(view.slots[0].invitation,'declineReason'),false);
        const replay = await respond(original,'declined','Own reason',cookie,id,key);
        assert.equal(replay.status,200);
        assert.equal(Object.hasOwn(replay.body.data.event.slots[0].invitation,'declineReason'),false);
        assert.equal(replay.body.data.event.slots[1].invitation.declineReason,'Own reason');
        assert.equal(replay.body.data.event.canManage,false);
        assert.equal(replay.body.data.event.version,saved.body.data.event.version);
        assert.deepEqual(await counts(),before);
      } finally { await setLeader(leader.user_id); }
    });

    const list = (who = memberCookie, bandId = band.bandId) => request(`/bands/${bandId}/events`, undefined, who, 'GET');
    const remove = (current, who = cookie, key, body = {expectedVersion: current.version}) =>
      request(`${path}/${current.eventId}`, body, who, 'DELETE', key);

    await t.test('list and direct reads share visibility, private reason and own invitation semantics', async () => {
      const uninvited = await account();
      const uninvitedCookie = (await storedSession(uninvited)).cookie;
      await fixture.query("INSERT INTO user_bands (band_id,user_id,role) VALUES ($1,$2,'member')", [band.bandId,uninvited.user_id]);
      let hidden = (await create({hideFromUninvited:true})).body.data.event;
      const visible = (await create()).body.data.event;
      for (const status of ['pending','accepted','declined']) {
        if (status !== 'pending') hidden = (await respond(hidden,status,status === 'declined' ? 'Private read reason' : undefined)).body.data.event;
        for (const [who,allowed,isLeader,own] of [[cookie,true,true,false],[memberCookie,true,false,true],[uninvitedCookie,false,false,false]]) {
          const rows = (await list(who)).body.data.events;
          const listed = rows.find(e=>e.eventId===hidden.eventId);
          const direct = await get(hidden,who);
          assert.equal(direct.status,allowed?200:404);
          assert.equal(Boolean(listed),allowed);
          if (allowed) {
            assert.deepEqual(listed,direct.body.data.event);
            assert.equal(listed.myInvitationId,own?hidden.slots[0].invitation.invitationId:null);
            assert.equal(listed.canManage,isLeader);
            assert.equal(listed.canRespond,own);
            assert.equal(listed.slots[0].invitation.status,status);
          }
          const publicView = rows.find(e=>e.eventId===visible.eventId);
          assert.ok(publicView);
          assert.equal(Object.hasOwn(publicView.slots[0].invitation,'declineReason'),isLeader || own);
        }
      }
      const publicDeclined = (await respond(visible,'declined','Another private reason')).body.data.event;
      for (const view of [(await get(publicDeclined,uninvitedCookie)).body.data.event,
        (await list(uninvitedCookie)).body.data.events.find(e=>e.eventId===visible.eventId)]) {
        assert.equal(Object.hasOwn(view.slots[0].invitation,'declineReason'),false);
      }
      hidden = (await patch(hidden,{slots:writeSlots(hidden).map(s=>({...s,userId:null}))})).body.data.event;
      assert.equal((await get(hidden,memberCookie)).status,404);
      assert.equal((await list()).body.data.events.some(e=>e.eventId===hidden.eventId),false);
      hidden = (await patch(hidden,{hideFromUninvited:false})).body.data.event;
      const removed = (await get(hidden,memberCookie)).body.data.event;
      assert.equal(removed.myInvitationId,null);
      assert.equal(removed.canRespond,false);
      await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[band.bandId,uninvited.user_id]);
      assert.equal((await list(uninvitedCookie)).status,404);
      assert.equal((await get(visible,uninvitedCookie)).status,404);
      const foreignBand = (await request('/bands',{name:'Foreign',instrumentation:[{instrumentId:2,label:'Guitar'}]},cookie)).body.data.band;
      assert.equal((await request(`/bands/${foreignBand.bandId}/events/${visible.eventId}`,undefined,cookie,'GET')).status,404);
    });

    await t.test('cross-band reads supply UTC chronology and datebook eligibility without automatic leader entry', async () => {
      const other = (await request('/bands',{name:'Cross band',instrumentation:[{instrumentId:2,label:'Guitar'}]},cookie)).body.data.band;
      const instrumentId = other.instrumentation[0].instrumentId;
      await request(`/bands/${other.bandId}/members`,{expectedVersion:other.version,username:member.username,instrumentIds:[instrumentId]},cookie);
      const first = (await create({startTime:'18:00',endTime:'19:00',timezone:'Asia/Tokyo'})).body.data.event;
      const second = (await request(`/bands/${other.bandId}/events`,{...base,startTime:'05:00',endTime:'06:00',timezone:'America/New_York',
        templateVersion:other.version+1,slots:[{clientKey:randomUUID(),instrumentId,label:'Guitar',userId:member.user_id}]},cookie)).body.data.event;
      const rows = [...(await list()).body.data.events,...(await list(memberCookie,other.bandId)).body.data.events];
      const selected = rows.filter(e=>[first.eventId,second.eventId].includes(e.eventId));
      const eligible = selected.filter(e=>e.startsAt>new Date(time).toISOString() && e.slots.some(s=>
        s.invitation?.invitationId===e.myInvitationId && ['pending','accepted'].includes(s.invitation.status)));
      eligible.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.bandId-b.bandId||a.eventId-b.eventId);
      assert.deepEqual(eligible.map(e=>e.eventId),[first.eventId,second.eventId]);
      assert.equal(first.startsAt,`${base.date}T09:00:00.000Z`);
      assert.equal(second.startsAt,`${base.date}T10:00:00.000Z`);
      assert.equal((await get(first)).body.data.event.myInvitationId,null);
    });

    await t.test('future cancellation retires all invitations, notifies only current Pending/Accepted and replays once', async () => {
      let current = (await create({slots:[fresh(member.user_id),fresh(leader.user_id),fresh(outsider.user_id)]})).body.data.event;
      current = (await respond(current,'accepted')).body.data.event;
      current = (await respond(current,'declined','Private',outsiderCookie,current.slots[2].invitation.invitationId)).body.data.event;
      const n = await lastMail(), key = randomUUID();
      const [a,b] = await Promise.all([remove(current,cookie,key),remove(current,cookie,key)]);
      assert.equal(a.status,200,JSON.stringify(a.body));
      assert.deepEqual(a.body,{data:{message:'Event deleted'}});
      assert.deepEqual(b.body,a.body);
      assert.deepEqual((await mailSince(n)).map(m=>[m.kind,m.recipient_user_id]).sort((a,b)=>a[1]-b[1]),
        [['event_cancellation',leader.user_id],['event_cancellation',member.user_id]]);
      const retired = (await fixture.query('SELECT * FROM event_invitations WHERE event_id=$1',[current.eventId])).rows;
      assert.ok(retired.every(i=>i.retired_at && i.retirement_cause==='cancelled'));
      assert.equal((await fixture.query('SELECT version FROM events WHERE event_id=$1',[current.eventId])).rows[0].version,current.version+1);
      for (const who of [cookie,memberCookie,outsiderCookie]) {
        assert.equal((await get(current,who)).status,404);
        assert.equal((await list(who)).body.data.events.some(e=>e.eventId===current.eventId),false);
      }
      const before = await counts();
      assert.equal((await remove(current)).status,404);
      assert.equal((await remove(current,cookie,key,{expectedVersion:current.version+1})).body.error.code,'IDEMPOTENCY_KEY_REUSED');
      assert.equal((await patch(current,{name:'No resurrection'})).status,404);
      assert.equal((await respond(current,'accepted')).status,404);
      assert.deepEqual(await counts(),before);
      await fixture.query('BEGIN');
      await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,member.user_id]);
      await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[band.bandId,member.user_id]);
      await fixture.query('COMMIT');
      try { assert.equal((await remove(current,cookie,key)).status,403); }
      finally {
        await fixture.query('BEGIN');
        await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,leader.user_id]);
        await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[band.bandId,leader.user_id]);
        await fixture.query('COMMIT');
      }
      assert.deepEqual(await counts(),before);
      await fixture.query("UPDATE api_idempotency SET created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day' WHERE idempotency_key=$1",[key]);
      assert.equal((await remove(current,cookie,key)).status,404);
    });

    await t.test('exact-start, in-progress and past deletion send no cancellation; stale/invalid/unauthorized writes do nothing', async () => {
      for (const offset of [0,-1,-86400000]) {
        const current = (await create()).body.data.event;
        await fixture.query('UPDATE events SET starts_at=$2 WHERE event_id=$1',[current.eventId,new Date(time+offset)]);
        const n = await lastMail();
        assert.equal((await get(current,memberCookie)).body.data.event.canRespond,false);
        assert.equal((await remove(current)).status,200);
        assert.equal(await lastMail(),n);
      }
      const current = (await create()).body.data.event;
      const before = await counts();
      assert.equal((await remove({...current,version:current.version+1})).body.error.code,'STALE_VERSION');
      assert.equal((await remove(current,memberCookie)).status,403);
      for (const body of [{},{expectedVersion:0},{expectedVersion:current.version,extra:true}]) assert.equal((await remove(current,cookie,undefined,body)).status,400);
      assert.deepEqual(await counts(),before);
      assert.equal((await get(current)).status,200);
      await fixture.query(`CREATE FUNCTION reject_cancellation_mail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test failure'; END $$;
        CREATE TRIGGER reject_cancellation_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_cancellation_mail()`);
      assert.equal((await remove(current)).status,500);
      await fixture.query('DROP TRIGGER reject_cancellation_mail ON email_outbox; DROP FUNCTION reject_cancellation_mail()');
      assert.deepEqual(await counts(),before);
      assert.equal((await get(current,memberCookie)).body.data.event.myInvitationId,current.slots[0].invitation.invitationId);
    });

    await t.test('fake delivery outage leaves the committed invitation intact and retries one stable effect', async () => {
      const current = (await create()).body.data.event;
      const {createDispatcher} = require('../utils/notification-outbox');
      const calls=[];
      let fail=true;
      const dispatcher=createDispatcher({pool:db.pool,origin:'http://client.example.test',from:'bandos@example.test',encryptionKey:key,
        clock:()=>time,random:()=>0.5,adapter:{send:async(payload,key)=>{calls.push({payload,key});return fail?{status:'transient'}:{status:'accepted',id:'fake-mail'};}}});
      // Isolate this test's effect while retaining earlier evidence.
      await fixture.query("UPDATE email_outbox SET state='suppressed' WHERE notification_id <> (SELECT max(notification_id) FROM email_outbox)");
      await dispatcher.dispatchOne();
      assert.equal((await get(current)).body.data.event.slots[0].invitation.invitationId,current.slots[0].invitation.invitationId);
      fail=false;
      time=+(await fixture.query('SELECT next_attempt_at FROM email_outbox ORDER BY notification_id DESC LIMIT 1')).rows[0].next_attempt_at;
      await dispatcher.dispatchOne();
      assert.equal(calls.length,2);
      assert.deepEqual(calls[0],calls[1]);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
