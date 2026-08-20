const db = require('../db');
const HttpError = require('../utils/http-error');
const {
  EventScheduleError,
  normalizeDatabaseTime,
  validateEventSchedule,
} = require('../utils/event-schedule');

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

function editableEventFields(row) {
  return {
    name: row.name,
    type: row.type,
    date: serializeDate(row.event_date),
    startTime: normalizeDatabaseTime(row.start_time),
    endTime: normalizeDatabaseTime(row.end_time),
    timezone: row.timezone,
    location: row.location,
    description: row.description,
  };
}

function validateMergedEventSchedule(event) {
  try {
    validateEventSchedule(event);
  } catch (error) {
    if (!(error instanceof EventScheduleError)) throw error;

    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid request body',
      [{ field: error.field, message: error.message }],
    );
  }
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

async function updateEvent(req, res) {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const lockedResult = await client.query(
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
       WHERE event_id = $1
         AND band_id = $2
         AND is_active = true
       FOR UPDATE`,
      [req.event.event_id, req.band.bandId],
    );
    const lockedEvent = lockedResult.rows[0];

    if (!lockedEvent) {
      throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
    }

    const lifecycleResult = await client.query(
      `SELECT
         (($1::date + $2::time) AT TIME ZONE $3) <= clock_timestamp()
           AS has_started`,
      [
        serializeDate(lockedEvent.event_date),
        normalizeDatabaseTime(lockedEvent.start_time),
        lockedEvent.timezone,
      ],
    );

    if (lifecycleResult.rows[0].has_started) {
      throw new HttpError(
        409,
        'EVENT_ALREADY_STARTED',
        'Events cannot be edited after they have started',
      );
    }

    const mergedEvent = {
      ...editableEventFields(lockedEvent),
      ...req.body,
    };
    validateMergedEventSchedule(mergedEvent);

    const updatedResult = await client.query(
      `UPDATE events
       SET
         name = $1,
         type = $2,
         event_date = $3,
         start_time = $4,
         end_time = $5,
         timezone = $6,
         location = $7,
         description = $8,
         updated_at = NOW()
       WHERE event_id = $9
         AND band_id = $10
         AND is_active = true
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
        mergedEvent.name,
        mergedEvent.type,
        mergedEvent.date,
        mergedEvent.startTime,
        mergedEvent.endTime,
        mergedEvent.timezone,
        mergedEvent.location,
        mergedEvent.description,
        lockedEvent.event_id,
        req.band.bandId,
      ],
    );
    const updatedEvent = updatedResult.rows[0];

    if (!updatedEvent) {
      throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
    }

    await client.query('COMMIT');

    return res.status(200).json({
      data: {
        event: mapEvent(updatedEvent),
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  mapEvent,
};


