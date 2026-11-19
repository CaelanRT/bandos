const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { bcryptRounds } = require('../config').getConfig();

const { userColumns, startSession, publicUser, sessionData, checkSession, boundCookie } = require('../utils/account-session');

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (
    error ? reject(error) : resolve()
  )));
}

const { accountIssuance, issueToken, lockToken, lockRate, rateWait, recordAttempt } = require('../utils/account-tokens');
const clock = req => (req.app.locals.sessionClock || Date.now)();
const encryptionKey = req => req.app.locals.outboxEncryptionKey || require('../config').getConfig().mail?.encryptionKey;

// Persist the regenerated session with the account transition, rather than relying
// on the response's later store write for the atomic registration/promotion.
async function persistSession(client, req) {
  await client.query(`INSERT INTO session (sid,sess,expire) VALUES ($1,$2,$3)
    ON CONFLICT (sid) DO UPDATE SET sess=EXCLUDED.sess,expire=EXCLUDED.expire`,
  [req.sessionID, JSON.stringify(req.session), req.session.cookie.expires]);
}

async function register(req, res) {
  const { username, firstName, lastName, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  let createdSession = false;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await accountIssuance(client, { email, ip: req.ip, now: clock(req) });
    const user = (await client.query(
      `INSERT INTO users (username, first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${userColumns}, session_generation`,
      [username, firstName, lastName, email, passwordHash],
    )).rows[0];
    await issueToken(client, { user, purpose: 'registration_verification', address: email,
      now: clock(req), encryptionKey: encryptionKey(req) });
    await startSession(req, user, true);
    createdSession = true;
    await persistSession(client, req);
    await client.query('COMMIT');
    return res.status(201).json({ data: { user: publicUser(user), session: sessionData(req) } });
  } catch (error) {
    await client.query('ROLLBACK');
    // A rolled-back account must not be saved by express-session on the error response.
    if (createdSession) await destroySession(req);
    throw error;
  } finally { client.release(); }
}

async function resendVerification(req, res) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const email = req.body.email;
    if (!encryptionKey(req)) throw new HttpError(503, 'MAIL_UNAVAILABLE', 'Email delivery is not configured');
    await accountIssuance(client, { email, ip: req.ip, now: clock(req) });
    const user = (await client.query('SELECT * FROM users WHERE LOWER(email)=$1 FOR UPDATE', [email])).rows[0];
    if (user?.is_active && !user.email_verified_at) {
      await issueToken(client, { user, purpose: 'registration_verification', address: user.email,
        now: clock(req), encryptionKey: encryptionKey(req) });
    }
    await client.query('COMMIT');
    return res.status(202).json({ data: { message: 'If eligible, a verification email has been queued' } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function confirmVerification(req, res) {
  const client = await db.pool.connect();
  let promoted = false;
  try {
    await client.query('BEGIN');
    const key = `confirm:registration_verification:${req.ip}`;
    await lockRate(client, key);
    const wait = await rateWait(client, key, clock(req), 900000, 10);
    if (wait) {
      const error = new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many requests; try again later');
      error.retryAfter = wait;
      throw error;
    }
    let locked;
    try {
      locked = await lockToken(client, req.body.token, 'registration_verification', () => clock(req));
    } catch (error) {
      if (error.code !== 'TOKEN_INVALID_OR_EXPIRED') throw error;
      await recordAttempt(client, key, clock(req));
      await client.query('COMMIT');
      throw error;
    }
    const { user, token } = locked;
    let continuation = false;
    if (req.session?.userId === user.user_id && req.session.registrationOrigin === true) {
      try { checkSession(req, user); continuation = true; }
      catch (error) { if (error.code !== 'AUTHENTICATION_REQUIRED') throw error; }
    }
    const now = clock(req);
    await client.query('UPDATE account_tokens SET consumed_at=$2 WHERE token_id=$1', [token.token_id, new Date(now)]);
    const verified = (await client.query(`UPDATE users SET email_verified_at=$2,
      session_generation=session_generation+1,version=version+1 WHERE user_id=$1
      RETURNING ${userColumns},session_generation`, [user.user_id, new Date(now)])).rows[0];
    if (continuation) {
      // Recheck deadlines immediately before promoting; authentication age is unchanged.
      try { checkSession(req, user); }
      catch (error) { if (error.code !== 'AUTHENTICATION_REQUIRED') throw error; continuation = false; }
    }
    if (continuation) {
      const original = req.session;
      await startSession(req, verified, false);
      promoted = true;
      // Regeneration performs store I/O; it cannot extend an elapsed original deadline.
      try { checkSession({ session: original, app: req.app }, user); }
      catch (error) {
        if (error.code !== 'AUTHENTICATION_REQUIRED') throw error;
        await destroySession(req);
        promoted = false;
        continuation = false;
      }
      if (continuation) {
        req.session.authenticatedAt = original.authenticatedAt;
        boundCookie(req);
        await persistSession(client, req);
      }
    }
    await client.query("DELETE FROM session WHERE sess->>'userId'=$1 AND sid<>$2",
      [String(user.user_id), continuation ? req.sessionID : '']);
    await client.query('COMMIT');
    return res.json({ data: { message: 'Email verified', user: continuation ? publicUser(verified) : null,
      session: continuation ? sessionData(req) : null } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (promoted) await destroySession(req);
    throw error;
  } finally { client.release(); }
}

async function login(req, res) {
  const { email, password } = req.body;
  const result = await db.query(
    `SELECT ${userColumns}, session_generation, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );
  const user = result.rows[0];
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatches || !user.is_active) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  await startSession(req, user);

  return res.status(200).json({ data: { user: publicUser(user), session: sessionData(req) } });
}

async function logout(req, res) {
  if (req.session) await destroySession(req);
  res.clearCookie('bandos.sid');
  return res.status(200).json({ data: { message: 'Logged out' } });
}

module.exports = { register, login, logout, resendVerification, confirmVerification };
