const HttpError = require('../utils/http-error');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }

    req.validatedBody = result.data;
    return next();
  };
}

module.exports = validate;
