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

test('member eligibility and repairable default lineups', async t => {
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
    const cookie = (await storedSession(leader)).cookie;
    const memberCookie = (await storedSession(member)).cookie;
    const outsiderCookie = (await storedSession(outsider)).cookie;
    const create = (body, key) => request('/bands', body, cookie, 'POST', key);
    const detail = band => request(`/bands/${band.bandId}`, undefined, cookie, 'GET');
    const simple = { name: ' Band ', instrumentation: [{ instrumentId: 2, label: ' Guitar 1 ' }] };
    let band;
    const mutate = (band, suffix, body, method = 'PATCH', who = cookie, key) =>
      request(`/bands/${band.bandId}${suffix}`, { expectedVersion: band.version, ...body }, who, method, key);
    const add = (band, user, ids, key) => mutate(band, '/members', { username: user.username, instrumentIds: ids }, 'POST', cookie, key);
    const save = (band, assignments, key) => mutate(band, '/default-lineup', { assignments }, 'PUT', cookie, key);
    const edit = (band, user, ids) => mutate(band, `/members/${user.user_id}`, { instrumentIds: ids });
    const refresh = async () => { band = (await detail(band)).body.data.band; };

    await t.test('addition requires active verified musicians, own unique instruments, a version and strict inputs', async () => {
      band = (await create({ ...simple, leaderInstrumentIds: [1,2], instrumentation: [
        { instrumentId: 2, label: 'Guitar 1' }, { instrumentId: 2, label: 'Guitar 2' }] })).body.data.band;
      const other = (await create(simple)).body.data.band;
      const guitar = band.instrumentation[0].instrumentId;
      for (const target of [await account({verified:false}), await account({active:false}), {username:'unknown'}]) {
        const response = await add(band,target,[guitar]);
        assert.equal(response.status,404);
        assert.equal(response.body.error.code,'USER_NOT_FOUND');
      }
      for (const ids of [[],[guitar,guitar],[other.instruments[0].instrumentId],['2']]) {
        assert.equal((await add(band,member,ids)).status,400);
      }
      for (const body of [{username:member.username,instrumentIds:[guitar]},
        {username:member.username,instrumentIds:[guitar],expectedVersion:band.version,extra:true}]) {
        assert.equal((await request(`/bands/${band.bandId}/members`,body,cookie)).status,400);
      }
      assert.deepEqual((await detail(band)).body.data.band,band);
      const key = randomUUID();
      const ids = band.members[0].instrumentIds;
      const response = await add(band,member,ids,key);
      assert.equal(response.status,201);
      assert.deepEqual(response.body.data.member.instrumentIds,ids);
      assert.equal(response.body.data.band.version,band.version+1);
      assert.deepEqual((await add(band,member,ids,key)).body,response.body);
      assert.equal((await add(band,outsider,ids)).body.error.code,'STALE_VERSION');
      band = response.body.data.band;
      assert.equal((await add(band,member,ids)).body.error.code,'MEMBER_ALREADY_EXISTS');
      assert.equal((await add(band,leader,ids)).body.error.code,'MEMBER_ALREADY_EXISTS');
    });

    await t.test('complete repeated-instrument defaults require unique current eligible musicians and own slots', async () => {
      const assignments = band.instrumentation.map((slot,index) => ({slotId:slot.slotId,userId:index ? member.user_id : leader.user_id}));
      const foreign = (await create(simple)).body.data.band;
      for (const invalid of [[],[assignments[0]],[assignments[0],assignments[0]],
        assignments.map(a => ({...a,userId:leader.user_id})),
        [{...assignments[0],slotId:foreign.instrumentation[0].slotId},assignments[1]]]) {
        assert.equal((await save(band,invalid)).status,400);
      }
      assert.equal((await save(band,[assignments[0],{...assignments[1],userId:outsider.user_id}])).body.error.code,'DEFAULT_LINEUP_INVALID');
      const key = randomUUID();
      const response = await save(band,assignments,key);
      assert.equal(response.status,200);
      assert.deepEqual((await save(band,assignments,key)).body,response.body);
      assert.equal((await save(band,assignments)).body.error.code,'STALE_VERSION');
      assert.equal(response.body.data.band.version,band.version+1);
      band = response.body.data.band;
      assert.deepEqual(band.defaultLineup,{version:1,assignments,isApplicable:true,invalidReasons:[]});
      const noop = await save(band,[...assignments].reverse());
      assert.deepEqual(noop.body.data.band,band);
      const changed = await save(band,assignments.map((a,index) => ({...a,userId:index ? leader.user_id : member.user_id})));
      assert.equal(changed.body.data.band.defaultLineup.version,2);
      assert.equal(changed.body.data.band.version,band.version+1);
      band = changed.body.data.band;
    });

    await t.test('eligibility is a set; clearing a member or leader invalidates and restoring repairs the saved mapping', async () => {
      const before = band;
      const ids = band.members.find(m => m.userId === member.user_id).instrumentIds;
      assert.deepEqual((await edit(band,member,[...ids].reverse())).body.data.band,band);
      for (const user of [member,leader]) {
        const result = await edit(band,user,[]);
        assert.equal(result.status,200);
        assert.deepEqual(result.body.data.member.instrumentIds,[]);
        assert.equal(result.body.data.band.version,band.version+1);
        band = result.body.data.band;
        const assignment = band.defaultLineup.assignments.find(a => a.userId === user.user_id);
        assert.ok(band.defaultLineup.invalidReasons.some(r => r.code==='INSTRUMENT_INELIGIBLE' && r.slotId===assignment.slotId && r.userId===user.user_id));
        assert.equal(band.defaultLineup.isApplicable,false);
        assert.equal((await save(band,band.defaultLineup.assignments)).body.error.code,'DEFAULT_LINEUP_INVALID');
        assert.deepEqual((await edit(band,user,[])).body.data.band,band);
        band = (await edit(band,user,ids)).body.data.band;
        assert.equal(band.defaultLineup.isApplicable,true);
      }
      assert.equal(band.defaultLineup.version,before.defaultLineup.version);
      assert.deepEqual(band.defaultLineup.assignments,before.defaultLineup.assignments);
      const foreign = (await create(simple)).body.data.band;
      assert.equal((await edit(band,member,[foreign.instruments[0].instrumentId])).status,400);
      assert.equal((await edit(band,outsider,ids)).status,404);
      assert.equal((await mutate(band,`/members/0`,{instrumentIds:ids})).status,400);
      assert.equal((await edit(before,member,[])).body.error.code,'STALE_VERSION');
      await refresh();
      assert.equal(band.defaultLineup.isApplicable,true);
    });

    await t.test('template additions are missing, removals disappear, and changed instruments revalidate without rewriting mappings', async () => {
      const original = band.instrumentation.map(({position,...s}) => s);
      const saved = band.defaultLineup;
      band = (await mutate(band,'/instrumentation',{slots:[...original,{instrumentId:original[0].instrumentId,label:'Third'}]})).body.data.band;
      assert.equal(band.defaultLineup.isApplicable,false);
      assert.deepEqual(band.defaultLineup.invalidReasons,[{code:'MISSING_SLOT',slotId:band.instrumentation[2].slotId}]);
      assert.deepEqual(band.defaultLineup.assignments,saved.assignments);
      band = (await mutate(band,'/instrumentation',{slots:original})).body.data.band;
      assert.equal(band.defaultLineup.isApplicable,true);
      const bass = band.instruments.find(i => i.name==='Bass').instrumentId;
      band = (await mutate(band,'/instrumentation',{slots:[{...original[0],instrumentId:bass},original[1]]})).body.data.band;
      assert.equal(band.defaultLineup.invalidReasons[0].code,'INSTRUMENT_INELIGIBLE');
      band = (await mutate(band,'/instrumentation',{slots:[original[1]]})).body.data.band;
      assert.equal(band.defaultLineup.isApplicable,true);
      assert.deepEqual(band.defaultLineup.assignments,saved.assignments.filter(a => a.slotId===original[1].slotId));
      assert.equal(band.defaultLineup.version,saved.version);
    });

    await t.test('reads retain unavailable musicians for repair; clear is optional and idempotent', async () => {
      // Lifecycle transitions belong to ticket 16; simulate its committed removal.
      const assignment = band.defaultLineup.assignments[0];
      const replacement = {slotId:assignment.slotId,userId:member.user_id};
      band = (await save(band,[replacement])).body.data.band;
      await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[band.bandId,member.user_id]);
      await refresh();
      assert.deepEqual(band.defaultLineup.assignments,[replacement]);
      assert.deepEqual(band.defaultLineup.invalidReasons,[{code:'MEMBER_UNAVAILABLE',...replacement}]);
      assert.equal(band.defaultLineup.isApplicable,false);
      band = (await add(band,member,[band.instrumentation[0].instrumentId])).body.data.band;
      assert.equal(band.defaultLineup.isApplicable,true);
      await fixture.query('UPDATE users SET is_active=false WHERE user_id=$1',[member.user_id]);
      await refresh();
      assert.equal(band.defaultLineup.invalidReasons[0].code,'MEMBER_UNAVAILABLE');
      await fixture.query('UPDATE users SET is_active=true WHERE user_id=$1',[member.user_id]);
      await refresh();
      const old = band, key = randomUUID();
      const result = await mutate(band,'/default-lineup',{},'DELETE',cookie,key);
      assert.equal(result.status,200);
      assert.equal(result.body.data.band.defaultLineup,null);
      assert.equal(result.body.data.band.version,band.version+1);
      assert.deepEqual((await mutate(old,'/default-lineup',{},'DELETE',cookie,key)).body,result.body);
      assert.equal((await mutate(old,'/default-lineup',{},'DELETE')).body.error.code,'STALE_VERSION');
      band = result.body.data.band;
      assert.deepEqual((await mutate(band,'/default-lineup',{},'DELETE')).body.data.band,band);
    });

    await t.test('only current leader can mutate, including replay after ownership transfer', async () => {
      const suffixes = [
        ['/members',{username:outsider.username,instrumentIds:[band.instrumentation[0].instrumentId]},'POST'],
        [`/members/${member.user_id}`,{instrumentIds:[]},'PATCH'],
        ['/default-lineup',{assignments:[{slotId:band.instrumentation[0].slotId,userId:leader.user_id}]},'PUT'],
        ['/default-lineup',{},'DELETE'],
      ];
      for (const [suffix,body,method] of suffixes) {
        assert.equal((await mutate(band,suffix,body,method,memberCookie)).status,403);
        assert.equal((await mutate(band,suffix,body,method,outsiderCookie)).status,404);
        assert.equal((await mutate(band,suffix,{...body,extra:true},method)).status,400);
      }
      assert.equal((await request(`/bands/${band.bandId}`,undefined,memberCookie,'GET')).status,200);
      const key = randomUUID(), before = band;
      assert.equal((await mutate(band,'/default-lineup',{},'DELETE',cookie,key)).status,200);
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$2,version=version+1 WHERE band_id=$1',[band.bandId,member.user_id]);
      await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,member.user_id]);
      await fixture.query('COMMIT');
      assert.equal((await mutate(before,'/default-lineup',{},'DELETE',cookie,key)).status,403);
    });

    await t.test('competing additions and configuration serialize; target verification is rechecked after waiting', async () => {
      const fresh = (await create(simple)).body.data.band;
      const guitar = fresh.instrumentation[0].instrumentId;
      const results = await Promise.all([member,outsider].map(user => add(fresh,user,[guitar])));
      assert.deepEqual(results.map(r => r.status).sort(),[201,409]);
      const target = await account();
      const current = (await detail(fresh)).body.data.band;
      await fixture.query('BEGIN');
      await fixture.query('SELECT 1 FROM users WHERE user_id=$1 FOR UPDATE',[target.user_id]);
      const pending = add(current,target,[guitar]);
      try {
        let waiting = false;
        for (let n=0;n<100;n++) {
          await fixture.query('SELECT pg_stat_clear_snapshot()');
          waiting = (await fixture.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM users%'`)).rowCount > 0;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve,10));
        }
        assert.ok(waiting,'member addition reached the account lock');
        await fixture.query('UPDATE users SET email_verified_at=NULL WHERE user_id=$1',[target.user_id]);
        await fixture.query('COMMIT');
      } finally { await fixture.query('ROLLBACK'); }
      assert.equal((await pending).status,404);
      assert.deepEqual((await detail(fresh)).body.data.band,current);
    });

    await t.test('eligibility/default edits preserve issued assignments, snapshots and history and never enqueue mail', async () => {
      const fresh = (await create({...simple,leaderInstrumentIds:[2]})).body.data.band;
      const slot = fresh.instrumentation[0];
      const event = (await fixture.query(`INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,starts_at,ends_at,location)
        VALUES ($1,$2,'Snapshot','rehearsal','2030-01-01','12:00','13:00','UTC','2030-01-01T12:00Z','2030-01-01T13:00Z','Studio') RETURNING event_id`,[fresh.bandId,leader.user_id])).rows[0].event_id;
      const eventSlot = (await fixture.query(`INSERT INTO event_slots (band_id,event_id,template_slot_id,instrument_id,instrument_name,label,position)
        VALUES ($1,$2,$3,$4,'Guitar','Original',0) RETURNING slot_id`,[fresh.bandId,event,slot.slotId,slot.instrumentId])).rows[0].slot_id;
      await fixture.query(`INSERT INTO event_invitations (band_id,event_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES ($1,$2,$3,$4,'Leader','First','Last',$5,'Guitar','Original')`,[fresh.bandId,event,eventSlot,leader.user_id,slot.instrumentId]);
      await fixture.query(`INSERT INTO invitation_history (invitation_id,actor_user_id,kind,status)
        SELECT invitation_id,$1,'response','accepted' FROM event_invitations WHERE event_id=$2`,[leader.user_id,event]);
      const snapshots = async () => {
        const result = {};
        for (const table of ['events','event_slots','event_invitations','invitation_history']) result[table] = (await fixture.query(`SELECT * FROM ${table}`)).rows;
        return result;
      };
      const before = await snapshots();
      let current = (await save(fresh,[{slotId:slot.slotId,userId:leader.user_id}])).body.data.band;
      current = (await edit(current,leader,[])).body.data.band;
      assert.equal(current.defaultLineup.isApplicable,false);
      await mutate(current,'/default-lineup',{},'DELETE');
      assert.deepEqual(await snapshots(),before);
      assert.equal((await fixture.query('SELECT * FROM email_outbox')).rowCount,0);
    });

  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
});
