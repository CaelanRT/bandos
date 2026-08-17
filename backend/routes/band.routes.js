const express = require('express');
const {
  createBand,
  listBands,
  getBand,
} = require('../controllers/band.controller');
const authenticate = require('../middleware/authenticate');
const {
  validateCreateBand,
  validateBandId,
} = require('../middleware/validate-band');
const { loadBandMembership } = require('../middleware/band-access');

const router = express.Router();

router.use(authenticate);
router.post('/', validateCreateBand, createBand);
router.get('/', listBands);
router.get('/:bandId', validateBandId, loadBandMembership, getBand);

module.exports = router;
