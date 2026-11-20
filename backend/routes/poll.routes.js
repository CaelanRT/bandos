const express = require('express');
const { createPoll, updatePoll, listPolls, getPoll } = require('../controllers/poll.controller');
const { requireBandLeader } = require('../middleware/band-access');
const { validateRouteId } = require('../middleware/validate-mutation');
const { validateCreatePoll, validateUpdatePoll } = require('../middleware/validate-poll');

const router = express.Router({ mergeParams: true });
router.post('/', requireBandLeader, validateCreatePoll, createPoll);
router.get('/', listPolls);
router.get('/:pollId', validateRouteId('pollId'), getPoll);
router.patch('/:pollId', validateRouteId('pollId'), validateUpdatePoll, updatePoll);
module.exports = router;
