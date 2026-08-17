const db = require('../db');

function mapMember(row) {
  return {
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
  };
}

function mapBand(row, currentUserRole, members) {
  return {
    bandId: row.band_id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    currentUserRole,
    members,
  };
}

function mapBandSummary(row) {
  return {
    bandId: row.band_id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    currentUserRole: row.current_user_role,
  };
}

async function createBand(req, res) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const bandResult = await client.query(
      `INSERT INTO bands (name, is_active)
       VALUES ($1, true)
       RETURNING band_id, name, is_active, created_at`,
      [req.body.name],
    );
    const band = bandResult.rows[0];

    await client.query(
      `INSERT INTO user_bands (user_id, band_id, role)
       VALUES ($1, $2, 'leader')`,
      [req.session.userId, band.band_id],
    );

    const creatorResult = await client.query(
      `SELECT user_id, username, first_name, last_name
       FROM users
       WHERE user_id = $1
       LIMIT 1`,
      [req.session.userId],
    );

    await client.query('COMMIT');

    const creator = mapMember({
      ...creatorResult.rows[0],
      role: 'leader',
    });

    return res.status(201).json({
      data: {
        band: mapBand(band, 'leader', [creator]),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listBands(req, res) {
  const result = await db.query(
    `SELECT
       b.band_id,
       b.name,
       b.is_active,
       b.created_at,
       ub.role AS current_user_role
     FROM bands AS b
     INNER JOIN user_bands AS ub ON ub.band_id = b.band_id
     WHERE ub.user_id = $1
       AND b.is_active = true
     ORDER BY b.created_at ASC, b.band_id ASC`,
    [req.session.userId],
  );

  return res.status(200).json({
    data: {
      bands: result.rows.map(mapBandSummary),
    },
  });
}

async function getBand(req, res) {
  const result = await db.query(
    `SELECT
       u.user_id,
       u.username,
       u.first_name,
       u.last_name,
       ub.role
     FROM user_bands AS ub
     INNER JOIN users AS u ON u.user_id = ub.user_id
     WHERE ub.band_id = $1
       AND u.is_active = true
     ORDER BY
       CASE WHEN ub.role = 'leader' THEN 0 ELSE 1 END,
       LOWER(u.username) ASC,
       u.user_id ASC`,
    [req.band.bandId],
  );

  return res.status(200).json({
    data: {
      band: {
        ...req.band,
        currentUserRole: req.bandRole,
        members: result.rows.map(mapMember),
      },
    },
  });
}

module.exports = { createBand, listBands, getBand };
