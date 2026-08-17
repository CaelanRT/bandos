const express = require('express');
const { createBand, listBands } = require('../controllers/band.controller');
const authenticate = require('../middleware/authenticate');
const { validateCreateBand } = require('../middleware/validate-band');

const router = express.Router();

router.use(authenticate);
router.post('/', validateCreateBand, createBand);
router.get('/', listBands);

module.exports = router;
