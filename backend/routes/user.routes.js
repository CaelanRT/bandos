const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getMe, updateMe, deactivateMe } = require('../controllers/user.controller');
const { getPreferences, putPreferences, preferenceSchema } = require('../utils/notification-preferences');
const { validateBody } = require('../middleware/validate-mutation');

const router = express.Router();
router.use(authenticate);
router.get('/me', getMe);
router.get('/me/notification-preferences', getPreferences);
router.put('/me/notification-preferences', validateBody(preferenceSchema), putPreferences);
router.patch('/me', updateMe);
router.delete('/me', deactivateMe);

module.exports = router;
