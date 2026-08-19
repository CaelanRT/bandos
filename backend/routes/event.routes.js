const express = require('express');
const { createEvent } = require('../controllers/event.controller');
const { requireBandLeader } = require('../middleware/band-access');
const {
  validateCreateEvent,
  validateEventId,
} = require('../middleware/validate-event');
const { loadEvent } = require('../middleware/event-access');

const router = express.Router({ mergeParams: true });

router.post('/', requireBandLeader, validateCreateEvent, createEvent);

// Item routes added in later slices inherit the loaded band context and reuse
// this event lookup before their method-specific authorization and handlers.
router.use('/:eventId', validateEventId, loadEvent);

module.exports = router;
