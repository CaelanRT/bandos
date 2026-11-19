const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { getInstruments } = require('../controllers/band.controller');

router.get('/', authenticate, getInstruments);
module.exports = router;
