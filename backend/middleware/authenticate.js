const HttpError = require('../utils/http-error');
const { loadAccount, boundCookie, sessionData } = require('../utils/account-session');

async function authenticate(req, res, next) {
  try {
    req.account = await loadAccount(req);
    boundCookie(req);
    if (req.session.access !== 'full' && !(req.method === 'GET' && req.baseUrl === '/api/v1/users' && req.path === '/me')) {
      throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification required');
    }
    const json = res.json.bind(res);
    // Classify reads only after the handler has produced a successful result.
    if (req.method === 'GET' && req.get('X-bandos-activity') === 'user') {
      res.json = function successfulRead(body) {
        if (res.statusCode >= 400) return json(body);
        loadAccount(req).then(() => {
          req.session.lastActivityAt = new Date((req.app.locals.sessionClock || Date.now)()).toISOString();
          boundCookie(req);
          if (body.data?.session) body.data.session = sessionData(req);
          json(body);
        }).catch(next);
        return res;
      };
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticate;
