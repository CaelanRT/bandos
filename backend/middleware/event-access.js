const db = require('../db');
const HttpError = require('../utils/http-error');

async function loadEvent(req, res, next) {
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
     WHERE event_id = $1
       AND band_id = $2
       AND is_active = true
     LIMIT 1`,
    [req.params.eventId, req.band.bandId],
  );

  const event = result.rows[0];

  if (!event) {
    return next(new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found'));
  }

  req.event = event;
  return next();
}

module.exports = { loadEvent };
