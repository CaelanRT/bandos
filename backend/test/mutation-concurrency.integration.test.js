const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');

const adminUrl = process.env.TEST_PG_ADMIN_URL;
assert.ok(adminUrl, 'TEST_PG_ADMIN_URL must identify a disposable PostgreSQL server with CREATEDB permission');

test('transactional mutation foundation on real PostgreSQL', async t => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `bandos_mutations_${randomUUID().replaceAll('-', '')}`;
  let fixture;
  let db;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    await fixture.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));
    Object.assign(process.env, {
      NODE_ENV: 'test', CLIENT_ORIGIN: 'http://client.example.test', SESSION_SECRET: 'disposable-mutation-secret',
      DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database,
      DB_USERNAME: decodeURIComponent(url.username), DB_PASSWORD: decodeURIComponent(url.password), DB_SSL: 'false',
    });
    delete process.env.DB_SSL_CA_FILE;
    db = require('../db');
    const { withMutation, checkVersion, applyChange, pruneIdempotency } = require('../utils/mutation');
    const HttpError = require('../utils/http-error');
    const { IDLE_MS } = require('../utils/account-session');
    let time = Date.now();
    const users = (await fixture.query(`INSERT INTO users (username,first_name,last_name,email,password_hash,email_verified_at)
      SELECT 'user' || n,'First','Last',n || '@example.test','hash',now() FROM generate_series(1,3) n RETURNING *`)).rows;

    async function band() {
      await fixture.query('BEGIN');
      const row = (await fixture.query(`INSERT INTO bands (name,owner_user_id) VALUES ('Original',$1) RETURNING *`, [users[0].user_id])).rows[0];
      await fixture.query(`INSERT INTO user_bands (band_id,user_id,role) VALUES ($1,$2,'leader'),($1,$3,'member')`, [row.band_id, users[0].user_id, users[1].user_id]);
      await fixture.query('COMMIT');
      return row;
    }
    function request(b, body = { name: 'Changed', expectedVersion: 1 }, key = randomUUID(), user = users[0]) {
      return { body, method: 'PUT', baseUrl: '/api/v1/bands', path: `/${b.band_id}`, get: () => key,
        session: { userId: user.user_id, sessionGeneration: user.session_generation,
          authenticatedAt: new Date(time).toISOString(), lastActivityAt: new Date(time).toISOString(), cookie: {} },
        app: { locals: { sessionClock: () => time } } };
    }
    function handlers(req, b, overrides = {}) {
      return {
        discover: async () => ({ bands: [b.band_id] }),
        authorize: async (client, locked, user) => {
          const current = locked.bands[0];
          const member = (await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2', [b.band_id, user.user_id])).rowCount;
          if (!member) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
          if (current.owner_user_id !== user.user_id) throw new HttpError(403, 'LEADER_REQUIRED', 'Leader required');
        },
        validate: async (client, locked) => checkVersion(locked.bands[0].version, req.body.expectedVersion),
        work: async (client, locked) => {
          const current = locked.bands[0];
          await applyChange({ name: current.name }, { name: req.body.name.trim() }, async () => {
            const updated = (await client.query('UPDATE bands SET name=$1,version=version+1 WHERE band_id=$2 RETURNING *', [req.body.name.trim(), b.band_id])).rows[0];
            Object.assign(current, updated);
            await client.query(`INSERT INTO email_outbox (transition_id,kind,recipient_identity,category,recipient_selector,recipient_user_id,template_version,payload)
              VALUES ($1,'test_change',$2,'eventUpdates','user',$3,1,'{}')`, [randomUUID(), String(users[1].user_id), users[1].user_id]);
          });
          return { status: 200, body: { data: { name: current.name, version: current.version } } };
        },
        ...overrides,
      };
    }
    async function counts(b) {
      return (await fixture.query(`SELECT version,name,(SELECT count(*)::int FROM email_outbox) AS outbox,
        (SELECT count(*)::int FROM api_idempotency WHERE path=$2) AS replays FROM bands WHERE band_id=$1`, [b.band_id, `/api/v1/bands/${b.band_id}`])).rows[0];
    }

    await t.test('UUID keys are mandatory; aggregate versions are positive and absent vote rows use zero', async () => {
      const b = await band();
      const before = await counts(b);
      for (const key of [undefined, '', 'not-a-uuid']) {
        const req = request(b);
        req.get = () => key;
        await assert.rejects(withMutation(req, handlers(req, b)), { code: 'VALIDATION_ERROR' });
      }
      assert.doesNotThrow(() => checkVersion(0, 0, 'expectedVoteVersion'));
      assert.throws(() => checkVersion(1, 0), { code: 'VALIDATION_ERROR' });
      assert.deepEqual(await counts(b), before);
    });

    await t.test('concurrent identical keys commit once; response loss replays before stale validation', async () => {
      const b = await band();
      const req = request(b);
      const req2 = request(b, req.body, req.get());
      const before = await counts(b);
      const results = await Promise.all([withMutation(req, handlers(req, b)), withMutation(req2, handlers(req2, b))]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].body.data.version, 2);
      const after = await counts(b);
      assert.equal(after.outbox, before.outbox + 1);
      assert.equal(after.replays, 1);
      // Discard both HTTP results to simulate response loss; the intent still has v1.
      assert.deepEqual(await withMutation(req, handlers(req, b)), results[0]);
      const changed = request(b, { name: 'Different', expectedVersion: 1 }, req.get());
      await assert.rejects(withMutation(changed, handlers(changed, b)), { code: 'IDEMPOTENCY_KEY_REUSED' });
      assert.deepEqual(await counts(b), after);
      // Reordered object keys have the same canonical hash.
      const reordered = request(b, { expectedVersion: 1, name: 'Changed' }, req.get());
      assert.deepEqual(await withMutation(reordered, handlers(reordered, b)), results[0]);
    });

    await t.test('stale writes, normalized no-ops and pre-commit failures have no effects', async () => {
      const b = await band();
      const before = await counts(b);
      const noop = request(b, { name: '  Original  ', expectedVersion: 1 });
      assert.equal((await withMutation(noop, handlers(noop, b))).body.data.version, 1);
      assert.equal((await counts(b)).outbox, before.outbox);
      const stale = request(b, { name: 'Changed', expectedVersion: 2 });
      await assert.rejects(withMutation(stale, handlers(stale, b)), { code: 'STALE_VERSION' });
      const failing = request(b);
      const normal = handlers(failing, b);
      await assert.rejects(withMutation(failing, { ...normal, work: async (...args) => {
        await normal.work(...args);
        throw new Error('failure before commit');
      } }), /failure before commit/);
      assert.deepEqual(await counts(b), { ...before, replays: 1 });
      assert.equal((await withMutation(failing, normal)).body.data.version, 2, 'failed key remains usable');
      const invalid = request(b);
      const after = await counts(b);
      await assert.rejects(withMutation(invalid, handlers(invalid, b, { validate: async () => {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid field');
      } })), { code: 'VALIDATION_ERROR' });
      assert.deepEqual(await counts(b), after);
    });

    await t.test('current ownership, membership and revoked sessions are checked before replay', async () => {
      const b = await band();
      const req = request(b);
      await withMutation(req, handlers(req, b));
      const before = await counts(b);
      await fixture.query('BEGIN');
      await fixture.query('UPDATE bands SET owner_user_id=$1 WHERE band_id=$2', [users[1].user_id, b.band_id]);
      await fixture.query(`UPDATE user_bands SET role=CASE WHEN user_id=$1 THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=$2`, [users[1].user_id, b.band_id]);
      await fixture.query('COMMIT');
      await assert.rejects(withMutation(req, handlers(req, b)), { code: 'LEADER_REQUIRED' });
      await fixture.query('DELETE FROM user_bands WHERE user_id=$1 AND band_id=$2', [users[0].user_id, b.band_id]);
      await assert.rejects(withMutation(req, handlers(req, b)), { code: 'BAND_NOT_FOUND' });
      await fixture.query('UPDATE users SET session_generation=session_generation+1 WHERE user_id=$1', [users[0].user_id]);
      await assert.rejects(withMutation(req, handlers(req, b)), { code: 'AUTHENTICATION_REQUIRED', reason: 'revoked' });
      await fixture.query('UPDATE users SET session_generation=session_generation-1 WHERE user_id=$1', [users[0].user_id]);
      assert.deepEqual(await counts(b), before);
    });

    await t.test('deadline reached during work rolls back all writes and the replay record', async () => {
      const b = await band();
      const req = request(b);
      const before = await counts(b);
      const normal = handlers(req, b);
      const originalTime = time;
      await assert.rejects(withMutation(req, { ...normal, work: async (...args) => {
        const result = await normal.work(...args);
        time += IDLE_MS;
        return result;
      } }), { code: 'AUTHENTICATION_REQUIRED', reason: 'idle_expired' });
      time = originalTime;
      assert.deepEqual(await counts(b), before);
    });

    await t.test('serialization/deadlock retries repeat discovery, access and boundary checks with the same key', async () => {
      for (const code of ['40001', '40P01']) {
        const b = await band();
        const req = request(b);
        const normal = handlers(req, b);
        let attempts = 0;
        let checks = 0;
        let discoveries = 0;
        let boundaries = 0;
        const before = await counts(b);
        await withMutation(req, { ...normal,
          discover: async () => { discoveries++; return { bands: [b.band_id] }; },
          authorize: async (...args) => { checks++; await normal.authorize(...args); },
          validate: async (...args) => { boundaries++; await normal.validate(...args); },
          work: async (...args) => {
            const result = await normal.work(...args);
            if (attempts++ === 0) await args[0].query(`DO $$ BEGIN RAISE EXCEPTION 'retry' USING ERRCODE='${code}'; END $$`);
            return result;
          },
        });
        assert.equal(checks, 2);
        assert.equal(discoveries, 2);
        assert.equal(boundaries, 2);
        assert.equal((await counts(b)).outbox, before.outbox + 1);
        assert.equal((await counts(b)).replays, 1);
      }
    });

    await t.test('account requests persist only hashes and sanitized public responses; scope includes actor/method/path', async () => {
      const b = await band();
      const req = request(b, { expectedVersion: 1, password: 'private password', token: 'private token' });
      const options = handlers(req, b, { work: async () => ({ status: 201, body: {
        data: { saved: true, password_hash: 'credential hash', nested: { resetToken: 'private token', name: 'Public' } },
      } }) });
      const response = await withMutation(req, options);
      assert.deepEqual(response, { status: 201, body: { data: { saved: true, nested: { name: 'Public' } } } });
      const row = (await fixture.query('SELECT * FROM api_idempotency WHERE idempotency_key=$1', [req.get()])).rows[0];
      assert.equal(row.request_hash.length, 32);
      assert.ok(!JSON.stringify(row).includes('private'));
      assert.equal(row.expires_at - row.created_at, 7 * 24 * 60 * 60 * 1000);
      for (const change of [r => { r.method = 'POST'; }, r => { r.path += '/other'; }, r => {
        r.session.userId = users[1].user_id;
      }]) {
        const other = request(b, req.body, req.get());
        change(other);
        await withMutation(other, { ...options, authorize: async () => {} });
      }
      assert.equal((await fixture.query('SELECT count(*)::int AS n FROM api_idempotency WHERE idempotency_key=$1', [req.get()])).rows[0].n, 4);
    });

    await t.test('pruning seven-day replay records preserves domain/outbox and terminal poll evidence', async () => {
      const b = await band();
      const req = request(b);
      await withMutation(req, handlers(req, b));
      const event = (await fixture.query(`INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,location,starts_at,ends_at)
        VALUES ($1,$2,'Event','rehearsal','2030-01-01','12:00','13:00','UTC','Studio','2030-01-01T12:00Z','2030-01-01T13:00Z') RETURNING event_id`, [b.band_id, users[0].user_id])).rows[0];
      const poll = (await fixture.query(`INSERT INTO polls (band_id,created_by_user_id,name,location,timezone,state,closed_at)
        VALUES ($1,$2,'Cancelled','Studio','UTC','cancelled',now()) RETURNING poll_id`, [b.band_id, users[0].user_id])).rows[0];
      const before = await counts(b);
      const instrument = (await fixture.query(`INSERT INTO instruments (band_id,name) VALUES ($1,'Guitar') RETURNING instrument_id`, [b.band_id])).rows[0];
      const slot = (await fixture.query(`INSERT INTO event_slots (event_id,band_id,instrument_id,instrument_name,label,position)
        VALUES ($1,$2,$3,'Guitar','Guitar 1',0) RETURNING slot_id`, [event.event_id, b.band_id, instrument.instrument_id])).rows[0];
      const invitation = (await fixture.query(`INSERT INTO event_invitations (band_id,event_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES ($1,$2,$3,$4,'user2','First','Last',$5,'Guitar','Guitar 1') RETURNING invitation_id`,
      [b.band_id, event.event_id, slot.slot_id, users[1].user_id, instrument.instrument_id])).rows[0];
      await fixture.query(`INSERT INTO invitation_history (invitation_id,actor_user_id,kind,status) VALUES ($1,$2,'response','accepted')`, [invitation.invitation_id, users[1].user_id]);
      await fixture.query(`UPDATE api_idempotency SET created_at=now()-interval '8 days', expires_at=now()-interval '1 day' WHERE idempotency_key=$1`, [req.get()]);
      assert.equal((await pruneIdempotency()).rowCount, 1);
      assert.deepEqual(await counts(b), { ...before, replays: 0 });
      assert.equal((await fixture.query('SELECT state FROM polls WHERE poll_id=$1', [poll.poll_id])).rows[0].state, 'cancelled');
      assert.equal((await fixture.query('SELECT event_id FROM events WHERE event_id=$1', [event.event_id])).rowCount, 1);
      assert.equal((await fixture.query('SELECT * FROM invitation_history WHERE invitation_id=$1', [invitation.invitation_id])).rowCount, 1);
      await assert.rejects(withMutation(req, handlers(req, b)), { code: 'STALE_VERSION' });
    });
  } finally {
    if (db) await db.close();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
