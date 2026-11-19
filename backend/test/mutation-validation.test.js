const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { z } = require('zod');
const { once } = require('node:events');
const { errorHandler } = require('../middleware/errors');
const { idSchema, routeIdSchema, voteVersionSchema, parse, validateBody, validateRouteId } = require('../middleware/validate-mutation');

test('mutation IDs use positive safe JSON integers and strict decimal route strings', () => {
  for (const value of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => parse(idSchema, value, 'userId'), { code: 'VALIDATION_ERROR' });
  }
  for (const value of ['01', '+1', '1e2', '1.0', ' 1', '9007199254740992']) {
    assert.throws(() => parse(routeIdSchema, value, 'bandId'), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(parse(idSchema, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(parse(routeIdSchema, '123'), 123);
  assert.equal(parse(voteVersionSchema, 0), 0);
});

test('changed route validation rejects unknown/nested fields and returns sanitized JSON errors', async () => {
  const app = express();
  app.use(express.json());
  app.post('/:bandId', validateRouteId('bandId'), validateBody(z.strictObject({
    name: z.string().trim().min(1), slots: z.array(z.strictObject({ userId: idSchema })),
  })), (req, res) => res.json({ id: req.params.bandId, body: req.body, intent: req.mutationBody }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function request(body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const valid = await request(JSON.stringify({ name: ' Name ', slots: [{ userId: 2 }] }));
    assert.equal(valid.body.body.name, 'Name');
    assert.equal(valid.body.intent.name, ' Name ');
    const unknown = await request(JSON.stringify({ name: 'Name', slots: [{ userId: 2, extra: true }], extra: true }));
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.body.error.details.map(d => d.field).sort(), ['extra', 'slots.0.extra']);
    const invalid = await request(JSON.stringify({ name: 'Name', slots: [{ userId: '2' }] }));
    assert.equal(invalid.body.error.details[0].field, 'slots.0.userId');
    const malformed = await request('{"privatePassword":"secret",');
    assert.deepEqual(malformed, { status: 400, body: { error: {
      code: 'VALIDATION_ERROR', message: 'Invalid JSON body', details: [{ field: 'body', message: 'Malformed JSON' }],
    } } });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
