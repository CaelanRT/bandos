const db = require('../db');
const HttpError = require('../utils/http-error');

async function loadBandMembership(req, res, next) {
  const result = await db.query(
    `SELECT
       b.band_id,
       b.name,
       b.is_active,
       b.created_at,
       ub.role
     FROM bands AS b
     INNER JOIN user_bands AS ub ON ub.band_id = b.band_id
     WHERE b.band_id = $1
       AND b.is_active = true
       AND ub.user_id = $2
     LIMIT 1`,
    [req.params.bandId, req.session.userId],
  );

  const membership = result.rows[0];

  if (!membership) {
    return next(new HttpError(404, 'BAND_NOT_FOUND', 'Band not found'));
  }

  req.band = {
    bandId: membership.band_id,
    name: membership.name,
    isActive: membership.is_active,
    createdAt: membership.created_at,
  };
  req.bandRole = membership.role;

  return next();
}

function requireBandLeader(req, res, next) {
  if (req.bandRole !== 'leader') {
    return next(
      new HttpError(403, 'LEADER_REQUIRED', 'Band leader access required'),
    );
  }

  return next();
}

module.exports = { loadBandMembership, requireBandLeader };
