// Disposable TLS edge. Forwarded headers come exclusively from this connection.
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
https.createServer({ key: fs.readFileSync('/certs/key.pem'), cert: fs.readFileSync('/certs/cert.pem') }, (req, res) => {
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) {
    if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete headers[name];
  }
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-for'] = req.socket.remoteAddress;
  headers['x-forwarded-host'] = req.headers.host;
  const upstream = http.request({ hostname: 'app', port: 3000, path: req.url, method: req.method, headers }, response => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end('Upstream unavailable'); });
  req.pipe(upstream);
}).listen(3443, '0.0.0.0');
