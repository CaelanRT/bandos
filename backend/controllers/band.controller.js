const { withSessionMutation } = require('../utils/account-session');
const db = require('../db');
const HttpError = require('../utils/http-error');

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

async function findActiveBandMembers(bandId, client = db) {
  const result = await client.query(
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
    [bandId],
  );

  return result.rows.map(mapMember);
}

async function createBand(req, res) {
  const body = await withSessionMutation(req, async (client) => {
    const bandResult = await client.query(
      `INSERT INTO bands (name, owner_user_id, is_active)
       VALUES ($1, $2, true)
       RETURNING band_id, name, is_active, created_at`,
      [req.body.name, req.session.userId],
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

    const creator = mapMember({
      ...creatorResult.rows[0],
      role: 'leader',
    });

    return {
      data: {
        band: mapBand(band, 'leader', [creator]),
      },
    };
  });
  return res.status(201).json(body);
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
  const members = await findActiveBandMembers(req.band.bandId);

  return res.status(200).json({
    data: {
      band: {
        ...req.band,
        currentUserRole: req.bandRole,
        members,
      },
    },
  });
}

async function updateBand(req, res) {
  const body = await withSessionMutation(req, async (client) => {
    const result = await client.query(
      `UPDATE bands
       SET name = $1
       WHERE band_id = $2
         AND is_active = true
       RETURNING band_id, name, is_active, created_at`,
      [req.body.name, req.band.bandId],
    );
    const updatedBand = result.rows[0];

    if (!updatedBand) {
      throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
    }

    const members = await findActiveBandMembers(updatedBand.band_id, client);

    return {
      data: {
        band: mapBand(updatedBand, req.bandRole, members),
      },
    };
  });
  return res.status(200).json(body);
}

async function deleteBand(req, res) {
  const body = await withSessionMutation(req, async (client) => {
    const result = await client.query(
      `UPDATE bands
       SET is_active = false
       WHERE band_id = $1
         AND is_active = true
       RETURNING band_id`,
      [req.band.bandId],
    );

    if (!result.rows[0]) {
      throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
    }

    return {
      data: {
        message: 'Band deleted',
      },
    };
  });
  return res.status(200).json(body);
}

async function addBandMember(req, res) {
  const body = await withSessionMutation(req, async (client) => {
    const userResult = await client.query(
      `SELECT user_id, username, first_name, last_name
       FROM users
       WHERE LOWER(username) = LOWER($1)
         AND is_active = true
       LIMIT 1`,
      [req.body.username],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    }

    try {
      await client.query(
        `INSERT INTO user_bands (user_id, band_id, role)
         VALUES ($1, $2, 'member')`,
        [user.user_id, req.band.bandId],
      );
    } catch (error) {
      if (
        error.code === '23505'
        && error.constraint === 'user_bands_user_band_unique'
      ) {
        throw new HttpError(
          409,
          'USER_ALREADY_IN_BAND',
          'User is already a member of this band',
        );
      }

      throw error;
    }

    return {
      data: {
        member: mapMember({
          ...user,
          role: 'member',
        }),
      },
    };
  });
  return res.status(201).json(body);
}

module.exports = {
  createBand,
  listBands,
  getBand,
  updateBand,
  deleteBand,
  addBandMember,
};
