const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { withMutation, checkVersion } = require('../utils/mutation');

const { userColumns, sessionData, publicUser, cleanupSessions } = require('../utils/account-session');
const { removeMembership } = require('../utils/band-lifecycle');

async function findActiveUser(userId, includePassword = false, client = db) {
  const columns = includePassword ? `${userColumns}, password_hash` : userColumns;
  const result = await client.query(
    `SELECT ${columns} FROM users WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  if (!result.rows[0]) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
  return result.rows[0];
}

async function getMe(req, res) {
  const user = publicUser(req.account);
  return res.status(200).json({ data: { user, session: sessionData(req) } });
}

async function updateMe(req, res) {
  const response = await withMutation(req, {
    authorize: async () => {},
    validate: async (client, locked, user) => checkVersion(user.version, req.body.expectedVersion),
    work: async (client, locked, user) => {
      const { username = user.username, firstName = user.first_name, lastName = user.last_name } = req.body;
      if (username !== user.username || firstName !== user.first_name || lastName !== user.last_name) {
        await client.query(`UPDATE users SET username=$2,first_name=$3,last_name=$4,version=version+1
          WHERE user_id=$1`, [user.user_id, username, firstName, lastName]);
      }
      return { status: 200, body: { data: { user: await findActiveUser(user.user_id, false, client) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function deactivateMe(req, res) {
  const userId = req.session.userId;
  const affectedBands = async client => (await client.query(`SELECT band_id FROM user_bands WHERE user_id=$1
    UNION SELECT band_id FROM bands WHERE owner_user_id=$1 AND is_active=true`, [userId])).rows.map(row => row.band_id);
  const response = await withMutation(req, {
    discover: async client => ({ bands: await affectedBands(client) }),
    authorize: async (client, locked) => {
      // An add/transfer can commit while discovery waits for the account lock.
      // Retry discovery rather than acquiring another band out of lock order.
      const current = await affectedBands(client);
      if (current.some(id => !locked.bands.some(band => band.band_id === id))) {
        const error = new Error('Account bands changed during lock discovery');
        error.code = '40001';
        throw error;
      }
    },
    validate: async (client, locked, user) => {
      checkVersion(user.version, req.body.expectedVersion);
      if (!await bcrypt.compare(req.body.password, user.password_hash)) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      }
      const blocking = locked.bands.filter(band => band.is_active && band.owner_user_id === userId);
      if (blocking.length) throw new HttpError(409, 'LEADERSHIP_TRANSFER_REQUIRED',
        'Transfer ownership or delete your bands before deactivating',
        { bands: blocking.map(band => ({ bandId: band.band_id, name: band.name })) });
    },
    work: async (client, locked) => {
      const now = new Date((req.app.locals.sessionClock || Date.now)());
      const current = await affectedBands(client);
      for (const band of locked.bands) {
        if (current.includes(band.band_id)) {
          await removeMembership(client, band.band_id, userId, now, 'account_deactivated');
        }
      }
      await client.query(`UPDATE users SET is_active=false,pending_email=NULL,
        version=version+1,session_generation=session_generation+1 WHERE user_id=$1`, [userId]);
      await client.query(`UPDATE account_tokens SET revoked_at=$2 WHERE user_id=$1
        AND consumed_at IS NULL AND revoked_at IS NULL`, [userId, now]);
      return { status: 200, body: { data: { message: 'Account deactivated' } } };
    },
  });
  await cleanupSessions(req, res, userId);
  return res.status(response.status).json(response.body);
}

module.exports = { getMe, updateMe, deactivateMe };
