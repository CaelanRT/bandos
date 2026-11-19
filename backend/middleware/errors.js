const HttpError = require('../utils/http-error');

function notFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
}

async function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }

  if (error.code === 'AUTHENTICATION_REQUIRED') {
    if (req.session?.userId) await new Promise(resolve => req.session.destroy(() => resolve()));
    res.clearCookie('bandos.sid');
  }

  if (error.code === '23505') {
    return res.status(409).json({
      error: { code: 'ACCOUNT_CONFLICT', message: 'Username or email is already in use' },
    });
  }

  const status = error.status || 500;
  const body = {
    code: error.code || 'INTERNAL_ERROR',
    message: status === 500 ? 'An unexpected error occurred' : error.message,
  };

  if (error.reason) body.reason = error.reason;
  if (error.details) body.details = error.details;
  if (status === 500) console.error(error);

  return res.status(status).json({ error: body });
}

module.exports = { notFound, errorHandler };
