const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createResendAdapter, render, serializeMail } = require('../utils/notification-mail');
const { loadConfig } = require('../config');

test('Resend uses stable keys, bounded request and sanitized results', async () => {
  const payload = { from: 'a@example.test', to: ['b@example.test'], subject: 'Saved', text: 'Saved' };
  assert.equal(serializeMail(payload), serializeMail({ text: payload.text, subject: payload.subject, to: payload.to, from: payload.from }));
  let response;
  const adapter = createResendAdapter('private-api-key', async (url, request) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(request.headers['Idempotency-Key'], 'bandos-notification/42');
    assert.equal(request.headers.Authorization, 'Bearer private-api-key');
    assert.deepEqual(JSON.parse(request.body), payload);
    assert.ok(request.signal instanceof AbortSignal);
    return response;
  });
  for (const status of [200, 400, 422, 429, 500, 401, 409]) {
    response = new Response(JSON.stringify(status === 200 ? { id: 'provider-id' } : { message: 'private provider error' }), {
      status, headers: { 'Retry-After': '60' },
    });
    const result = await adapter.send(payload, 'bandos-notification/42');
    assert.equal(result.status, status === 200 ? 'accepted' : [400, 422].includes(status) ? 'permanent' : 'transient');
    if (status === 200) assert.equal(result.id, 'provider-id');
    else assert.ok(result.retryAt >= Date.now() + 59000);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
  const unavailable = createResendAdapter('secret', async () => { throw new Error('private secret'); });
  assert.deepEqual(await unavailable.send(payload, 'key'), { status: 'transient' });
});

test('mail runtime configuration requires complete secret-safe settings', () => {
  const base = { DB_HOST: 'localhost', DB_NAME: 'test', DB_USERNAME: 'test', DB_PASSWORD: 'secret',
    SESSION_SECRET: 'secret', CLIENT_ORIGIN: 'https://app.example.test' };
  assert.equal(loadConfig(base).mail, null);
  const mail = { RESEND_API_KEY: 'secret', EMAIL_FROM: 'bandos@example.test', OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
  assert.equal(loadConfig({ ...base, ...mail }).mail.encryptionKey.length, 32);
  for (const name of Object.keys(mail)) {
    const incomplete = { ...mail };
    delete incomplete[name];
    assert.throws(() => loadConfig({ ...base, ...incomplete }), new RegExp(name));
  }
  assert.throws(() => loadConfig({ ...base, ...mail, OUTBOX_ENCRYPTION_KEY: 'private-invalid-secret' }), /OUTBOX_ENCRYPTION_KEY/);
  assert.throws(() => loadConfig({ ...base, ...mail, EMAIL_FROM: 'a@example.test\r\nInjected' }), /EMAIL_FROM/);
});

test('render escapes text and token links use configured origin', () => {
  const result = render({ subject: 'Security', text: '"<&\' user text', path: '/reset?x=1' }, {
    origin: 'https://app.example.test', from: 'bandos@example.test', address: 'user@example.test', token: 'a+b&c',
  });
  assert.ok(result.html.includes('&quot;&lt;&amp;&#39; user text'));
  assert.ok(result.text.includes('https://app.example.test/reset?x=1&token=a%2Bb%26c'));
  assert.throws(() => render({ subject: 'Bad\nHeader', text: 'text' }, {}));
});
