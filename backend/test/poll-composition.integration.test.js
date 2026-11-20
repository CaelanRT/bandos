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

test('revisioned rehearsal poll composition', async t => {
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
    let time = Date.UTC(2026, 10, 20, 12);
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
      date: `2026-11-${day}`, startTime, endTime });
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
    const counts = async () => (await fixture.query(`SELECT
      (SELECT count(*)::int FROM polls) AS polls,(SELECT count(*)::int FROM poll_slots) AS slots,
      (SELECT count(*)::int FROM poll_assignments) AS assignments,(SELECT count(*)::int FROM email_outbox) AS emails,
      (SELECT count(*)::int FROM poll_option_revisions) AS revisions,
      (SELECT count(*)::int FROM api_idempotency) AS replays`)).rows[0];
    const effects = async (after = 0) => (await fixture.query(`SELECT kind,recipient_user_id FROM email_outbox
      WHERE notification_id > $1 ORDER BY notification_id`,[after])).rows;
    const lastEffect = async () => (await fixture.query('SELECT coalesce(max(notification_id),0) AS id FROM email_outbox')).rows[0].id;
    async function seedVotes(poll) {
      const assignments = (await fixture.query('SELECT * FROM poll_assignments WHERE poll_id=$1 AND retired_at IS NULL',[poll.pollId])).rows;
      for (const a of assignments) {
        await fixture.query('INSERT INTO poll_vote_rows (assignment_id,poll_id) VALUES ($1,$2)',[a.assignment_id,poll.pollId]);
        for (const o of poll.options) await fixture.query(`INSERT INTO poll_vote_cells
          (assignment_id,poll_id,option_id,option_revision,answer) VALUES ($1,$2,$3,$4,'yes')`,[a.assignment_id,poll.pollId,o.optionId,o.revision]);
      }
    }
    let poll;
    await t.test('creation returns the exact projection, blank rows, immutable snapshots, and idempotent IDs without scheduled events', async () => {
      const body = { slots: [{...fresh(member.user_id), templateSlotId:band.instrumentation[0].slotId},fresh(leader.user_id)], options:[option(),option(22)] };
      const key = randomUUID();
      const result = await create(body,key);
      assert.equal(result.status,201,JSON.stringify(result.body));
      poll = result.body.data.poll;
      assert.deepEqual(Object.keys(poll).sort(), ['pollId','bandId','version','name','location','description','timezone','state',
        'hideFromUninvited','slots','options','responses','finalizedEventId','createdAt','updatedAt','canManage','canVote'].sort());
      assert.equal(poll.name,'Poll'); assert.equal(poll.location,'Hall'); assert.equal(poll.state,'open');
      assert.equal(poll.finalizedEventId,null); assert.equal(poll.canManage,true); assert.equal(poll.canVote,true);
      assert.equal(poll.options[0].startsAt,'2026-11-21T18:00:00.000Z');
      assert.equal(poll.options[0].revision,1); assert.equal(poll.slots[0].templateSlotId,band.instrumentation[0].slotId);
      assert.deepEqual(poll.responses.map(r=>[r.voteVersion,r.answers,r.needsResponse]),[[0,[],true],[0,[],true]]);
      assert.equal((await get(poll,memberCookie)).body.data.poll.canManage,false);
      const before = await counts();
      assert.deepEqual((await create(body,key)).body,result.body); assert.deepEqual(await counts(),before);
      assert.equal((await create({...body,name:'Other'},key)).body.error.code,'IDEMPOTENCY_KEY_REUSED');
      assert.equal((await fixture.query('SELECT count(*)::int AS n FROM events')).rows[0].n,0);
      assert.deepEqual((await request(`/bands/${band.bandId}/events`,undefined,memberCookie,'GET')).body.data.events,[]);
      await fixture.query("UPDATE template_slots SET label='New template' WHERE slot_id=$1",[band.instrumentation[0].slotId]);
      assert.equal((await get(poll)).body.data.poll.slots[0].label,'Guitar');
    });

    await t.test('normalized no-ops, ordering, labels and metadata preserve valid answers and do not notify', async () => {
      await seedVotes(poll); poll=(await get(poll)).body.data.poll;
      const before=await counts(), key=randomUUID();
      const result=await patch(poll,{name:' Poll ',slots:writeSlots(poll),options:writeOptions(poll)},cookie,key);
      assert.equal(result.status,200,JSON.stringify(result.body)); assert.deepEqual(result.body.data.poll,poll);
      assert.equal((await counts()).emails,before.emails); assert.equal((await counts()).revisions,before.revisions);
      const original=poll;
      poll=(await patch(poll,{slots:writeSlots(poll).reverse().map(s=>({...s,label:'Renamed'})),options:writeOptions(poll).reverse(),description:'New details'})).body.data.poll;
      assert.equal(poll.version,original.version+1);
      assert.deepEqual(poll.options,original.options.toReversed());
      assert.ok(poll.responses.every(r=>r.voteVersion===1 && r.answers.length===2 && !r.needsResponse));
      assert.equal((await counts()).emails,before.emails);
      assert.deepEqual((await patch(poll,{})).body.data.poll,poll);
    });

    await t.test('only changed option revisions invalidate answers; additions/deletions affect retained recipients', async () => {
      const before=poll, start=await lastEffect();
      const result=await patch(poll,{options:writeOptions(poll).map((o,i)=>i===0?{...o,endTime:'21:00'}:o)});
      assert.equal(result.status,200,JSON.stringify(result.body)); poll=result.body.data.poll;
      assert.equal(poll.options[0].revision,before.options[0].revision+1); assert.deepEqual(poll.options[1],before.options[1]);
      assert.ok(poll.responses.every(r=>r.voteVersion===1 && r.answers.length===1 && r.needsResponse));
      assert.ok(poll.responses.every(r=>r.answers[0].optionId===poll.options[1].optionId));
      assert.equal((await effects(start)).filter(e=>e.kind==='poll_update').length,2);
      poll=(await patch(poll,{options:[writeOptions(poll)[1],option(23)]})).body.data.poll;
      assert.equal(poll.options[0].revision,1); assert.equal(poll.options[1].revision,1);
      assert.ok(poll.responses.every(r=>r.answers.length===1 && r.needsResponse));
      poll=(await patch(poll,{options:[writeOptions(poll)[0]]})).body.data.poll;
      assert.ok(poll.responses.every(r=>r.answers.length===1 && !r.needsResponse));
      assert.ok((await fixture.query('SELECT 1 FROM poll_options WHERE poll_id=$1 AND deleted_at IS NOT NULL',[poll.pollId])).rowCount>0);
    });

    await t.test('representation-only timezone changes retain revisions; meaningful timezone changes recompute and notify', async () => {
      const start=await lastEffect(), before=poll;
      poll=(await patch(poll,{timezone:'Etc/UTC'})).body.data.poll;
      assert.deepEqual(poll.options,before.options); assert.deepEqual(poll.responses,before.responses);
      assert.deepEqual(await effects(start),[]);
      const result=await patch(poll,{timezone:'America/New_York'});
      assert.equal(result.status,200,JSON.stringify(result.body)); poll=result.body.data.poll;
      assert.equal(poll.options[0].revision,before.options[0].revision+1);
      assert.equal(poll.options[0].startsAt,'2026-11-21T23:00:00.000Z');
      assert.ok(poll.responses.every(r=>r.answers.length===0 && r.needsResponse));
      assert.equal((await effects(start)).length,2);
    });

    await t.test('removed, moved, replaced and re-added generations never inherit votes; recipient precedence is per generation', async () => {
      let current=(await create()).body.data.poll; await seedVotes(current);
      const beforeAssignments=(await fixture.query('SELECT * FROM poll_assignments WHERE poll_id=$1',[current.pollId])).rows;
      const start=await lastEffect();
      // Retain the member; replace the leader with an empty slot plus a new leader slot while adding an option.
      current=(await patch(current,{options:[...writeOptions(current),option(23)],
        slots:[writeSlots(current)[0],{...writeSlots(current)[1],userId:null},fresh(leader.user_id)]})).body.data.poll;
      const mail=await effects(start);
      assert.deepEqual(mail.map(e=>[e.kind,e.recipient_user_id]),[
        ['poll_update',member.user_id],['poll_removal',leader.user_id],['poll_invitation',leader.user_id]]);
      assert.equal(current.responses.find(r=>r.userId===member.user_id).answers.length,2);
      assert.deepEqual(current.responses.find(r=>r.userId===leader.user_id),{userId:leader.user_id,voteVersion:0,answers:[],needsResponse:true});
      const retired=(await fixture.query('SELECT * FROM poll_assignments WHERE assignment_id=$1',[beforeAssignments[1].assignment_id])).rows[0];
      assert.ok(retired.retired_at);
      current=(await patch(current,{slots:writeSlots(current).map(s=>({...s,userId:null}))})).body.data.poll;
      assert.deepEqual(current.responses,[]);
      current=(await patch(current,{slots:[{...writeSlots(current)[0],userId:member.user_id}]})).body.data.poll;
      assert.deepEqual(current.responses,[{userId:member.user_id,voteVersion:0,answers:[],needsResponse:true}]);
      current=(await patch(current,{slots:[{...writeSlots(current)[0],instrumentId:vocals}]})).body.data.poll;
      assert.equal(current.responses[0].voteVersion,0);
      const active=(await fixture.query('SELECT * FROM poll_assignments WHERE poll_id=$1 AND retired_at IS NULL',[current.pollId])).rows;
      assert.equal(active.length,1); assert.notEqual(active[0].assignment_id,beforeAssignments[0].assignment_id);
    });

    await t.test('option/slot boundaries and malformed or foreign IDs reject atomically', async () => {
      const foreign=(await create()).body.data.poll;
      const before=await counts();
      const cases=[{options:[]},{options:Array.from({length:31},(_,i)=>({...option(),date:`2027-01-${String(i+1).padStart(2,'0')}`}))},
        {slots:[]},{slots:Array.from({length:51},()=>fresh())},{slots:[fresh()]},
        {options:[option(),option()]},{options:[{...option(),optionId:1}]},{options:[{...writeOptions(foreign)[0]}]},
        {slots:[{...fresh(member.user_id),slotId:1}]},{slots:[{...writeSlots(foreign)[0]}]},
        {slots:[fresh(member.user_id,999999)]},{slots:[{...fresh(member.user_id),templateSlotId:999999}]},
        {slots:[fresh(outsider.user_id)]},{slots:[fresh(member.user_id),fresh(member.user_id)]},
        {options:[{...option(),extra:true}]},{extra:true},{options:[option(20,'11:00','13:00')]},
        {timezone:'America/New_York',options:[{...option(),date:'2027-03-14',startTime:'02:30',endTime:'04:00'}]}];
      for(const body of cases){const r=await create(body);assert.equal(r.status,400,JSON.stringify({body,result:r.body}));assert.equal(r.body.error.code,'VALIDATION_ERROR');}
      for(const body of [{options:[]},{slots:[]},{options:[{...writeOptions(foreign)[0]}]},
        {options:[writeOptions(poll)[0],writeOptions(poll)[0]]}, {slots:[{...writeSlots(foreign)[0]}]}]) {
        const r=await patch(poll,body); assert.equal(r.status,400,JSON.stringify(r.body));
      }
      assert.deepEqual(await counts(),before);
      const valid=await create({slots:Array.from({length:50},(_,i)=>fresh(i===0?member.user_id:null)),
        options:Array.from({length:30},(_,i)=>({...option(),date:`2027-01-${String(i+1).padStart(2,'0')}`}))});
      assert.equal(valid.status,201,JSON.stringify(valid.body)); assert.equal(valid.body.data.poll.options.length,30);
      const overlap=await create({timezone:'America/New_York',options:[{...option(),date:'2027-11-07',startTime:'01:30',endTime:'02:30'}]});
      assert.equal(overlap.status,201);assert.equal(overlap.body.data.poll.options[0].startsAt,'2027-11-07T05:30:00.000Z');
    });

    await t.test('hidden list/detail and cross-band protection require current membership; only leaders manage', async () => {
      const visible=(await create()).body.data.poll, hidden=(await create({hideFromUninvited:true,slots:[fresh(member.user_id)]})).body.data.poll;
      await fixture.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')",[outsider.user_id,band.bandId]);
      assert.equal((await get(visible,outsiderCookie)).status,200); assert.equal((await get(hidden,outsiderCookie)).status,404);
      assert.equal((await get(hidden,memberCookie)).status,200);
      const list=(await request(path,undefined,outsiderCookie,'GET')).body.data.polls;
      assert.ok(list.some(p=>p.pollId===visible.pollId));assert.ok(!list.some(p=>p.pollId===hidden.pollId));
      assert.deepEqual(Object.keys(list[0]).sort(),['pollId','name','state','hideFromUninvited','finalizedEventId','updatedAt'].sort());
      assert.equal((await patch(hidden,{name:'Forbidden'},outsiderCookie)).status,404);
      assert.equal((await patch(visible,{name:'Forbidden'},memberCookie)).status,403);
      assert.equal((await create({},undefined,memberCookie)).status,403);
      const foreignBand=(await request('/bands',{name:'Other',instrumentation:[{instrumentId:2,label:'Guitar'}]},cookie)).body.data.band;
      assert.equal((await request(`/bands/${foreignBand.bandId}/polls/${visible.pollId}`,undefined,cookie,'GET')).status,404);
      assert.equal((await request(`/bands/${foreignBand.bandId}/polls/${visible.pollId}`,{expectedVersion:1,name:'No'},cookie,'PATCH')).status,404);
      const removed=(await patch(hidden,{slots:writeSlots(hidden).map(s=>({...s,userId:null}))})).body.data.poll;
      assert.equal((await get(removed,memberCookie)).status,404);
      await fixture.query('DELETE FROM member_instruments WHERE band_id=$1 AND user_id=$2',[band.bandId,outsider.user_id]);
      await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[band.bandId,outsider.user_id]);
      assert.equal((await get(visible,outsiderCookie)).status,404);
      assert.equal((await request(path,undefined,outsiderCookie,'GET')).status,404);
    });

    await t.test('stale and racing composition saves have one winner and no duplicate effects; replay rechecks ownership', async () => {
      let current=(await create()).body.data.poll;
      const before=await counts();
      assert.equal((await patch(current,{expectedVersion:99,name:'Stale'})).body.error.code,'STALE_VERSION');
      assert.equal((await create({templateVersion:99})).body.error.code,'STALE_VERSION'); assert.deepEqual(await counts(),before);
      const key=randomUUID(), body={options:[...writeOptions(current),option(23)]};
      const results=await Promise.all([patch(current,body,cookie,key),patch(current,body,cookie,key)]);
      assert.deepEqual(results[0],results[1]); assert.equal(results[0].status,200);
      const race=await Promise.all([patch(results[0].body.data.poll,{name:'First'}),patch(results[0].body.data.poll,{name:'Second'})]);
      assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
      assert.equal((await counts()).emails,before.emails+2);
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[band.bandId,member.user_id]);
      await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,member.user_id]);
      await fixture.query('COMMIT');
      assert.equal((await patch(current,body,cookie,key)).status,403);
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[band.bandId,leader.user_id]);
      await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,leader.user_id]);
      await fixture.query('COMMIT');
    });

    await t.test('elapsed options remain open unchanged; changed or added elapsed options fail; closed snapshots reject edits', async () => {
      let current=(await create({options:[option(20,'13:00','14:00')]})).body.data.poll;
      time=Date.UTC(2026,10,20,15);
      const start=await lastEffect();
      current=(await patch(current,{name:'Elapsed'})).body.data.poll;
      assert.equal(current.state,'open');assert.deepEqual(await effects(start),[]);
      assert.equal((await patch(current,{options:writeOptions(current)})).body.data.poll.version,current.version);
      const before=await counts();
      assert.equal((await patch(current,{options:[{...writeOptions(current)[0],endTime:'16:00'}]})).status,400);
      assert.equal((await patch(current,{options:[...writeOptions(current),option(20,'14:00','16:00')]})).status,400);
      assert.deepEqual(await counts(),before);
      await fixture.query("UPDATE polls SET state='cancelled',closed_at=now() WHERE poll_id=$1",[current.pollId]);
      const closed=(await get(current)).body.data.poll;
      assert.equal(closed.canVote,false); assert.deepEqual(closed.options,current.options);
      assert.equal((await patch(current,{name:'Reopen'})).body.error.code,'POLL_CLOSED'); assert.deepEqual(await counts(),before);
      // Finalized fixtures preserve the same closing representation; finalization itself belongs to BE-V2-15.
      const event=(await fixture.query(`INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,
        location,starts_at,ends_at) VALUES ($1,$2,'Final','rehearsal','2026-11-21','18:00','20:00','UTC','Hall',
        '2026-11-21T18:00Z','2026-11-21T20:00Z') RETURNING event_id`,[band.bandId,leader.user_id])).rows[0];
      await fixture.query(`UPDATE polls SET state='finalized',finalized_event_id=$2,finalized_option_id=$3,finalized_option_revision=1
        WHERE poll_id=$1`,[current.pollId,event.event_id,current.options[0].optionId]);
      assert.equal((await patch(current,{})).body.error.code,'POLL_CLOSED');
      assert.deepEqual((await get(current)).body.data.poll.options,current.options);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
