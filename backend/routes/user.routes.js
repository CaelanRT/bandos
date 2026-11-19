const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getMe, updateMe, deactivateMe } = require('../controllers/user.controller');
const { getPreferences, putPreferences, preferenceSchema } = require('../utils/notification-preferences');
const { validateBody } = require('../middleware/validate-mutation');
const { validatePasswordChange, validateProfile, validateEmailChange, validateEmailResend } = require('../middleware/validate-auth');
const { changePassword } = require('../controllers/password.controller');

const { initiateEmailChange, resendEmailChange } = require('../controllers/email-change.controller');

const router = express.Router();
router.use(authenticate);
router.get('/me', getMe);
router.post('/me/password', validatePasswordChange, changePassword);
router.get('/me/notification-preferences', getPreferences);
router.put('/me/notification-preferences', validateBody(preferenceSchema), putPreferences);
router.patch('/me', validateProfile, updateMe);
router.post('/me/email-change', validateEmailChange, initiateEmailChange);
router.post('/me/email-change/resend', validateEmailResend, resendEmailChange);
router.delete('/me', deactivateMe);

module.exports = router;
