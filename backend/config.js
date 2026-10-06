const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const { X509Certificate } = require('node:crypto');

function loadConfig(env) {
  const errors = [];
  function required(name) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) errors.push(`${name}: required nonempty value`);
    return value;
  }
  function integer(name, fallback, min, max) {
    if (env[name] === undefined) return fallback;
    const value = Number(env[name]);
    if (!/^\d+$/.test(env[name]) || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${name}: must be an integer from ${min} to ${max}`);
    }
    return value;
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    errors.push('NODE_ENV: must be development, test, or production');
  }
  const clientOrigin = required('CLIENT_ORIGIN');
  try {
    const url = new URL(clientOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== clientOrigin
      || (nodeEnv === 'production' && url.protocol !== 'https:')) throw new Error();
  } catch {
    errors.push('CLIENT_ORIGIN: must be one HTTP(S) origin without path, credentials, query, or fragment; production requires HTTPS');
  }

  const sessionSecret = required('SESSION_SECRET');
  const database = {
    host: required('DB_HOST'),
    database: required('DB_NAME'),
    user: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    port: integer('DB_PORT', 5432, 1, 65535),
    ssl: false,
  };
  const port = integer('PORT', 3000, 1, 65535);
  const bcryptRounds = integer('BCRYPT_ROUNDS', 12, 4, 31);
  const ssl = env.DB_SSL ?? 'false';
  if (!['true', 'false'].includes(ssl)) errors.push('DB_SSL: must be true or false');
  if (ssl === 'true') {
    database.ssl = {
      rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(database.host, certificate),
    };
  }
  if (env.DB_SSL_CA_FILE !== undefined) {
    if (ssl !== 'true') errors.push('DB_SSL_CA_FILE: requires DB_SSL=true');
    else {
      try {
        const ca = fs.readFileSync(env.DB_SSL_CA_FILE, 'utf8');
        const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
        if (!certificates) throw new Error();
        certificates.forEach((certificate) => new X509Certificate(certificate));
        tls.createSecureContext({ ca });
        database.ssl.ca = ca;
      } catch {
        errors.push('DB_SSL_CA_FILE: must be a readable PEM CA certificate bundle');
      }
    }
  }

  let trustProxy = false;
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== 'false') {
    const entries = env.TRUST_PROXY.split(',').map((entry) => entry.trim());
    const valid = entries.every((entry) => {
      const [address, prefix, extra] = entry.split('/');
      const family = net.isIP(address);
      return family && extra === undefined && (prefix === undefined
        || (/^\d+$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128)));
    });
    if (!valid) errors.push('TRUST_PROXY: must be false or a comma-separated list of proxy IP addresses/CIDRs with nonzero prefixes; booleans, hop counts, and universal trust are forbidden');
    else trustProxy = entries;
  }
  if (errors.length) throw new Error(`Invalid runtime configuration:\n${errors.join('\n')}`);
  return { port, isProduction: nodeEnv === 'production', clientOrigin, sessionSecret, bcryptRounds, database, trustProxy };
}

let cached;
function getConfig() {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}

module.exports = { loadConfig, getConfig };
