const express = require('express');
const {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/event.controller');
const { requireBandLeader } = require('../middleware/band-access');
const {
  validateCreateEvent,
  validateUpdateEvent,
  validateEventId,
} = require('../middleware/validate-event');
const { loadEvent } = require('../middleware/event-access');

const router = express.Router({ mergeParams: true });

router.post('/', requireBandLeader, validateCreateEvent, createEvent);
router.get('/', listEvents);

// Item routes added in later slices inherit the loaded band context and reuse
// this event lookup before their method-specific authorization and handlers.
router.use('/:eventId', validateEventId, loadEvent);
router.get('/:eventId', getEvent);
router.patch(
  '/:eventId',
  requireBandLeader,
  validateUpdateEvent,
  updateEvent,
);
router.delete('/:eventId', requireBandLeader, deleteEvent);

module.exports = router;

