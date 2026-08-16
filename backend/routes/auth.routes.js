const express = require('express');
const { rateLimit } = require('express-rate-limit');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validation/auth.schemas');
const { register, login, logout } = require('../controllers/auth.controller');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts; try again later' },
    });
  },
});

router.post('/register', validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);

module.exports = router;
