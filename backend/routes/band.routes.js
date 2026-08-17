const express = require('express');
const {
  createBand,
  listBands,
  getBand,
  updateBand,
  deleteBand,
  addBandMember,
} = require('../controllers/band.controller');
const authenticate = require('../middleware/authenticate');
const {
  validateCreateBand,
  validateUpdateBand,
  validateAddBandMember,
  validateBandId,
} = require('../middleware/validate-band');
const {
  loadBandMembership,
  requireBandLeader,
} = require('../middleware/band-access');

const router = express.Router();

router.use(authenticate);
router.post('/', validateCreateBand, createBand);
router.get('/', listBands);
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

module.exports = router;
