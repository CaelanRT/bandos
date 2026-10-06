const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { loadConfig } = require('../config');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const valid = {
  DB_HOST: 'localhost', DB_NAME: 'runtime_test', DB_USERNAME: 'runtime_test',
  DB_PASSWORD: 'private-database-value', SESSION_SECRET: 'private-session-value',
  CLIENT_ORIGIN: 'http://localhost:5173',
};

test('defaults and explicit runtime settings', () => {
  const config = loadConfig(valid);
  assert.equal(config.port, 3000);
  assert.equal(config.database.port, 5432);
  assert.equal(config.bcryptRounds, 12);
  assert.equal(config.database.ssl, false);
  assert.equal(config.trustProxy, false);
  const explicit = loadConfig({ ...valid, PORT: '3001', DB_PORT: '5433', BCRYPT_ROUNDS: '4',
    DB_SSL: 'true', TRUST_PROXY: '127.0.0.1, ::1/128, 10.0.0.0/24' });
  assert.equal(explicit.port, 3001);
  assert.equal(explicit.database.port, 5433);
  assert.equal(explicit.bcryptRounds, 4);
  assert.equal(explicit.database.ssl.rejectUnauthorized, true);
  assert.equal(explicit.database.ssl.ca, undefined);
  assert.deepEqual(explicit.trustProxy, ['127.0.0.1', '::1/128', '10.0.0.0/24']);
});

test('required values and invalid settings fail with secret-safe diagnostics', () => {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD', 'SESSION_SECRET', 'CLIENT_ORIGIN']) {
    for (const value of [undefined, '', ' ']) {
      assert.throws(() => loadConfig({ ...valid, [name]: value }), new RegExp(name));
    }
  }
  const invalid = {
    PORT: ['', '0', '65536', '3.5', '3e3', '-1'], DB_PORT: ['', '0', '65536', 'NaN'],
    BCRYPT_ROUNDS: ['', '3', '32', '12.5', 'NaN'], DB_SSL: ['', 'yes', 'FALSE'],
    TRUST_PROXY: ['', 'true', '1', 'loopback', '0.0.0.0/0', '::/0', '10.0.0.1/33', '::1/129', '127.0.0.1,'],
    NODE_ENV: ['', 'prod'], CLIENT_ORIGIN: ['*', 'https://user:password@example.com', 'https://example.com/', 'https://example.com/path', 'ftp://example.com'],
    DB_SSL_CA_FILE: ['/missing/private/ca.pem'],
  };
  for (const [name, values] of Object.entries(invalid)) {
    for (const value of values) assert.throws(() => loadConfig({ ...valid, [name]: value }), new RegExp(name));
  }
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: 'production' }), /CLIENT_ORIGIN/);
  assert.throws(() => loadConfig({ ...valid, DB_SSL: 'true', DB_SSL_CA_FILE: '/missing/private/ca.pem' }), /DB_SSL_CA_FILE/);
  try { loadConfig({ ...valid, PORT: valid.DB_PASSWORD, CLIENT_ORIGIN: valid.SESSION_SECRET }); }
  catch (error) {
    assert.ok(!error.message.includes(valid.DB_PASSWORD));
    assert.ok(!error.message.includes(valid.SESSION_SECRET));
  }
});

test('invalid configuration exits before listening and does not print secrets', () => {
  const result = spawnSync(process.execPath, ['app.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, ...valid, PORT: valid.DB_PASSWORD, DOTENV_CONFIG_QUIET: 'true' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PORT: must be an integer/);
  assert.ok(!result.stderr.includes(valid.DB_PASSWORD));
  assert.ok(!result.stdout.includes('listening'));
});

test('malformed or unreadable CA files fail safely', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bandos-ca-test-'));
  const file = path.join(directory, 'ca.pem');
  try {
    for (const ca of ['', 'not a certificate', '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----']) {
      fs.writeFileSync(file, ca);
      assert.throws(() => loadConfig({ ...valid, DB_SSL: 'true', DB_SSL_CA_FILE: file }), /DB_SSL_CA_FILE: must be a readable PEM/);
    }
  } finally { fs.rmSync(directory, { recursive: true }); }
});
