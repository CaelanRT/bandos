const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');

// Explicit admin URL only; never load .env or reset an existing database.
const adminUrl = process.env.TEST_PG_ADMIN_URL;
assert.ok(adminUrl, 'TEST_PG_ADMIN_URL must point to a disposable PostgreSQL server with CREATEDB permission');

test('fresh v2 PostgreSQL storage and integrity', async (t) => {
  const database = `bandos_storage_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  let db;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    await db.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));

    async function rejects(sql, code = '23503') {
      await db.query('SAVEPOINT invalid_write');
      await assert.rejects(db.query(sql), (error) => error.code === code);
      await db.query('ROLLBACK TO SAVEPOINT invalid_write');
    }
    async function fixture() {
      const users = (await db.query(`INSERT INTO users (username,first_name,last_name,email,password_hash,email_verified_at)
        SELECT 'user_' || n || '_' || txid_current(), 'First', 'Last',
        n || '_' || txid_current() || '@example.test', 'hash', now() FROM generate_series(1,3) n RETURNING user_id`)).rows.map(r => r.user_id);
      const band = (await db.query(`INSERT INTO bands (name,owner_user_id) VALUES ('Band',$1) RETURNING band_id`, [users[0]])).rows[0].band_id;
      await db.query(`INSERT INTO user_bands (band_id,user_id,role) VALUES ($1,$2,'leader'),($1,$3,'member')`, [band, users[0], users[1]]);
      const instrument = (await db.query(`INSERT INTO instruments (band_id,name) VALUES ($1,'Guitar') RETURNING instrument_id`, [band])).rows[0].instrument_id;
      const template = (await db.query(`INSERT INTO template_slots (band_id,instrument_id,label,position) VALUES ($1,$2,'Guitar 1',0) RETURNING slot_id`, [band, instrument])).rows[0].slot_id;
      const event = (await db.query(`INSERT INTO events (band_id,created_by_user_id,name,type,event_date,start_time,end_time,timezone,location,starts_at,ends_at)
        VALUES ($1,$2,'Event','rehearsal','2030-01-01','12:00','13:00','UTC','Studio','2030-01-01T12:00Z','2030-01-01T13:00Z') RETURNING event_id`, [band, users[0]])).rows[0].event_id;
      const poll = (await db.query(`INSERT INTO polls (band_id,created_by_user_id,name,location,timezone) VALUES ($1,$2,'Poll','Studio','UTC') RETURNING poll_id`, [band, users[0]])).rows[0].poll_id;
      const slots = {};
      for (const [table, resource, id] of [['event_slots', 'event_id', event], ['poll_slots', 'poll_id', poll]]) {
        slots[table] = (await db.query(`INSERT INTO ${table} (${resource},band_id,template_slot_id,instrument_id,instrument_name,label,position)
          VALUES ($1,$2,$3,$4,'Guitar','Guitar 1',0),($1,$2,$3,$4,'Guitar','Guitar 2',1) RETURNING slot_id`, [id, band, template, instrument])).rows.map(r => r.slot_id);
      }
      const option = (await db.query(`INSERT INTO poll_options (poll_id,position) VALUES ($1,0) RETURNING option_id`, [poll])).rows[0].option_id;
      await db.query(`INSERT INTO poll_option_revisions (option_id,poll_id,revision,option_date,start_time,end_time,timezone,starts_at,ends_at)
        VALUES ($1,$2,1,'2030-01-02','12:00','13:00','UTC','2030-01-02T12:00Z','2030-01-02T13:00Z')`, [option, poll]);
      return { users, band, instrument, template, event, poll, option, slots };
    }
    async function scenario(name, fn) {
      await t.test(name, async () => {
        await db.query('BEGIN');
        try { await fn(await fixture()); } finally { await db.query('ROLLBACK'); }
      });
    }
    function invitation(f, slot = f.slots.event_slots[0], user = f.users[1]) {
      return `INSERT INTO event_invitations (band_id,event_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES (${f.band},${f.event},${slot},${user},'musician','First','Last',${f.instrument},'Guitar','Guitar 1') RETURNING invitation_id`;
    }
    function assignment(f, slot = f.slots.poll_slots[0], user = f.users[1]) {
      return `INSERT INTO poll_assignments (band_id,poll_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
        VALUES (${f.band},${f.poll},${slot},${user},'musician','First','Last',${f.instrument},'Guitar','Guitar 1') RETURNING assignment_id`;
    }

    await scenario('owner and membership consistency is deferred but cannot commit invalid state', async (f) => {
      await db.query(`UPDATE users SET is_active=false WHERE user_id=${f.users[0]}`);
      await assert.rejects(db.query('COMMIT'), { code: '23503' });
    });
    for (const [name, sql] of [
      ['unverified owner', f => `UPDATE users SET email_verified_at=NULL WHERE user_id=${f.users[0]}`],
      ['missing owner membership', f => `DELETE FROM user_bands WHERE band_id=${f.band} AND user_id=${f.users[0]}`],
      ['extra leader', f => `UPDATE user_bands SET role='leader' WHERE band_id=${f.band}`],
      ['nonmember owner', f => `UPDATE bands SET owner_user_id=${f.users[2]} WHERE band_id=${f.band}`],
    ]) {
      await scenario(name, async f => {
        await db.query(sql(f));
        await assert.rejects(db.query('COMMIT'), e => ['23503', '23514'].includes(e.code));
      });
    }
    await scenario('atomic ownership transfer commits, retaining both memberships', async (f) => {
      await db.query(`UPDATE bands SET owner_user_id=${f.users[1]} WHERE band_id=${f.band}`);
      await db.query(`UPDATE user_bands SET role=CASE WHEN user_id=${f.users[1]} THEN 'leader'::role_type ELSE 'member'::role_type END WHERE band_id=${f.band}`);
      await db.query('COMMIT');
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM user_bands WHERE band_id=${f.band}`)).rows[0].n, 2);
    });
    await scenario('inactive bands retain owner history while allowing membership removal and deactivation', async (f) => {
      await db.query(`UPDATE bands SET is_active=false WHERE band_id=${f.band}`);
      await db.query(`DELETE FROM user_bands WHERE band_id=${f.band} AND user_id=${f.users[0]}`);
      await db.query(`UPDATE users SET is_active=false WHERE user_id=${f.users[0]}`);
      await db.query('COMMIT');
      const band = (await db.query(`SELECT owner_user_id,active_owner_user_id FROM bands WHERE band_id=${f.band}`)).rows[0];
      assert.equal(band.owner_user_id, f.users[0]);
      assert.equal(band.active_owner_user_id, null);
    });
    await scenario('baseline bounds, scoped references, case-insensitive uniqueness and valid ranges', async (f) => {
      await rejects(`INSERT INTO instruments (band_id,name) VALUES (${f.band},'gUITAR')`, '23505');
      await rejects(`UPDATE users SET email=(SELECT upper(email) FROM users WHERE user_id=${f.users[0]}) WHERE user_id=${f.users[1]}`, '23505');
      await rejects(`INSERT INTO user_bands (band_id,user_id,role) VALUES (${f.band},${f.users[1]},'member')`, '23505');
      await rejects(`UPDATE users SET username=repeat('a',51) WHERE user_id=${f.users[0]}`, '22001');
      await rejects(`UPDATE events SET end_time='11:00' WHERE event_id=${f.event}`, '23514');
      await rejects(`UPDATE events SET ends_at=starts_at WHERE event_id=${f.event}`, '23514');
      await rejects(`UPDATE events SET version=0 WHERE event_id=${f.event}`, '23514');
      await rejects(`UPDATE template_slots SET position=50 WHERE slot_id=${f.template}`, '23514');
      const otherBand = (await db.query(`INSERT INTO bands (name,owner_user_id,is_active) VALUES ('Other',${f.users[0]},false) RETURNING band_id`)).rows[0].band_id;
      await rejects(`INSERT INTO member_instruments VALUES (${otherBand},${f.users[1]},${f.instrument})`);
      await rejects(`UPDATE event_slots SET band_id=${otherBand} WHERE slot_id=${f.slots.event_slots[0]}`);
      await rejects(`INSERT INTO events (band_id) VALUES (-1)`, '23502');
    });
    await scenario('active invitation uniqueness and snapshot/history retention after retirement and template deletion', async (f) => {
      const id = (await db.query(invitation(f))).rows[0].invitation_id;
      await rejects(invitation(f), '23505');
      await rejects(invitation(f, f.slots.event_slots[1]), '23505');
      await rejects(invitation(f, f.slots.event_slots[0], f.users[0]), '23505');
      await db.query(`INSERT INTO invitation_history (invitation_id,actor_user_id,kind,status) VALUES (${id},${f.users[1]},'response','accepted')`);
      await db.query(`UPDATE event_invitations SET retired_at=now(), retirement_cause='removed' WHERE invitation_id=${id}`);
      assert.notEqual((await db.query(invitation(f))).rows[0].invitation_id, id);
      await db.query(`DELETE FROM template_slots WHERE slot_id=${f.template}`);
      for (const table of ['event_slots', 'poll_slots']) {
        const rows = (await db.query(`SELECT template_slot_id,instrument_name,label FROM ${table} WHERE band_id=${f.band}`)).rows;
        assert.equal(rows.length, 2);
        assert.equal(rows[0].template_slot_id, null);
        assert.equal(rows[0].instrument_name, 'Guitar');
      }
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM invitation_history WHERE invitation_id=${id}`)).rows[0].n, 1);
    });
    await scenario('poll assignment generations isolate returning musicians and preserve revisioned votes', async (f) => {
      const old = (await db.query(assignment(f))).rows[0].assignment_id;
      await rejects(assignment(f, f.slots.poll_slots[1]), '23505');
      await rejects(assignment(f, f.slots.poll_slots[0], f.users[0]), '23505');
      await db.query(`INSERT INTO poll_vote_rows (assignment_id,poll_id) VALUES (${old},${f.poll})`);
      const vote = `INSERT INTO poll_vote_cells VALUES (${old},${f.poll},${f.option},1,'yes')`;
      await db.query(vote);
      await rejects(vote, '23505');
      await rejects(`UPDATE poll_vote_cells SET answer='maybe' WHERE assignment_id=${old}`, '23514');
      await db.query(`UPDATE poll_assignments SET retired_at=now(),retirement_cause='removed' WHERE assignment_id=${old}`);
      const current = (await db.query(assignment(f))).rows[0].assignment_id;
      assert.notEqual(current, old);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM poll_vote_rows WHERE assignment_id=${current}`)).rows[0].n, 0);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM poll_vote_cells WHERE assignment_id=${old}`)).rows[0].n, 1);
      await rejects(`UPDATE poll_vote_cells SET option_revision=2 WHERE assignment_id=${old}`);
      await db.query(`INSERT INTO poll_option_revisions SELECT option_id,poll_id,2,option_date,start_time,end_time,timezone,starts_at,ends_at FROM poll_option_revisions WHERE option_id=${f.option}`);
      await db.query(`UPDATE poll_options SET current_revision=2 WHERE option_id=${f.option}`);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
    await scenario('finalization links are unique, same-band and retain the chosen option revision', async (f) => {
      await db.query(`UPDATE polls SET state='finalized',closed_at=now(),finalized_event_id=${f.event},finalized_option_id=${f.option},finalized_option_revision=1 WHERE poll_id=${f.poll}`);
      await rejects(`INSERT INTO polls (band_id,created_by_user_id,name,location,timezone,state,closed_at,finalized_event_id,finalized_option_id,finalized_option_revision)
        VALUES (${f.band},${f.users[0]},'Duplicate','Studio','UTC','finalized',now(),${f.event},${f.option},1)`, '23505');
      await rejects(`UPDATE polls SET state='open' WHERE poll_id=${f.poll}`, '23514');
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
    await scenario('preference defaults, token digests, seven-day replay and leased encrypted delivery storage', async (f) => {
      const prefs = (await db.query(`INSERT INTO notification_preferences (user_id) VALUES (${f.users[0]}) RETURNING *`)).rows[0];
      for (const key of ['enabled','invitations','event_updates','removals_and_cancellations','invitation_responses','poll_updates','poll_responses']) assert.equal(prefs[key], true);
      await rejects(`INSERT INTO account_tokens (user_id,purpose,token_digest,expires_at) VALUES (${f.users[0]},'password_reset','raw-token',now()+interval '30 minutes')`, '23514');
      await db.query(`INSERT INTO account_tokens (user_id,purpose,token_digest,expires_at) VALUES (${f.users[0]},'password_reset',decode(repeat('ab',32),'hex'),now()+interval '30 minutes')`);
      const replay = `INSERT INTO api_idempotency (actor_user_id,method,path,idempotency_key,request_hash,response_status,response_body) VALUES (${f.users[0]},'POST','/test','${randomUUID()}',decode(repeat('ab',32),'hex'),201,'{}')`;
      await db.query(replay);
      await rejects(replay, '23505');
      assert.equal((await db.query(`SELECT expires_at-created_at=interval '7 days' AS retained FROM api_idempotency WHERE actor_user_id=${f.users[0]}`)).rows[0].retained, true);
      await rejects(`UPDATE api_idempotency SET expires_at=created_at WHERE actor_user_id=${f.users[0]}`, '23514');
      const outbox = `INSERT INTO email_outbox (transition_id,kind,recipient_identity,security_purpose,recipient_selector,security_recipient_address,template_version,payload,encrypted_security_payload,security_payload_expires_at)
        VALUES ('${randomUUID()}','reset','user:${f.users[0]}','password_reset','security_address','test@example.test',1,'{}',decode('abcdef','hex'),now()+interval '30 minutes')`;
      await db.query(outbox);
      await rejects(outbox, '23505');
      await rejects(`UPDATE email_outbox SET state='sending' WHERE security_recipient_address='test@example.test'`, '23514');
      await db.query(`UPDATE email_outbox SET state='sending',lease_owner='worker',lease_expires_at=now()+interval '1 minute',attempt_count=1,first_attempt_at=now(),last_attempt_at=now(),provider_key='stable-key',request_fingerprint=decode(repeat('ab',32),'hex') WHERE security_recipient_address='test@example.test'`);
      await rejects(`UPDATE email_outbox SET state='sent' WHERE provider_key='stable-key'`, '23514');
      await db.query(`UPDATE email_outbox SET state='sent',encrypted_security_payload=NULL,security_payload_expires_at=NULL,lease_owner=NULL,lease_expires_at=NULL,provider_id='provider-id',sent_at=now() WHERE provider_key='stable-key'`);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
  } finally {
    if (db) await db.end();
    if (created) await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  }
});
