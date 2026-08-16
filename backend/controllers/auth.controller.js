const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');

const userColumns = `
  user_id, username, first_name, last_name, email, plan, is_active, created_at
`;

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (
    error ? reject(error) : resolve()
  )));
}

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (
    error ? reject(error) : resolve()
  )));
}

async function register(req, res) {
  const { username, firstName, lastName, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS));
  const result = await db.query(
    `INSERT INTO users (username, first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${userColumns}`,
    [username, firstName, lastName, email, passwordHash],
  );

  await regenerateSession(req);
  req.session.userId = result.rows[0].user_id;

  return res.status(201).json({ message: `user: ${result.rows[0].user_id} logged in` });
}

async function login(req, res) {
  const { email, password } = req.body;
  const result = await db.query(
    `SELECT ${userColumns}, password_hash
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

  await regenerateSession(req);
  req.session.userId = user.user_id;

  return res.status(200).json({ message: `user: ${user.user_id} logged in` });
}

async function logout(req, res) {
  if (req.session) await destroySession(req);
  res.clearCookie('bandos.sid');
  return res.status(200).json({ data: { message: 'Logged out' } });
}

module.exports = { register, login, logout };
