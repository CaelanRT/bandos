const HttpError = require('../utils/http-error');

function authenticate(req, res, next) {
  if (!req.session?.userId) {
    return next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required'));
  }

  return next();
}

module.exports = authenticate;
