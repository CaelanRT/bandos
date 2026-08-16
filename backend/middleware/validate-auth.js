const { z } = require('zod');
const HttpError = require('../utils/http-error');

const registerSchema = z.strictObject({
  username: z.string().trim().min(3).max(50),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(8).max(72),
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

module.exports = { validateRegister, validateLogin };
