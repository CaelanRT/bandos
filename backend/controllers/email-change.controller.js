const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { withMutation, checkVersion } = require('../utils/mutation');
const { userColumns, cleanupSessions } = require('../utils/account-session');
const { accountIssuance, issueToken, lockToken, lockRate, rateWait, recordAttempt } = require('../utils/account-tokens');
const { enqueueNotification } = require('../utils/notification-outbox');

const clock = req => (req.app.locals.sessionClock || Date.now)();
const encryptionKey = req => req.app.locals.outboxEncryptionKey || require('../config').getConfig().mail?.encryptionKey;
const conflict = () => new HttpError(409, 'ACCOUNT_CONFLICT', 'Username or email is already in use');

async function checkAddress(client, email, userId) {
  if ((await client.query('SELECT 1 FROM users WHERE LOWER(email)=$1 AND user_id<>$2', [email, userId])).rowCount) {
    throw conflict();
  }
}

async function securityNotice(client, user, address, text) {
  await enqueueNotification(client, { transitionId: randomUUID(), kind: 'email_change_notice',
    recipientIdentity: address, recipientUserId: user.user_id, securityPurpose: 'email_change_notice',
    securityAddress: address, payload: { subject: 'Your bandOS email address change', text, path: '/login' } });
}

async function initiateEmailChange(req, res) {
  const response = await withMutation(req, {
    authorize: async () => {},
    validate: async (client, locked, user) => {
      checkVersion(user.version, req.body.expectedVersion);
      if (!await bcrypt.compare(req.body.currentPassword, user.password_hash)) {
        throw new HttpError(403, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect',
          [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
      }
      await checkAddress(client, req.body.newEmail, user.user_id);
    },
    work: async (client, locked, user) => {
      const address = req.body.newEmail;
      if (address !== user.pending_email && address !== user.email) {
        await accountIssuance(client, { email: address, ip: req.ip, now: clock(req) });
        await client.query('UPDATE users SET pending_email=$2,version=version+1 WHERE user_id=$1', [user.user_id, address]);
        await issueToken(client, { user: { ...user, pending_email: address }, purpose: 'email_change',
          address, now: clock(req), encryptionKey: encryptionKey(req) });
        await securityNotice(client, user, user.email,
          'A change to your bandOS email address was requested. Your current address remains active until verification.');
      }
      const current = (await client.query(`SELECT ${userColumns} FROM users WHERE user_id=$1`, [user.user_id])).rows[0];
      return { status: 202, body: { data: { user: current } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function resendEmailChange(req, res) {
  const response = await withMutation(req, {
    authorize: async () => {},
    validate: async (client, locked, user) => {
      if (!user.pending_email) throw new HttpError(400, 'VALIDATION_ERROR', 'No email change is pending',
        [{ field: 'pending_email', message: 'Request an email change first' }]);
    },
    work: async (client, locked, user) => {
      await accountIssuance(client, { email: user.pending_email, ip: req.ip, now: clock(req) });
      await issueToken(client, { user, purpose: 'email_change', address: user.pending_email,
        now: clock(req), encryptionKey: encryptionKey(req) });
      return { status: 202, body: { data: { message: 'A verification email has been queued for your pending address' } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function confirmEmailChange(req, res) {
  const client = await db.pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    const key = `confirm:email_change:${req.ip}`;
    await lockRate(client, key);
    const wait = await rateWait(client, key, clock(req), 900000, 10);
    if (wait) {
      const error = new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many requests; try again later');
      error.retryAfter = wait;
      throw error;
    }
    let locked;
    try { locked = await lockToken(client, req.body.token, 'email_change', () => clock(req)); }
    catch (error) {
      if (error.code !== 'TOKEN_INVALID_OR_EXPIRED') throw error;
      await recordAttempt(client, key, clock(req));
      await client.query('COMMIT');
      throw error;
    }
    const { user, token } = locked;
    await checkAddress(client, token.target_email, user.user_id);
    const now = new Date(clock(req));
    // The unique active-address index also arbitrates concurrent claims by different accounts.
    await client.query(`UPDATE users SET email=$2,pending_email=NULL,email_verified_at=$3,
      version=version+1,session_generation=session_generation+1 WHERE user_id=$1`,
    [user.user_id, token.target_email, now]);
    await client.query('UPDATE account_tokens SET consumed_at=$2 WHERE token_id=$1', [token.token_id, now]);
    await client.query(`UPDATE account_tokens SET revoked_at=$2 WHERE user_id=$1
      AND purpose IN ('password_reset','email_change') AND consumed_at IS NULL AND revoked_at IS NULL`, [user.user_id, now]);
    await securityNotice(client, user, user.email, 'Your bandOS email address changed. Please log in again with your new address.');
    await securityNotice(client, user, token.target_email, 'Your new bandOS email address is verified. Please log in again.');
    await client.query('COMMIT');
    userId = user.user_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await cleanupSessions(req, res, userId);
  return res.json({ data: { message: 'Email address updated; please log in again' } });
}

module.exports = { initiateEmailChange, resendEmailChange, confirmEmailChange };
