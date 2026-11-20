const db = require('../db');
const HttpError = require('../utils/http-error');

async function loadEvent(req, res, next) {
  const result = await db.query(
    `SELECT *
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
