const express = require('express');
const { createPoll, updatePoll, listPolls, getPoll, saveAvailability } = require('../controllers/poll.controller');
const { requireBandLeader } = require('../middleware/band-access');
const { validateRouteId } = require('../middleware/validate-mutation');
const { validateCreatePoll, validateUpdatePoll, validateAvailability } = require('../middleware/validate-poll');

const router = express.Router({ mergeParams: true });
router.post('/', requireBandLeader, validateCreatePoll, createPoll);
router.get('/', listPolls);
router.get('/:pollId', validateRouteId('pollId'), getPoll);
router.patch('/:pollId', validateRouteId('pollId'), validateUpdatePoll, updatePoll);
router.put('/:pollId/availability', validateRouteId('pollId'), validateAvailability, saveAvailability);
module.exports = router;
