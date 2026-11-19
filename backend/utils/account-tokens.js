const { randomBytes, randomUUID, createHash } = require('node:crypto');
const HttpError = require('./http-error');
const { enqueueNotification } = require('./notification-outbox');

const PURPOSES = {
  registration_verification: { lifetime: 86400000, path: '/verify-email', subject: 'Verify your bandOS email' },
  password_reset: { lifetime: 1800000, path: '/reset-password', subject: 'Reset your bandOS password' },
  email_change: { lifetime: 86400000, path: '/verify-email-change', subject: 'Verify your new bandOS email' },
};
const digest = token => createHash('sha256').update(token).digest();
const invalidToken = () => new HttpError(400, 'TOKEN_INVALID_OR_EXPIRED', 'Token is invalid or expired');

// Transaction-scoped locks serialize counters across processes, including unknown addresses.
async function lockRate(client, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
}
async function rateWait(client, key, now, window, limit, cooldown = 0) {
  const rows = (await client.query(`SELECT attempted_at FROM account_token_attempts
    WHERE rate_key=$1 AND attempted_at > $2 ORDER BY attempted_at`, [key, new Date(now - window)])).rows;
  let until = rows.length >= limit ? +rows[rows.length - limit].attempted_at + window : now;
  if (rows.length && cooldown) until = Math.max(until, +rows.at(-1).attempted_at + cooldown);
  return Math.max(0, Math.ceil((until - now) / 1000));
}
async function recordAttempt(client, key, now) {
  await client.query('INSERT INTO account_token_attempts (rate_key,attempted_at) VALUES ($1,$2)', [key, new Date(now)]);
}
async function accountIssuance(client, { email, ip, now }) {
  const addressKey = `address:${email.trim().toLowerCase()}`;
  const ipKey = `issuance-ip:${ip}`;
  for (const key of [addressKey, ipKey].sort()) await lockRate(client, key);
  const wait = Math.max(await rateWait(client, addressKey, now, 3600000, 5, 60000),
    await rateWait(client, ipKey, now, 3600000, 20));
  if (wait) {
    const error = new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many requests; try again later');
    error.retryAfter = wait;
    throw error;
  }
  await recordAttempt(client, addressKey, now);
  await recordAttempt(client, ipKey, now);
}

// Caller holds the account lock and includes issuance accounting in this transaction.
async function issueToken(client, { user, purpose, address, now, encryptionKey }) {
  const settings = PURPOSES[purpose];
  if (!settings || !address || (purpose === 'email_change' && address !== user.pending_email)
    || (purpose !== 'email_change' && address !== user.email)) throw new Error('Invalid token target');
  if (!encryptionKey) throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Email delivery is not configured');
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + settings.lifetime);
  await client.query(`UPDATE account_tokens SET revoked_at=$3 WHERE user_id=$1 AND purpose=$2
    AND consumed_at IS NULL AND revoked_at IS NULL`, [user.user_id, purpose, new Date(now)]);
  const token = (await client.query(`INSERT INTO account_tokens
    (user_id,purpose,token_digest,target_email,issued_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING token_id`,
  [user.user_id, purpose, digest(raw), address, new Date(now), expiresAt])).rows[0];
  await enqueueNotification(client, { transitionId: randomUUID(), kind: purpose, recipientIdentity: address,
    securityPurpose: purpose, recipientUserId: user.user_id, securityAddress: address, tokenId: token.token_id,
    token: raw, tokenExpiresAt: expiresAt,
    payload: { subject: settings.subject, text: 'Use this link to continue your bandOS request.', path: settings.path } }, encryptionKey);
  return token.token_id;
}

// Lock the account before its token, consistent with issuance and other account transitions.
async function lockToken(client, raw, purpose, clock) {
  const hash = digest(raw);
  const candidate = (await client.query('SELECT user_id FROM account_tokens WHERE token_digest=$1', [hash])).rows[0];
  if (!candidate) throw invalidToken();
  const user = (await client.query('SELECT * FROM users WHERE user_id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
  const token = (await client.query('SELECT * FROM account_tokens WHERE token_digest=$1 FOR UPDATE', [hash])).rows[0];
  if (!user?.is_active || !token || token.purpose !== purpose || token.consumed_at || token.revoked_at
    || clock() >= +token.expires_at || token.target_email !== (purpose === 'email_change' ? user.pending_email : user.email)) {
    throw invalidToken();
  }
  return { user, token };
}

module.exports = { digest, invalidToken, lockRate, rateWait, recordAttempt, accountIssuance, issueToken, lockToken };
