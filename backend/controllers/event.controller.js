const db = require('../db');
const { normalizeDatabaseTime } = require('../utils/event-schedule');

function serializeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function serializeTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapEvent(row) {
  return {
    eventId: row.event_id,
    bandId: row.band_id,
    name: row.name,
    type: row.type,
    date: serializeDate(row.event_date),
    startTime: normalizeDatabaseTime(row.start_time),
    endTime: normalizeDatabaseTime(row.end_time),
    timezone: row.timezone,
    location: row.location,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    isActive: row.is_active,
    createdAt: serializeTimestamp(row.created_at),
    updatedAt: serializeTimestamp(row.updated_at),
  };
}

async function createEvent(req, res) {
  const {
    name,
    type,
    date,
    startTime,
    endTime,
    timezone,
    location,
    description,
  } = req.body;

  const result = await db.query(
    `INSERT INTO events (
       band_id,
       created_by_user_id,
       name,
       type,
       event_date,
       start_time,
       end_time,
       timezone,
       location,
       description
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING
       event_id,
       band_id,
       created_by_user_id,
       name,
       type,
       event_date,
       start_time,
       end_time,
       timezone,
       location,
       description,
       is_active,
       created_at,
       updated_at`,
    [
      req.band.bandId,
      req.session.userId,
      name,
      type,
      date,
      startTime,
      endTime,
      timezone,
      location,
      description,
    ],
  );

  return res.status(201).json({
    data: {
      event: mapEvent(result.rows[0]),
    },
  });
}

async function listEvents(req, res) {
  const result = await db.query(
    `SELECT
       event_id,
       band_id,
       created_by_user_id,
       name,
       type,
       event_date,
       start_time,
       end_time,
       timezone,
       location,
       description,
       is_active,
       created_at,
       updated_at
     FROM events
     WHERE band_id = $1
       AND is_active = true
     ORDER BY
       CASE
         WHEN (event_date + start_time) AT TIME ZONE timezone > CURRENT_TIMESTAMP
           THEN 0
         ELSE 1
       END ASC,
       CASE
         WHEN (event_date + start_time) AT TIME ZONE timezone > CURRENT_TIMESTAMP
           THEN (event_date + start_time) AT TIME ZONE timezone
       END ASC,
       CASE
         WHEN (event_date + start_time) AT TIME ZONE timezone <= CURRENT_TIMESTAMP
           THEN (event_date + start_time) AT TIME ZONE timezone
       END DESC,
       event_id ASC`,
    [req.band.bandId],
  );

  return res.status(200).json({
    data: {
      events: result.rows.map(mapEvent),
    },
  });
}

function getEvent(req, res) {
  return res.status(200).json({
    data: {
      event: mapEvent(req.event),
    },
  });
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  mapEvent,
};

