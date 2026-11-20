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
      const gap = await create({date:'2027-03-14',startTime:'02:30',endTime:'04:00',timezone:'America/New_York'});
      assert.equal(gap.status,400);
      const overlap = await create({date:'2027-11-07',startTime:'01:30',endTime:'03:00',timezone:'America/New_York'});
      assert.equal(overlap.status,201,JSON.stringify(overlap.body));
      assert.equal(overlap.body.data.event.startsAt,'2027-11-07T05:30:00.000Z');
      assert.equal((await create({startTime:'20:00',endTime:'18:00'})).status,400);
      const current = (await create()).body.data.event;
      const originalTime = time;
      await fixture.query('UPDATE events SET starts_at=$2 WHERE event_id=$1',[current.eventId,new Date(time)]);
      const before = await counts();
      assert.equal((await patch(current,{date:'2027-12-01'})).body.error.code,'EVENT_STARTED');
      time++;
      assert.equal((await patch(current,{date:'2027-12-01'})).body.error.code,'EVENT_STARTED');
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

    await t.test('fake delivery outage leaves the committed invitation intact and retries one stable effect', async () => {
      time=Date.now();
      const current = (await create()).body.data.event;
      time=Date.now();
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
