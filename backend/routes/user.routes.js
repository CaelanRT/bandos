const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getMe, updateMe, deactivateMe } = require('../controllers/user.controller');

const router = express.Router();
router.use(authenticate);
router.get('/me', getMe);
router.patch('/me', updateMe);
router.delete('/me', deactivateMe);

module.exports = router;
