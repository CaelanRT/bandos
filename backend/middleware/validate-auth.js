const { z } = require('zod');
const HttpError = require('../utils/http-error');

const newPasswordSchema = z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72,
  'Password must be at most 72 UTF-8 bytes');

const registerSchema = z.strictObject({
  username: z.string().trim().min(3).max(50),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254).toLowerCase(),
  password: newPasswordSchema,
});

const loginSchema = z.strictObject({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(72),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));

      return next(new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', details));
    }

    req.body = result.data;
    return next();
  };
}

const validateRegister = validate(registerSchema);
const validateLogin = validate(loginSchema);

const validateResend = validate(z.strictObject({ email: z.string().trim().email().max(254).toLowerCase() }));
// Missing/empty tokens intentionally reach the same generic token failure path.
const validateConfirm = validate(z.strictObject({ token: z.string().max(512).optional().default('') }));
module.exports = { validateRegister, validateLogin, validateResend, validateConfirm, newPasswordSchema };
