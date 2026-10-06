const assert = require('node:assert/strict');
const fs = require('node:fs');
const request = require('./request.cjs');
const path = '/state/persistence.json';
(async () => {
  if (process.argv[2] === 'seed') {
    const body = { username: 'persistence_check', firstName: 'Persistence', lastName: 'Check',
      email: 'persistence@example.test', password: 'Disposable123!' };
    const registered = await request('/api/v1/auth/register', { method: 'POST', body });
    assert.equal(registered.status, 201);
    const setCookie = registered.headers['set-cookie'][0];
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax']) assert(setCookie.includes(flag));
    const cookie = setCookie.split(';')[0];
    const band = await request('/api/v1/bands', { method: 'POST', cookie, body: { name: 'Persistence band' } });
    assert.equal(band.status, 201);
    const bandId = band.json().data.band.bandId;
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const event = await request(`/api/v1/bands/${bandId}/events`, { method: 'POST', cookie,
      body: { name: 'Persistence event', type: 'rehearsal', date, startTime: '18:00', endTime: '20:00', timezone: 'America/Toronto', location: 'Studio' } });
    assert.equal(event.status, 201);
    fs.writeFileSync(path, JSON.stringify({ cookie, bandId, eventId: event.json().data.event.eventId, date }), { mode: 0o600 });
  } else {
    const { cookie, bandId, eventId, date } = JSON.parse(fs.readFileSync(path));
    const me = await request('/api/v1/users/me', { cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json().data.user.username, 'persistence_check');
    const band = await request(`/api/v1/bands/${bandId}`, { cookie });
    assert.equal(band.status, 200);
    assert.equal(band.json().data.band.currentUserRole, 'leader');
    const event = await request(`/api/v1/bands/${bandId}/events/${eventId}`, { cookie });
    assert.equal(event.status, 200);
    assert.equal(event.json().data.event.timezone, 'America/Toronto');
    assert.equal(event.json().data.event.date, date);
  }
  console.log(`PASS persistence ${process.argv[2]}: real user, membership, event and signed session`);
})().catch(error => { console.error(error); process.exitCode = 1; });
