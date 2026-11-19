const bcrypt = require('bcrypt');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { bcryptRounds } = require('../config').getConfig();

const { userColumns, startSession, publicUser, sessionData } = require('../utils/account-session');

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (
    error ? reject(error) : resolve()
  )));
}

async function register(req, res) {
  const { username, firstName, lastName, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const result = await db.query(
    `INSERT INTO users (username, first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${userColumns}, session_generation`,
    [username, firstName, lastName, email, passwordHash],
  );

  await startSession(req, result.rows[0], true);

  return res.status(201).json({ data: { user: publicUser(result.rows[0]), session: sessionData(req) } });
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

module.exports = { register, login, logout };
