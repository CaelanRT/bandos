const express = require('express');
const {
  createBand,
  listBands,
  getBand,
  updateBand,
} = require('../controllers/band.controller');
const authenticate = require('../middleware/authenticate');
const {
  validateCreateBand,
  validateUpdateBand,
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

module.exports = router;
