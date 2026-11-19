const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');

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
  const body = await withSessionMutation(req, async (client) => {
    const { username, firstName, lastName } = req.body;
    const result = await client.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name)
       WHERE user_id = $4 AND is_active = true
       RETURNING ${userColumns}`,
      [username ?? null, firstName ?? null, lastName ?? null, req.session.userId],
    );
    if (!result.rows[0]) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
    return { data: { user: result.rows[0] } };
  });
  return res.status(200).json(body);
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
