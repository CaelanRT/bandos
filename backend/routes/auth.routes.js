const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { register, login, logout } = require('../controllers/auth.controller');
const { validateRegister, validateLogin } = require('../middleware/validate-auth');

const router = express.Router();
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many registration attempts; try again later' },
    });
  },
});
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

router.post('/register', registerLimiter, validateRegister, register);
router.post('/login', loginLimiter, validateLogin, login);
router.post('/logout', logout);

module.exports = router;
