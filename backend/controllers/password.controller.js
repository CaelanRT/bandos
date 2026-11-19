const bcrypt = require('bcrypt');
const { randomBytes, randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { bcryptRounds } = require('../config').getConfig();
const { accountIssuance, issueToken, lockToken, lockRate, rateWait, recordAttempt, digest } = require('../utils/account-tokens');
const { encrypt } = require('../utils/notification-mail');
const { enqueueNotification } = require('../utils/notification-outbox');
const { checkSession, cleanupSessions } = require('../utils/account-session');
const { withMutation, checkVersion } = require('../utils/mutation');

const clock = req => (req.app.locals.sessionClock || Date.now)();
const encryptionKey = req => req.app.locals.outboxEncryptionKey || require('../config').getConfig().mail?.encryptionKey;
const success = { data: { message: 'Password updated; please log in again' } };

async function forgotPassword(req, res) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const email = req.body.email;
    const key = encryptionKey(req);
    if (!key) throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Email delivery is not configured');
    await accountIssuance(client, { email, ip: req.ip, now: clock(req) });
    const user = (await client.query('SELECT * FROM users WHERE LOWER(email)=$1 FOR UPDATE', [email])).rows[0];
    if (user?.is_active) {
      await issueToken(client, { user, purpose: 'password_reset', address: user.email, now: clock(req), encryptionKey: key });
    } else {
      // Do equivalent credential generation/encryption for ineligible addresses.
      const raw = randomBytes(32).toString('base64url');
      digest(raw);
      encrypt({ token: raw }, key);
    }
    await client.query('COMMIT');
    return res.status(202).json({ data: { message: 'If eligible, a password reset email has been queued' } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Account lock, password change, generation and security effect share one commit.
async function updatePassword(client, req, user, hash) {
  const now = new Date(clock(req));
  await client.query(`UPDATE users SET password_hash=$2,version=version+1,
    session_generation=session_generation+1 WHERE user_id=$1`, [user.user_id, hash]);
  await client.query(`UPDATE account_tokens SET revoked_at=$2 WHERE user_id=$1 AND purpose='password_reset'
    AND consumed_at IS NULL AND revoked_at IS NULL`, [user.user_id, now]);
  await enqueueNotification(client, { transitionId: randomUUID(), kind: 'password_changed',
    recipientIdentity: user.email, recipientUserId: user.user_id, securityPurpose: 'password_changed',
    securityAddress: user.email, payload: { subject: 'Your bandOS password changed',
      text: 'Your password was updated. Please log in again. If this was not you, reset your password.', path: '/login' } });
}

async function resetPassword(req, res) {
  // Keep bcrypt work outside the account lock; malformed passwords are rejected by validation.
  const hash = await bcrypt.hash(req.body.newPassword, bcryptRounds);
  const client = await db.pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    const key = `confirm:password_reset:${req.ip}`;
    await lockRate(client, key);
    const wait = await rateWait(client, key, clock(req), 900000, 10);
    if (wait) {
      const error = new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many requests; try again later');
      error.retryAfter = wait;
      throw error;
    }
    let locked;
    try { locked = await lockToken(client, req.body.token, 'password_reset', () => clock(req)); }
    catch (error) {
      if (error.code !== 'TOKEN_INVALID_OR_EXPIRED') throw error;
      await recordAttempt(client, key, clock(req));
      await client.query('COMMIT');
      throw error;
    }
    const { user, token } = locked;
    await client.query('UPDATE account_tokens SET consumed_at=$2 WHERE token_id=$1', [token.token_id, new Date(clock(req))]);
    await updatePassword(client, req, user, hash);
    await client.query('COMMIT');
    userId = user.user_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await cleanupSessions(req, res, userId);
  return res.json(success);
}

async function changePassword(req, res) {
  const response = await withMutation(req, {
    authorize: async () => {},
    validate: async (client, locked, user) => {
      checkVersion(user.version, req.body.expectedVersion);
      if (!await bcrypt.compare(req.body.currentPassword, user.password_hash)) {
        throw new HttpError(403, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect',
          [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
      }
    },
    work: async (client, locked, user) => {
      const hash = await bcrypt.hash(req.body.newPassword, bcryptRounds);
      checkSession(req, user);
      await updatePassword(client, req, user, hash);
      return { status: 200, body: success };
    },
  });
  await cleanupSessions(req, res, req.session.userId);
  return res.status(response.status).json(response.body);
}

module.exports = { forgotPassword, resetPassword, changePassword };
