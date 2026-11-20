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

test('band catalogs and instrumentation', async t => {
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
    const configure = (band, suffix, body, who = cookie, key) => request(`/bands/${band.bandId}${suffix}`,
      { expectedVersion: band.version, ...body }, who, suffix === '/instruments' ? 'POST' : 'PATCH', key);
    const simple = { name: ' Band ', instrumentation: [{ instrumentId: 2, label: ' Guitar 1 ' }] };
    let band;

    await t.test('starter catalog and band creation require active verified accounts', async () => {
      for (const user of [await account({ verified: false }), await account({ active: false })]) {
        const s = await storedSession(user);
        for (const result of [await request('/instruments', undefined, s.cookie, 'GET'),
          await request('/bands', simple, s.cookie)]) {
          assert.equal(result.status, user.is_active ? 403 : 401);
        }
      }
      assert.equal((await request('/instruments', undefined, undefined, 'GET')).status, 401);
      const starters = await request('/instruments', undefined, cookie, 'GET');
      assert.equal(starters.status, 200);
      assert.deepEqual(starters.body.data.instruments.map(i => i.name),
        ['Vocals','Guitar','Bass','Drums','Keyboards','Piano','Percussion','Saxophone','Trumpet','Trombone','Violin','Cello']);
    });

    await t.test('starter creation is atomic and retryable, with stable catalog/slots/member eligibility and versioned reads', async () => {
      const key = randomUUID();
      const body = { ...simple, leaderInstrumentIds: [1, 2], instrumentation: [
        ...simple.instrumentation, { instrumentId: 2, label: 'Guitar 2' }, { instrumentId: 1, label: 'Vocals' }] };
      const result = await create(body, key);
      assert.equal(result.status, 201);
      band = result.body.data.band;
      assert.deepEqual((await create(body, key)).body, result.body);
      assert.equal((await create({ ...body, name: 'different' }, key)).body.error.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal(band.name, 'Band');
      assert.equal(band.version, 1);
      assert.equal(band.defaultLineup, null);
      assert.equal(band.instruments.length, 12);
      assert.deepEqual(band.instrumentation.map(s => [s.label, s.position]), [['Guitar 1',0],['Guitar 2',1],['Vocals',2]]);
      assert.equal(band.instrumentation[0].instrumentId, band.instrumentation[1].instrumentId);
      assert.equal(new Set(band.instrumentation.map(s => s.slotId)).size, 3);
      assert.deepEqual(band.members[0].instrumentIds, band.instruments.filter(i => ['Vocals','Guitar'].includes(i.name)).map(i => i.instrumentId));
      assert.deepEqual((await detail(band)).body.data.band, band);
      const listed = (await request('/bands', undefined, cookie, 'GET')).body.data.bands.find(b => b.bandId === band.bandId);
      assert.equal(listed.version, 1);
      assert.equal(listed.members, undefined);
    });

    await t.test('creation replay cannot expose a deleted band or one the creator no longer belongs to', async () => {
      for (const lostAccess of ['deleted','removed']) {
        const key = randomUUID();
        const created = (await create(simple,key)).body.data.band;
        if (lostAccess === 'deleted') {
          assert.equal((await request(`/bands/${created.bandId}`, {}, cookie, 'DELETE')).status,200);
        } else {
          await fixture.query('BEGIN');
          await fixture.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')",[member.user_id,created.bandId]);
          await fixture.query('UPDATE bands SET owner_user_id=$2 WHERE band_id=$1',[created.bandId,member.user_id]);
          await fixture.query("UPDATE user_bands SET role='leader' WHERE band_id=$1 AND user_id=$2",[created.bandId,member.user_id]);
          await fixture.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2',[created.bandId,leader.user_id]);
          await fixture.query('COMMIT');
        }
        assert.equal((await detail(created)).status,404);
        const replay = await create(simple,key);
        assert.equal(replay.status,404);
        assert.equal(replay.body.error.code,'BAND_NOT_FOUND');
      }
    });

    await t.test('custom-only creation shares repeated normalized names, and starter-name customs reuse the catalog', async () => {
      const result = await create({ name: 'Custom', instrumentation: [
        { instrumentName: ' Theremin ', label: 'First' }, { instrumentName: 'THEREMIN', label: 'Second' },
        { instrumentName: 'guitar', label: 'Third' }] });
      assert.equal(result.status, 201);
      const custom = result.body.data.band;
      assert.equal(custom.instruments.length, 13);
      assert.equal(custom.instrumentation[0].instrumentId, custom.instrumentation[1].instrumentId);
      assert.equal(custom.instruments.find(i => i.instrumentId === custom.instrumentation[2].instrumentId).name, 'Guitar');
      assert.deepEqual(custom.members[0].instrumentIds, []);
      const eligible = await create({ ...simple, leaderInstrumentIds: [2] });
      assert.equal(eligible.status, 201);
      assert.notEqual(eligible.body.data.band.members[0].instrumentIds[0], 2, 'starter IDs translate to the new band catalog');
      assert.equal(eligible.body.data.band.members[0].instrumentIds[0], eligible.body.data.band.instrumentation[0].instrumentId);
    });

    await t.test('slot/name boundaries and strict identifiers fail without partial band/catalog/membership/replay writes', async () => {
      const count = async () => (await fixture.query(`SELECT
        (SELECT count(*) FROM bands) AS bands,(SELECT count(*) FROM instruments) AS instruments,
        (SELECT count(*) FROM template_slots) AS slots,(SELECT count(*) FROM user_bands) AS members,
        (SELECT count(*) FROM api_idempotency) AS replays`)).rows[0];
      const before = await count();
      for (const instrumentation of [[], Array(51).fill(simple.instrumentation[0])]) {
        const result = await create({ ...simple, instrumentation });
        assert.equal(result.status, 400);
        assert.equal(result.body.error.details[0].field, 'instrumentation');
      }
      for (const body of [
        { ...simple, name: ' ' }, { ...simple, name: 'x'.repeat(51) }, { ...simple, extra: true },
        { ...simple, instrumentation: [{ instrumentId: 2, instrumentName: 'Name', label: 'Label' }] },
        { ...simple, instrumentation: [{ label: 'Label' }] },
        { ...simple, instrumentation: [{ instrumentName: ' ', label: 'Label' }] },
        { ...simple, instrumentation: [{ instrumentName: 'x'.repeat(51), label: 'Label' }] },
        { ...simple, instrumentation: [{ instrumentId: 2, label: ' ' }] },
        { ...simple, instrumentation: [{ instrumentId: 2, label: 'x'.repeat(51) }] },
        { ...simple, leaderInstrumentIds: [2,2] }, { ...simple, leaderInstrumentIds: [999999] },
        { ...simple, instrumentation: [{ instrumentName: 'Rollback custom', label: 'Valid' }, { instrumentId: 999999, label: 'Invalid' }] },
      ]) assert.equal((await create(body)).status, 400, JSON.stringify(body));
      assert.deepEqual(await count(), before);
      // Force failure at deferred COMMIT after every creation write has run.
      await fixture.query(`CREATE FUNCTION reject_test_band() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.name='Commit rollback' THEN RAISE EXCEPTION 'test commit failure'; END IF; RETURN NULL; END $$;
        CREATE CONSTRAINT TRIGGER reject_test_band AFTER INSERT ON bands
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_test_band()`);
      const log = console.error; console.error = () => {};
      try { assert.equal((await create({ ...simple, name: 'Commit rollback' })).status, 500); }
      finally { console.error = log; }
      assert.deepEqual(await count(), before);
      await fixture.query('DROP TRIGGER reject_test_band ON bands; DROP FUNCTION reject_test_band()');
      const max = await create({ name: 'x'.repeat(50), instrumentation: Array.from({length:50}, () => ({ instrumentName:'y'.repeat(50),label:'z'.repeat(50) })) });
      assert.equal(max.status, 201);
      assert.equal(max.body.data.band.instrumentation.length, 50);
    });

    await t.test('catalog additions and normalized no-ops, stale saves, and exact retry replay', async () => {
      const key = randomUUID();
      const first = await configure(band, '/instruments', { name: ' Theremin ' }, cookie, key);
      assert.equal(first.status, 201);
      assert.equal(first.body.data.band.version, band.version + 1);
      assert.deepEqual((await configure(band, '/instruments', { name: ' Theremin ' }, cookie, key)).body, first.body);
      assert.equal((await configure(band, '/instruments', { name: 'Other' })).body.error.code, 'STALE_VERSION');
      band = first.body.data.band;
      const duplicate = await configure(band, '/instruments', { name: 'THEREMIN' });
      assert.equal(duplicate.status, 201);
      assert.deepEqual(duplicate.body.data.instrument, first.body.data.instrument);
      assert.deepEqual(duplicate.body.data.band, band);
      const noop = await configure(band, '', { name: ' Band ' });
      assert.deepEqual(noop.body.data.band, band);
      const renamed = await configure(band, '', { name: 'Renamed' });
      assert.equal(renamed.body.data.band.version, band.version + 1);
      assert.equal((await configure(band, '', { name: 'Stale' })).body.error.code, 'STALE_VERSION');
      band = renamed.body.data.band;
      assert.equal((await detail(band)).body.data.band.name, 'Renamed');
      assert.equal((await request('/bands', undefined, cookie, 'GET')).body.data.bands.find(b => b.bandId === band.bandId).version, band.version);
    });

    await t.test('template replacement keeps IDs, ordering and repeats; rejects foreign IDs and slot bounds', async () => {
      const other = (await create(simple)).body.data.band;
      const save = slots => configure(band, '/instrumentation', { slots });
      const original = band.instrumentation.map(({position,...slot}) => slot);
      for (const slots of [[], Array(51).fill(original[0])]) {
        const result = await save(slots);
        assert.equal(result.status, 400);
        assert.equal(result.body.error.details[0].field, 'slots');
      }
      for (const slots of [[original[0],original[0]], [{ ...original[0], slotId: other.instrumentation[0].slotId }],
        [{ ...original[0], instrumentId: other.instruments[0].instrumentId }], [{...original[0], label:' '}],
        [{...original[0], label:'x'.repeat(51)}], [{...original[0], extra:true}]]) {
        assert.equal((await save(slots)).status, 400);
      }
      assert.deepEqual((await detail(band)).body.data.band, band);
      const noop = await save(original.map(s => ({...s,label:` ${s.label} `})));
      assert.deepEqual(noop.body.data.band, band);
      const slots = [original[1], {...original[0], label:'Changed'}, { instrumentId:original[0].instrumentId,label:'New' }];
      const result = await save(slots);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.band.version, band.version + 1);
      assert.deepEqual(result.body.data.band.instrumentation.slice(0,2).map(s => s.slotId), [original[1].slotId, original[0].slotId]);
      assert.ok(!band.instrumentation.some(s => s.slotId === result.body.data.band.instrumentation[2].slotId));
      assert.deepEqual(result.body.data.band.instrumentation.map(s => s.position), [0,1,2]);
      assert.equal((await save(original)).body.error.code, 'STALE_VERSION');
      band = result.body.data.band;
      const fifty = await save(Array.from({length:50}, () => ({instrumentId:original[0].instrumentId,label:'Empty slot'})));
      assert.equal(fifty.status, 200);
      assert.equal(fifty.body.data.band.instrumentation.length, 50);
      band = fifty.body.data.band;
    });

    await t.test('membership and current owner protect all configurations including replay', async () => {
      await fixture.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')", [member.user_id, band.bandId]);
      assert.deepEqual((await request(`/bands/${band.bandId}`, undefined, memberCookie, 'GET')).body.data.band.members.find(m => m.userId === member.user_id).instrumentIds, []);
      for (const [suffix,body] of [['',{name:'No'}],['/instruments',{name:'No'}],['/instrumentation',{slots:[{instrumentId:band.instruments[0].instrumentId,label:'No'}]}]]) {
        assert.equal((await configure(band,suffix,body,memberCookie)).status,403);
        assert.equal((await configure(band,suffix,body,outsiderCookie)).status,404);
      }
      const key = randomUUID();
      assert.equal((await configure(band,'',{name:band.name},cookie,key)).status,200);
      // Simulate a completed ownership transfer while preserving both memberships.
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$2,version=version+1 WHERE band_id=$1',[band.bandId,member.user_id]);
      await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[band.bandId,member.user_id]);
      await fixture.query('COMMIT');
      assert.equal((await configure(band,'',{name:band.name},cookie,key)).status,403);
      assert.equal((await configure(band,'/instruments',{name:'No'})).status,403);
      band = (await detail(band)).body.data.band;
      assert.equal(band.currentUserRole,'member');
    });

    await t.test('an owner write waiting for the band lock rechecks ownership at commit', async () => {
      const fresh = (await create(simple)).body.data.band;
      await fixture.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')", [member.user_id,fresh.bandId]);
      await fixture.query('BEGIN');
      await fixture.query('SELECT 1 FROM bands WHERE band_id=$1 FOR UPDATE',[fresh.bandId]);
      const pending = configure(fresh,'/instrumentation',{slots:[{instrumentId:fresh.instruments[0].instrumentId,label:'Forbidden'}]});
      try {
        let waiting = false;
        for (let n=0;n<100;n++) {
          await fixture.query('SELECT pg_stat_clear_snapshot()');
          waiting = (await fixture.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM bands%'`)).rowCount > 0;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve,10));
        }
        assert.ok(waiting,'configuration reached the band lock');
        await fixture.query('UPDATE bands SET owner_user_id=$2,version=version+1 WHERE band_id=$1',[fresh.bandId,member.user_id]);
        await fixture.query("UPDATE user_bands SET role=CASE WHEN user_id=$2 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$1",[fresh.bandId,member.user_id]);
        await fixture.query('COMMIT');
      } finally { await fixture.query('ROLLBACK'); }
      assert.equal((await pending).status,403);
      assert.deepEqual((await detail(fresh)).body.data.band.instrumentation,fresh.instrumentation);
    });

    await t.test('concurrent configurations serialize and retain one normalized custom name', async () => {
      const fresh = (await create(simple)).body.data.band;
      const results = await Promise.all(['Race','RACE'].map(name => configure(fresh,'/instruments',{name})));
      assert.deepEqual(results.map(r => r.status).sort(),[201,409]);
      const current = (await detail(fresh)).body.data.band;
      assert.equal(current.instruments.filter(i => i.name.toLowerCase()==='race').length,1);
      assert.equal((await configure(current,'/instruments',{name:' race '})).body.data.band.version,current.version);
    });

    await t.test('template edits preserve event/poll snapshots, assignments and invitation history', async () => {
      const fresh = (await create(simple)).body.data.band;
      const slot = fresh.instrumentation[0];
      const event = (await fixture.query(`INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,starts_at,ends_at,location)
        VALUES ($1,$2,'Snapshot','rehearsal','2030-01-01','12:00','13:00','UTC','2030-01-01T12:00Z','2030-01-01T13:00Z','Studio') RETURNING event_id`,[fresh.bandId,leader.user_id])).rows[0].event_id;
      const poll = (await fixture.query(`INSERT INTO polls (band_id,created_by_user_id,name,location,timezone) VALUES ($1,$2,'Snapshot','Studio','UTC') RETURNING poll_id`,[fresh.bandId,leader.user_id])).rows[0].poll_id;
      const eventSlot = (await fixture.query(`INSERT INTO event_slots (band_id,event_id,template_slot_id,instrument_id,instrument_name,label,position)
        VALUES ($1,$2,$3,$4,'Guitar','Original',0) RETURNING slot_id`,[fresh.bandId,event,slot.slotId,slot.instrumentId])).rows[0].slot_id;
      const pollSlot = (await fixture.query(`INSERT INTO poll_slots (band_id,poll_id,template_slot_id,instrument_id,instrument_name,label,position)
        VALUES ($1,$2,$3,$4,'Guitar','Original',0) RETURNING slot_id`,[fresh.bandId,poll,slot.slotId,slot.instrumentId])).rows[0].slot_id;
      await fixture.query(`INSERT INTO event_invitations (band_id,event_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES ($1,$2,$3,$4,'Leader','First','Last',$5,'Guitar','Original')`,[fresh.bandId,event,eventSlot,leader.user_id,slot.instrumentId]);
      await fixture.query(`INSERT INTO invitation_history (invitation_id,actor_user_id,kind,status)
        SELECT invitation_id,$1,'response','accepted' FROM event_invitations WHERE event_id=$2`,[leader.user_id,event]);
      await fixture.query(`INSERT INTO poll_assignments (band_id,poll_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES ($1,$2,$3,$4,'Leader','First','Last',$5,'Guitar','Original')`,[fresh.bandId,poll,pollSlot,leader.user_id,slot.instrumentId]);
      const snapshots = async () => {
        const result = {};
        for (const table of ['event_slots','poll_slots','event_invitations','invitation_history','poll_assignments']) {
          result[table] = (await fixture.query(`SELECT * FROM ${table}`)).rows;
        }
        return result;
      };
      const before = await snapshots();
      const changed = await configure(fresh,'/instrumentation',{slots:[{slotId:slot.slotId,instrumentId:fresh.instruments[0].instrumentId,label:'Changed'}]});
      assert.equal(changed.status,200);
      assert.deepEqual(await snapshots(),before);
      const removed = await configure(changed.body.data.band,'/instrumentation',{slots:[{instrumentId:slot.instrumentId,label:'Replacement'}]});
      assert.equal(removed.status,200);
      before.event_slots[0].template_slot_id=null;
      before.poll_slots[0].template_slot_id=null;
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
