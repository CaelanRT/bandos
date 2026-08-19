const express = require('express');
const { validateEventId } = require('../middleware/validate-event');
const { loadEvent } = require('../middleware/event-access');

const router = express.Router({ mergeParams: true });

// Item routes added in later slices inherit the loaded band context and reuse
// this event lookup before their method-specific authorization and handlers.
router.use('/:eventId', validateEventId, loadEvent);

module.exports = router;
