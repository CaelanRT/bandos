const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { withMutation, checkVersion } = require('../utils/mutation');

const { userColumns, sessionData, publicUser, withSessionMutation } = require('../utils/account-session');

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
  const body = await withSessionMutation(req, async (client) => {
    const user = await findActiveUser(req.session.userId, true, client);
    const passwordMatches = await bcrypt.compare(req.body.password, user.password_hash);
    if (!passwordMatches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    await client.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.user_id]);
    return { data: { message: 'Account deactivated' } };
  });
  await new Promise((resolve, reject) => req.session.destroy((error) => (
    error ? reject(error) : resolve()
  )));
  res.clearCookie('bandos.sid');
  return res.status(200).json(body);
}

module.exports = { getMe, updateMe, deactivateMe };
