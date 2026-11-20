const { withSessionMutation } = require('../utils/account-session');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { withMutation, checkVersion, canonicalJson, lockRows } = require('../utils/mutation');

function mapMember(row) {
  return {
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    instrumentIds: row.instrument_ids || [],
  };
}

function mapBand(row, currentUserRole, members) {
  return {
    version: row.version,
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
    version: row.version,
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
       ub.role,
       ARRAY(SELECT mi.instrument_id FROM member_instruments mi
         WHERE mi.band_id=ub.band_id AND mi.user_id=u.user_id ORDER BY mi.instrument_id) AS instrument_ids
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

function invalid(field, message) {
  throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', [{ field, message }]);
}

async function bandDetail(client, bandId, userId) {
  const band = (await client.query(`SELECT b.*, ub.role FROM bands b JOIN user_bands ub USING (band_id)
    WHERE b.band_id=$1 AND ub.user_id=$2 AND b.is_active=true`, [bandId, userId])).rows[0];
  if (!band) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
  const instruments = (await client.query(`SELECT instrument_id AS "instrumentId", name FROM instruments
    WHERE band_id=$1 ORDER BY instrument_id`, [bandId])).rows;
  const instrumentation = (await client.query(`SELECT slot_id AS "slotId", instrument_id AS "instrumentId", label, position
    FROM template_slots WHERE band_id=$1 ORDER BY position`, [bandId])).rows;
  const members = await findActiveBandMembers(bandId, client);
  const saved = (await client.query('SELECT version FROM default_lineups WHERE band_id=$1', [bandId])).rows[0];
  let defaultLineup = null;
  if (saved) {
    const assignments = (await client.query(`SELECT a.slot_id AS "slotId", a.user_id AS "userId"
      FROM default_assignments a JOIN template_slots s USING (band_id,slot_id)
      WHERE a.band_id=$1 ORDER BY s.position`, [bandId])).rows;
    const invalidReasons = defaultInvalidReasons(instrumentation, assignments, members);
    defaultLineup = { version: saved.version, assignments, isApplicable: invalidReasons.length === 0, invalidReasons };
  }
  return { ...mapBand(band, band.role, members), instruments, instrumentation, defaultLineup };
}

async function getInstruments(req, res) {
  const instruments = (await db.query('SELECT instrument_id AS "instrumentId", name FROM starter_instruments ORDER BY instrument_id')).rows;
  return res.json({ data: { instruments } });
}

async function createBand(req, res) {
  const response = await withMutation(req, {
    authorize: async () => {},
    authorizeReplay: async (client, prior) => {
      // Replay is loaded after acquiring the actor lock, so even a concurrent
      // first creation is visible. Lock its band before checking current access.
      const bandId = prior.response_body.data.band.bandId;
      const [band] = await lockRows(client, 'bands', [bandId]);
      const member = (await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2',
        [bandId, req.session.userId])).rowCount;
      if (!band?.is_active || !member) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
    },
    validate: async () => {},
    work: async client => {
      const { name, instrumentation, leaderInstrumentIds = [] } = req.body;
      const band = (await client.query('INSERT INTO bands (name,owner_user_id) VALUES ($1,$2) RETURNING *',
        [name, req.session.userId])).rows[0];
      await client.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'leader')", [req.session.userId, band.band_id]);
      const catalog = (await client.query(`INSERT INTO instruments (band_id,starter_instrument_id,name)
        SELECT $1,instrument_id,name FROM starter_instruments ORDER BY instrument_id RETURNING *`, [band.band_id])).rows;
      for (const [position, slot] of instrumentation.entries()) {
        let instrument;
        if (slot.instrumentId !== undefined) {
          instrument = catalog.find(row => row.starter_instrument_id === slot.instrumentId);
          if (!instrument) invalid(`instrumentation.${position}.instrumentId`, 'Unknown starter instrument');
        } else {
          instrument = (await client.query(`INSERT INTO instruments (band_id,name) VALUES ($1,$2)
            ON CONFLICT (band_id,lower(name)) DO UPDATE SET name=instruments.name RETURNING *`,
          [band.band_id, slot.instrumentName])).rows[0];
        }
        await client.query('INSERT INTO template_slots (band_id,instrument_id,label,position) VALUES ($1,$2,$3,$4)',
          [band.band_id, instrument.instrument_id, slot.label, position]);
      }
      // Creation-time IDs are starter IDs, just like instrumentation.instrumentId.
      for (const [index, id] of leaderInstrumentIds.entries()) {
        const instrument = catalog.find(row => row.starter_instrument_id === id);
        if (!instrument) invalid(`leaderInstrumentIds.${index}`, 'Unknown starter instrument');
        await client.query('INSERT INTO member_instruments (band_id,user_id,instrument_id) VALUES ($1,$2,$3)',
          [band.band_id, req.session.userId, instrument.instrument_id]);
      }
      return { status: 201, body: { data: { band: await bandDetail(client, band.band_id, req.session.userId) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

// Membership and authoritative ownership are read again under the band lock,
// including for replays; preflight middleware alone cannot authorize a commit.
async function configureBand(req, res, work, discoverUsers = async () => []) {
  const response = await withMutation(req, {
    discover: async client => ({ users: await discoverUsers(client), bands: [req.params.bandId] }),
    authorize: async (client, locked) => {
      const band = locked.bands[0];
      const member = (await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2',
        [req.params.bandId, req.session.userId])).rowCount;
      if (!band?.is_active || !member) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
      if (band.owner_user_id !== req.session.userId) throw new HttpError(403, 'LEADER_REQUIRED', 'Band leader access required');
    },
    validate: async (client, locked) => checkVersion(locked.bands[0].version, req.body.expectedVersion),
    work: async (client, locked) => {
      const result = await work(client, locked.bands[0], locked);
      return { status: result?.status || 200, body: { data: { ...result?.data,
        band: await bandDetail(client, req.params.bandId, req.session.userId) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function addInstrument(req, res) {
  return configureBand(req, res, async (client, band) => {
    let instrument = (await client.query(`SELECT instrument_id AS "instrumentId",name FROM instruments
      WHERE band_id=$1 AND lower(name)=lower($2)`, [band.band_id, req.body.name])).rows[0];
    if (!instrument) {
      instrument = (await client.query(`INSERT INTO instruments (band_id,name) VALUES ($1,$2)
        RETURNING instrument_id AS "instrumentId",name`, [band.band_id, req.body.name])).rows[0];
      await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [band.band_id]);
    }
    return { status: 201, data: { instrument } };
  });
}

async function updateInstrumentation(req, res) {
  return configureBand(req, res, async (client, band) => {
    const before = (await bandDetail(client, band.band_id, req.session.userId)).instrumentation;
    const catalog = (await client.query('SELECT instrument_id FROM instruments WHERE band_id=$1', [band.band_id])).rows;
    const slots = req.body.slots.map((slot, position) => {
      if (!catalog.some(row => row.instrument_id === slot.instrumentId)) invalid(`slots.${position}.instrumentId`, 'Instrument does not belong to this band');
      if (slot.slotId !== undefined && !before.some(row => row.slotId === slot.slotId)) invalid(`slots.${position}.slotId`, 'Slot does not belong to this band');
      return { ...slot, position };
    });
    if (canonicalJson(before) !== canonicalJson(slots)) {
      await client.query('DELETE FROM template_slots WHERE band_id=$1 AND NOT (slot_id=ANY($2::int[]))',
        [band.band_id, slots.flatMap(slot => slot.slotId === undefined ? [] : [slot.slotId])]);
      for (const slot of slots) {
        if (slot.slotId === undefined) {
          await client.query('INSERT INTO template_slots (band_id,instrument_id,label,position) VALUES ($1,$2,$3,$4)',
            [band.band_id, slot.instrumentId, slot.label, slot.position]);
        } else {
          await client.query('UPDATE template_slots SET instrument_id=$2,label=$3,position=$4 WHERE slot_id=$1 AND band_id=$5',
            [slot.slotId, slot.instrumentId, slot.label, slot.position, band.band_id]);
        }
      }
      await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [band.band_id]);
    }
  });
}

async function listBands(req, res) {
  const result = await db.query(
    `SELECT
       b.version,
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
  return res.json({ data: { band: await bandDetail(db, req.params.bandId, req.session.userId) } });
}

async function updateBand(req, res) {
  return configureBand(req, res, async (client, band) => {
    if (band.name !== req.body.name) {
      await client.query('UPDATE bands SET name=$2,version=version+1 WHERE band_id=$1', [band.band_id, req.body.name]);
    }
  });
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

function defaultInvalidReasons(slots, assignments, members) {
  const reasons = [];
  for (const slot of slots) {
    const assignment = assignments.find(row => row.slotId === slot.slotId);
    if (!assignment) {
      reasons.push({ code: 'MISSING_SLOT', slotId: slot.slotId });
      continue;
    }
    const member = members.find(row => row.userId === assignment.userId);
    if (!member) reasons.push({ code: 'MEMBER_UNAVAILABLE', ...assignment });
    else if (!member.instrumentIds.includes(slot.instrumentId)) {
      reasons.push({ code: 'INSTRUMENT_INELIGIBLE', ...assignment });
    }
  }
  return reasons;
}

async function validateInstrumentIds(client, bandId, ids) {
  const catalog = (await client.query('SELECT instrument_id FROM instruments WHERE band_id=$1', [bandId])).rows;
  ids.forEach((id, index) => {
    if (!catalog.some(row => row.instrument_id === id)) invalid(`instrumentIds.${index}`, 'Instrument does not belong to this band');
  });
}

async function replaceEligibility(client, bandId, userId, ids) {
  await client.query('DELETE FROM member_instruments WHERE band_id=$1 AND user_id=$2', [bandId, userId]);
  for (const id of ids) {
    await client.query('INSERT INTO member_instruments (band_id,user_id,instrument_id) VALUES ($1,$2,$3)', [bandId, userId, id]);
  }
  await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [bandId]);
}

async function addBandMember(req, res) {
  return configureBand(req, res, async (client, band, locked) => {
    const user = locked.users.find(row => row.username.toLowerCase() === req.body.username.toLowerCase());
    if (!user?.is_active || !user.email_verified_at) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    const exists = (await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2', [band.band_id, user.user_id])).rowCount;
    if (exists) throw new HttpError(409, 'MEMBER_ALREADY_EXISTS', 'User is already a member of this band');
    await validateInstrumentIds(client, band.band_id, req.body.instrumentIds);
    await client.query("INSERT INTO user_bands (user_id,band_id,role) VALUES ($1,$2,'member')", [user.user_id, band.band_id]);
    await replaceEligibility(client, band.band_id, user.user_id, req.body.instrumentIds);
    const member = (await findActiveBandMembers(band.band_id, client)).find(row => row.userId === user.user_id);
    return { status: 201, data: { member } };
  }, async client => (await client.query('SELECT user_id FROM users WHERE lower(username)=lower($1)', [req.body.username])).rows.map(row => row.user_id));
}

async function updateMemberEligibility(req, res) {
  return configureBand(req, res, async (client, band) => {
    let member = (await findActiveBandMembers(band.band_id, client)).find(row => row.userId === req.params.userId);
    if (!member) throw new HttpError(404, 'USER_NOT_FOUND', 'Band member not found');
    await validateInstrumentIds(client, band.band_id, req.body.instrumentIds);
    const ids = [...req.body.instrumentIds].sort((a,b) => a-b);
    if (canonicalJson(member.instrumentIds) !== canonicalJson(ids)) {
      await replaceEligibility(client, band.band_id, member.userId, ids);
      member = { ...member, instrumentIds: ids };
    }
    return { data: { member } };
  }, async () => [req.params.userId]);
}

async function saveDefaultLineup(req, res) {
  return configureBand(req, res, async (client, band) => {
    const detail = await bandDetail(client, band.band_id, req.session.userId);
    const { assignments } = req.body;
    const slots = new Set(), users = new Set();
    assignments.forEach((assignment, index) => {
      if (!detail.instrumentation.some(slot => slot.slotId === assignment.slotId)) invalid(`assignments.${index}.slotId`, 'Slot does not belong to this band');
      if (slots.has(assignment.slotId)) invalid(`assignments.${index}.slotId`, 'Slot already assigned');
      if (users.has(assignment.userId)) invalid(`assignments.${index}.userId`, 'Musician already occupies another slot');
      slots.add(assignment.slotId);
      users.add(assignment.userId);
    });
    if (slots.size !== detail.instrumentation.length) invalid('assignments', 'Assign every current template slot');
    const reasons = defaultInvalidReasons(detail.instrumentation, assignments, detail.members);
    if (reasons.length) throw new HttpError(409, 'DEFAULT_LINEUP_INVALID', 'Default lineup requires current eligible band members', reasons);
    const ordered = [...assignments].sort((a,b) => a.slotId-b.slotId);
    const before = detail.defaultLineup?.assignments.slice().sort((a,b) => a.slotId-b.slotId);
    if (canonicalJson(before || null) !== canonicalJson(ordered)) {
      await client.query(`INSERT INTO default_lineups (band_id) VALUES ($1)
        ON CONFLICT (band_id) DO UPDATE SET version=default_lineups.version+1`, [band.band_id]);
      await client.query('DELETE FROM default_assignments WHERE band_id=$1', [band.band_id]);
      for (const assignment of ordered) {
        await client.query('INSERT INTO default_assignments (band_id,slot_id,user_id) VALUES ($1,$2,$3)', [band.band_id, assignment.slotId, assignment.userId]);
      }
      await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [band.band_id]);
    }
  }, async () => req.body.assignments.map(row => row.userId));
}

async function clearDefaultLineup(req, res) {
  return configureBand(req, res, async (client, band) => {
    const removed = await client.query('DELETE FROM default_lineups WHERE band_id=$1', [band.band_id]);
    if (removed.rowCount) await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [band.band_id]);
  });
}

module.exports = {
  getInstruments,
  addInstrument,
  updateInstrumentation,
  createBand,
  listBands,
  getBand,
  updateBand,
  deleteBand,
  addBandMember,
  updateMemberEligibility,
  saveDefaultLineup,
  clearDefaultLineup,
};
