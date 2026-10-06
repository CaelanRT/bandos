const https = require('node:https');
const http = require('node:http');
module.exports = function request(path, { method = 'GET', body, cookie, headers = {}, direct = false } = {}) {
  const origin = direct ? 'http://app:3000' : 'https://edge:3443';
  return new Promise((resolve, reject) => {
    const req = (direct ? http : https).request(origin + path, {
      method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    }, res => {
      let text = '';
      res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text,
        json: () => JSON.parse(text) }));
    });
    req.setTimeout(6000, () => req.destroy(new Error('verification request timed out')));
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
};
