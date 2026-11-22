// Real app, disposable database, fixed application time, and no external mail calls.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Client } = require('pg');
const { decrypt, serializeMail } = require('../utils/notification-mail');

async function main() {
  const mode = process.argv[2];
  assert.ok(['band', 'event'].includes(mode), 'Use band or event');
  assert.ok(process.env.TEST_PG_ADMIN_URL, 'TEST_PG_ADMIN_URL must point to disposable PostgreSQL');
  const admin = new Client({ connectionString: process.env.TEST_PG_ADMIN_URL });
  await admin.connect();
  const database = `bandos_smoke_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.TEST_PG_ADMIN_URL);
  url.pathname = `/${database}`;
  const key = randomBytes(32), origin = 'http://client.example.test';
  const time = Date.UTC(2030, 10, 22, 12);
  let fixture, pool, child, exited, output = '', checks = 0;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    fixture = new Client({ connectionString: url.toString() });
    await fixture.connect();
    await fixture.query(readFileSync(require.resolve('../db/schemas/schema.sql'), 'utf8'));
    // Hold automatic dispatch so token fixtures and outage/restart are deterministic.
    // The production app and routes are otherwise unchanged. No production fetch escapes.
    const bootstrap = `global.fetch = async () => { throw new Error('External mail disabled'); };
      require('./utils/notification-outbox').createDispatcher = () => ({ start() {}, async stop() {} });
      const {app, server} = require('./app');
      app.locals.sessionClock = () => ${time};
      server.on('listening', () => console.log('SMOKE_PORT=' + server.address().port));`;
    const reservation = require('node:net').createServer().listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const reservedPort = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    child = spawn(process.execPath, ['-e', bootstrap], { cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test', PORT: String(reservedPort), CLIENT_ORIGIN: origin, SESSION_SECRET: 'disposable-smoke-secret',
        DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database, DB_USERNAME: decodeURIComponent(url.username),
        DB_PASSWORD: decodeURIComponent(url.password), DB_SSL: 'false', DB_SSL_CA_FILE: undefined, BCRYPT_ROUNDS: '4',
        RESEND_API_KEY: 'fake-only', EMAIL_FROM: 'bandos@example.test', OUTBOX_ENCRYPTION_KEY: key.toString('base64') },
      stdio: ['ignore', 'pipe', 'pipe'] });
    exited = once(child, 'exit');
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    for (let n = 0; n < 100 && !/SMOKE_PORT=/.test(output); n++) {
      assert.equal(child.exitCode, null, output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const port = output.match(/SMOKE_PORT=(\d+)/)?.[1];
    assert.ok(port, output);
    const base = `http://127.0.0.1:${port}/api/v1`;
    async function request(path, body, cookie, method = 'POST', expected = 200, intent = randomUUID(), requestOrigin = origin) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
        Origin: requestOrigin, 'Idempotency-Key': intent, ...(cookie ? { Cookie: cookie } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body) });
      const result = await response.json();
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
      checks++;
      return { ...result.data, error: result.error, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    async function account(n) {
      const email = `smoke${n}@example.test`, password = 'Password123!';
      const r = await request('/auth/register', { username: `smoke${n}`, firstName: 'Smoke', lastName: 'Test', email, password }, null, 'POST', 201);
      assert.equal(r.session.access, 'verification_required');
      assert.equal((await request('/bands', undefined, r.cookie, 'GET', 403)).error.code, 'EMAIL_VERIFICATION_REQUIRED');
      const mail = (await fixture.query('SELECT * FROM email_outbox WHERE recipient_user_id=$1', [r.user.user_id])).rows[0];
      const confirmed = await request('/auth/verification/confirm', { token: decrypt(mail.encrypted_security_payload, key).token }, r.cookie);
      assert.equal(confirmed.session.access, 'full');
      assert.equal(confirmed.session.absoluteExpiresAt, r.session.absoluteExpiresAt);
      return { ...confirmed, email, password };
    }
    const leader = await account(1), member = await account(2), outsider = await account(3);
    const starter = (await request('/instruments', undefined, leader.cookie, 'GET')).instruments.find(i => i.name === 'Guitar');
    let band = (await request('/bands', { name: 'Smoke band', instrumentation: [
      { instrumentId: starter.instrumentId, label: 'Guitar 1' }, { instrumentId: starter.instrumentId, label: 'Guitar 2' }],
      leaderInstrumentIds: [starter.instrumentId] }, leader.cookie, 'POST', 201)).band;
    const path = `/bands/${band.bandId}`, instrumentId = band.instrumentation[0].instrumentId;
    const readBand = async () => (await request(path, undefined, leader.cookie, 'GET')).band;
    band = (await request(path + '/members', { username: member.user.username, instrumentIds: [instrumentId], expectedVersion: band.version }, leader.cookie, 'POST', 201)).band;
    band = (await request(path + '/default-lineup', { expectedVersion: band.version, assignments: band.instrumentation.map((s, i) => ({ slotId: s.slotId, userId: [leader, member][i].user.user_id })) }, leader.cookie, 'PUT')).band;
    assert.equal(band.defaultLineup.isApplicable, true);
    assert.equal((await request(path, undefined, outsider.cookie, 'GET', 404)).error.code, 'BAND_NOT_FOUND');
    assert.equal((await request(path, { expectedVersion: band.version, name: 'Forbidden' }, member.cookie, 'PATCH', 403)).error.code, 'LEADER_REQUIRED');
    if (mode === 'event') {
      const slots = band.defaultLineup.assignments.map(a => ({ clientKey: randomUUID(), templateSlotId: a.slotId, instrumentId, label: 'Guitar', userId: a.userId }));
      const body = { name: 'Smoke rehearsal', type: 'rehearsal', date: '2030-11-24', startTime: '18:00', endTime: '20:00', timezone: 'UTC', location: 'Hall', hideFromUninvited: true, templateVersion: band.version, slots };
      const intent = randomUUID();
      let event = (await request(path + '/events', body, leader.cookie, 'POST', 201, intent)).event;
      assert.deepEqual((await request(path + '/events', body, leader.cookie, 'POST', 201, intent)).event, event);
      const eventPath = path + '/events/' + event.eventId;
      const invitation = event.slots.find(s => s.invitation.userId === member.user.user_id).invitation;
      const respond = async status => (await request(eventPath + `/invitations/${invitation.invitationId}/response`, { expectedVersion: event.version, status }, member.cookie, 'PUT')).event;
      event = await respond('accepted');
      const datebook = (await request(path + '/events', undefined, member.cookie, 'GET')).events;
      assert.equal(datebook.filter(e => e.startsAt > new Date(time).toISOString() && e.myInvitationId === invitation.invitationId).length, 1);
      event = (await request(eventPath, { expectedVersion: event.version, endTime: '21:00' }, leader.cookie, 'PATCH')).event;
      assert.equal(event.slots.find(s => s.invitation.userId === member.user.user_id).invitation.status, 'pending');
      const before = await fixture.query('SELECT count(*)::int AS n FROM email_outbox');
      const noOp = (await request(eventPath, { expectedVersion: event.version, location: event.location }, leader.cookie, 'PATCH')).event;
      assert.equal(noOp.version, event.version);
      assert.equal((await request(eventPath, { expectedVersion: 1, location: 'Stale' }, leader.cookie, 'PATCH', 409)).error.code, 'STALE_VERSION');
      assert.deepEqual((await fixture.query('SELECT count(*)::int AS n FROM email_outbox')).rows, before.rows);
      event = await respond('declined');
      assert.equal((await request(path + '/events', undefined, member.cookie, 'GET')).events[0].slots.find(s => s.invitation.userId === member.user.user_id).invitation.status, 'declined');
      const poll = (await request(path + '/polls', { name: 'Smoke poll', timezone: 'UTC', location: 'Hall', hideFromUninvited: false, templateVersion: band.version, slots,
        options: [{ clientKey: randomUUID(), date: '2030-11-25', startTime: '18:00', endTime: '20:00' }] }, leader.cookie, 'POST', 201)).poll;
      await request(path + `/polls/${poll.pollId}/availability`, { expectedVersion: poll.version, expectedVoteVersion: 0,
        answers: poll.options.map(o => ({ optionId: o.optionId, optionRevision: o.revision, answer: 'no' })) }, member.cookie, 'PUT');
      const finalized = await request(path + `/polls/${poll.pollId}/finalize`, { expectedVersion: poll.version, optionId: poll.options[0].optionId, optionRevision: poll.options[0].revision }, leader.cookie);
      assert.equal(finalized.poll.state, 'finalized');
      const rehearsal = (await request(path + `/events/${finalized.poll.finalizedEventId}`, undefined, member.cookie, 'GET')).event;
      assert.ok(rehearsal.slots.every(s => s.invitation.status === 'pending'));
      await request(eventPath, { expectedVersion: event.version }, leader.cookie, 'DELETE');
      await request(eventPath, undefined, member.cookie, 'GET', 404);
    }
    // Integrated lifecycle: transfer ownership, remove former owner, revoke account.
    band = await readBand();
    band = (await request(path + '/ownership', { expectedVersion: band.version, userId: member.user.user_id }, leader.cookie)).band;
    await request(path + `/members/${leader.user.user_id}`, { expectedVersion: band.version }, member.cookie, 'DELETE');
    await request(path, undefined, leader.cookie, 'GET', 404);
    await request('/users/me', { expectedVersion: leader.user.version, password: leader.password }, leader.cookie, 'DELETE');
    await request('/users/me', undefined, leader.cookie, 'GET', 401);
    await request(path, { expectedVersion: (await request(path, undefined, member.cookie, 'GET')).band.version }, member.cookie, 'DELETE');
    await request(path, undefined, member.cookie, 'GET', 404);

    await request('/users/me/password', { expectedVersion: outsider.user.version, currentPassword: outsider.password, newPassword: 'Replacement123!' }, outsider.cookie);

    // API saves above succeeded before any delivery attempt. Recover an outage with
    // a new dispatcher and the same frozen provider request/key.
    Object.assign(process.env, { CLIENT_ORIGIN: origin, SESSION_SECRET: 'disposable-smoke-secret', DB_HOST: url.hostname, DB_PORT: url.port || '5432', DB_NAME: database, DB_USERNAME: decodeURIComponent(url.username), DB_PASSWORD: decodeURIComponent(url.password), DB_SSL: 'false' });
    delete process.env.DB_SSL_CA_FILE;
    const { createDispatcher } = require('../utils/notification-outbox');
    pool = require('../db').pool;
    let clock = time;
    const calls = [];
    const options = { pool, origin, from: 'bandos@example.test', encryptionKey: key, clock: () => clock, random: () => 0 };
    const worker = createDispatcher({ ...options, adapter: { async send(payload, providerKey) { calls.push([serializeMail(payload), providerKey]); return { status: 'transient' }; } } });
    // Consumed verification mail is suppressed; pending security notice is deliverable.
    while (calls.length === 0) assert.equal(await worker.dispatchOne(), true);
    const retry = (await fixture.query("SELECT * FROM email_outbox WHERE state='retryable'")).rows[0];
    assert.ok(retry);
    clock = +retry.next_attempt_at;
    const restarted = createDispatcher({ ...options, adapter: { async send(payload, providerKey) { calls.push([serializeMail(payload), providerKey]); return { status: 'accepted', id: 'fake-only' }; } } });
    // Other queued rows may precede the retry; drain until its durable row is sent.
    for (let n = 0; n < 100; n++) {
      if ((await fixture.query('SELECT state FROM email_outbox WHERE notification_id=$1', [retry.notification_id])).rows[0].state === 'sent') break;
      assert.equal(await restarted.dispatchOne(), true);
    }
    assert.ok(calls.slice(1).some(call => call[1] === calls[0][1] && call[0] === calls[0][0]));
    console.log(`PASS ${mode}: ${checks} actual-app HTTP checks; verification, defaults, lifecycle, fake-provider outage/restart; disposable DB cleaned`);
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await exited; }
    if (pool) await pool.end();
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
