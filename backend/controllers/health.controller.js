const db = require('../db');
const { healthQueryTimeoutMs } = require('../config').getConfig();

async function getHealth(req, res) {
  try {
    await db.query({ text: 'SELECT 1', query_timeout: healthQueryTimeoutMs });
    return res.status(200).json({ data: { status: 'ok' } });
  } catch (error) {
    return res.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' },
    });
  }
}

module.exports = { getHealth };
