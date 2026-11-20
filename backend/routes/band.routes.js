const express = require('express');
const {
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
} = require('../controllers/band.controller');
const authenticate = require('../middleware/authenticate');
const {
  validateAddInstrument,
  validateInstrumentation,
  validateCreateBand,
  validateUpdateBand,
  validateAddBandMember,
  validateMemberEligibility,
  validateDefaultLineup,
  validateClearDefaultLineup,
  validateBandId,
} = require('../middleware/validate-band');
const {
  loadBandMembership,
  requireBandLeader,
} = require('../middleware/band-access');
const { validateRouteId } = require('../middleware/validate-mutation');
const eventRouter = require('./event.routes');

const router = express.Router();

router.use(authenticate);
router.post('/', validateCreateBand, createBand);
router.get('/', listBands);
router.use(
  '/:bandId/events',
  validateBandId,
  loadBandMembership,
  eventRouter,
);
router.use('/:bandId/polls', validateBandId, loadBandMembership, require('./poll.routes'));
router.post('/:bandId/instruments', validateBandId, validateAddInstrument, addInstrument);
router.patch('/:bandId/instrumentation', validateBandId, validateInstrumentation, updateInstrumentation);
router.get('/:bandId', validateBandId, loadBandMembership, getBand);
router.patch(
  '/:bandId',
  validateBandId,
  validateUpdateBand,
  loadBandMembership,
  requireBandLeader,
  updateBand,
);
router.delete(
  '/:bandId',
  validateBandId,
  loadBandMembership,
  requireBandLeader,
  deleteBand,
);
router.post(
  '/:bandId/members',
  validateBandId,
  validateAddBandMember,
  loadBandMembership,
  requireBandLeader,
  addBandMember,
);

router.patch('/:bandId/members/:userId', validateBandId, validateRouteId('userId'),
  validateMemberEligibility, loadBandMembership, requireBandLeader, updateMemberEligibility);
router.put('/:bandId/default-lineup', validateBandId, validateDefaultLineup,
  loadBandMembership, requireBandLeader, saveDefaultLineup);
router.delete('/:bandId/default-lineup', validateBandId, validateClearDefaultLineup,
  loadBandMembership, requireBandLeader, clearDefaultLineup);

module.exports = router;
