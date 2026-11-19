const db = require('../db');
const HttpError = require('./http-error');

const IDLE_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 7 * IDLE_MS;
const userColumns = 'user_id, username, first_name, last_name, email, plan, is_active, created_at, email_verified_at, pending_email, version';

function now(req) {
  return (req.app.locals.sessionClock || Date.now)();
}

function authenticationError(reason) {
  const error = new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
  if (reason) error.reason = reason;
  return error;
}

function checkSession(req, user) {
  const session = req.session;
  if (!session?.userId) throw authenticationError();
  if (!user?.is_active || session.sessionGeneration !== user.session_generation) {
    throw authenticationError('revoked');
  }
  const authenticatedAt = Date.parse(session.authenticatedAt);
  const lastActivityAt = Date.parse(session.lastActivityAt);
  if (!Number.isFinite(authenticatedAt) || !Number.isFinite(lastActivityAt)) throw authenticationError();
  if (now(req) >= authenticatedAt + ABSOLUTE_MS) throw authenticationError('absolute_expired');
  if (now(req) >= lastActivityAt + IDLE_MS) throw authenticationError('idle_expired');
  session.access = user.email_verified_at ? 'full' : 'verification_required';
}

function sessionData(req) {
  const authenticatedAt = Date.parse(req.session.authenticatedAt);
  const absolute = authenticatedAt + ABSOLUTE_MS;
  const idle = Math.min(Date.parse(req.session.lastActivityAt) + IDLE_MS, absolute);
  return {
    access: req.session.access,
    authenticatedAt: new Date(authenticatedAt).toISOString(),
    idleExpiresAt: new Date(idle).toISOString(),
    absoluteExpiresAt: new Date(absolute).toISOString(),
  };
}

function boundCookie(req) {
  if (!Number.isFinite(Date.parse(req.session.authenticatedAt))
    || !Number.isFinite(Date.parse(req.session.lastActivityAt))) return;
  const data = sessionData(req);
  // Both the cookie and connect-pg-simple use this fixed deadline. Disable the
  // rolling duration reset: passive store touches must retain the same expiry.
  req.session.cookie.expires = new Date(Math.floor(Date.parse(data.idleExpiresAt) / 1000) * 1000);
  Object.defineProperty(req.session, 'touch', { configurable: true, value() { return this; } });
}

async function loadAccount(req, client = db, lock = false) {
  if (!req.session?.userId) throw authenticationError();
  const result = await client.query(
    `SELECT ${userColumns}, session_generation FROM users WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [req.session.userId],
  );
  checkSession(req, result.rows[0]);
  return result.rows[0];
}

async function startSession(req, user, registrationOrigin = false) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  const instant = new Date(now(req)).toISOString();
  Object.assign(req.session, {
    userId: user.user_id, sessionGeneration: user.session_generation,
    authenticatedAt: instant, lastActivityAt: instant,
    access: user.email_verified_at ? 'full' : 'verification_required', registrationOrigin,
  });
  boundCookie(req);
}

function publicUser(user) {
  const { session_generation, password_hash, ...safe } = user;
  return safe;
}

async function withSessionMutation(req, work) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const user = await loadAccount(req, client, true);
    if (!user.email_verified_at) throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification required');
    const result = await work(client);
    // The account lock prevents generation changes until this transaction commits.
    checkSession(req, user);
    await client.query('COMMIT');
    req.session.lastActivityAt = new Date(now(req)).toISOString();
    boundCookie(req);
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupSessions(req, res, userId) {
  // Generation is authoritative. Store/cookie cleanup cannot reverse a committed change.
  try { await db.query("DELETE FROM session WHERE sess->>'userId'=$1", [String(userId)]); } catch {}
  if (req.session?.userId === userId) {
    try { await new Promise(resolve => req.session.destroy(() => resolve())); } catch {}
    req.session = null;
    res.clearCookie('bandos.sid');
  }
}

module.exports = { cleanupSessions, IDLE_MS, ABSOLUTE_MS, userColumns, loadAccount, checkSession, sessionData, boundCookie, startSession, publicUser, withSessionMutation };
