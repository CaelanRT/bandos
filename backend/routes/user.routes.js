const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { updateUserSchema, deactivateUserSchema } = require('../validation/user.schemas');
const { getMe, updateMe, deactivateMe } = require('../controllers/user.controller');

const router = express.Router();
router.use(authenticate);
router.get('/me', getMe);
router.patch('/me', validate(updateUserSchema), updateMe);
router.delete('/me', validate(deactivateUserSchema), deactivateMe);

module.exports = router;
