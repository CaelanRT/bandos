const db = require('../db');

async function getHealth(req, res) {
  try {
    await db.query('SELECT 1');
    return res.status(200).json({ data: { status: 'ok' } });
  } catch (error) {
    return res.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' },
    });
  }
}

module.exports = { getHealth };
