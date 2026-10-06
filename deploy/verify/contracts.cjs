const assert = require('node:assert/strict');
const request = require('./request.cjs');
(async () => {
  const spoof = { 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.7', forwarded: 'for=203.0.113.7;proto=https' };
  assert.equal((await request('/api/v1/users/me', { direct: true, headers: spoof })).status, 426);
  assert.equal((await request('/api/v1/health', { direct: true })).status, 200);
  assert.equal((await request('/api/v1/health/', { direct: true })).status, 426);
  const ui = await request('/bands/999/events/999');
  assert.equal(ui.status, 200);
  assert.match(ui.headers['content-type'], /text\/html/);
  assert.match(ui.headers['content-security-policy'], /default-src 'self'/);
  assert.match(ui.headers['cache-control'], /no-cache/);
  assert.equal(ui.headers['x-content-type-options'], 'nosniff');
  assert.equal((await request('/unknown-ui-path')).text, ui.text);
  assert.equal((await request('/assets/missing.js')).status, 404);
  assert.equal((await request('/bands/999', { method: 'POST' })).status, 404);
  const asset = ui.text.match(/src="([^"]+\.js)"/)[1];
  const js = await request(asset);
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  assert.match(js.headers['cache-control'], /immutable/);
  assert(!js.text.includes('http://db:') && !js.text.includes('http://app:'));
  const missing = await request('/api/v1/no-such-route', { headers: { origin: 'https://wrong.example.invalid' } });
  assert.equal(missing.status, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
  assert.equal(missing.headers['access-control-allow-origin'], process.env.CLIENT_ORIGIN);
  assert.equal(missing.headers['access-control-allow-credentials'], 'true');
  // Invalid requests count too: changing public forwarded IPs must not evade limits.
  for (const [path, limit] of [['register', 5], ['login', 10]]) {
    for (let n = 1; n <= limit + 1; n++) {
      const result = await request(`/api/v1/auth/${path}`, { method: 'POST', body: {},
        headers: { 'x-forwarded-for': `198.51.100.${n}`, 'x-forwarded-proto': 'http', forwarded: `for=198.51.100.${n}` } });
      assert.equal(result.status, n <= limit ? 400 : 429, `${path} attempt ${n}`);
      if (n > limit) assert.equal(result.json().error.code, 'TOO_MANY_ATTEMPTS');
    }
  }
  console.log('PASS HTTPS edge/trusted peer, untrusted spoof rejection, exact CORS, static/API boundaries, CSP/cache/content headers and unchanged 5/10 limits');
})().catch(error => { console.error(error); process.exitCode = 1; });
