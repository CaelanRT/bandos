const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { serializeUser } = require('../utils/user');

const userColumns = `
  user_id, username, first_name, last_name, email, plan, is_active, created_at
`;

async function findActiveUser(userId, includePassword = false) {
  const columns = includePassword ? `${userColumns}, password_hash` : userColumns;
  const result = await db.query(
    `SELECT ${columns} FROM users WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  if (!result.rows[0]) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
  return result.rows[0];
}

async function getMe(req, res) {
  const user = await findActiveUser(req.session.userId);
  return res.status(200).json({ data: { user: serializeUser(user) } });
}

async function updateMe(req, res) {
  const { username, firstName, lastName } = req.validatedBody;
  const result = await db.query(
    `UPDATE users
     SET username = COALESCE($1, username),
         first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name)
     WHERE user_id = $4 AND is_active = true
     RETURNING ${userColumns}`,
    [username ?? null, firstName ?? null, lastName ?? null, req.session.userId],
  );
  if (!result.rows[0]) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
  return res.status(200).json({ data: { user: serializeUser(result.rows[0]) } });
}

async function deactivateMe(req, res) {
  const user = await findActiveUser(req.session.userId, true);
  const passwordMatches = await bcrypt.compare(req.validatedBody.password, user.password_hash);
  if (!passwordMatches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid password');

  await db.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.user_id]);
  await new Promise((resolve, reject) => req.session.destroy((error) => (
    error ? reject(error) : resolve()
  )));
  res.clearCookie('bandos.sid');
  return res.status(200).json({ data: { message: 'Account deactivated' } });
}

module.exports = { getMe, updateMe, deactivateMe };
