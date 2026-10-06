const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Ticket 04 must copy the generated bundle here; never serve the repository root.
const buildPath = path.resolve(__dirname, '../frontend/dist');

function mountFrontend(app, { required = false, directory = buildPath } = {}) {
  const indexPath = path.join(directory, 'index.html');
  if (!fs.existsSync(indexPath)) {
    if (required) throw new Error(`Frontend build missing at ${indexPath}; build the frontend before production startup`);
    console.log('Frontend build absent; running API only');
    return;
  }

  app.use(express.static(directory, {
    index: false,
    redirect: false,
    dotfiles: 'deny',
    setHeaders(res, filePath) {
      // Vite fingerprints its generated scripts, styles and local fonts.
      const fingerprinted = path.dirname(filePath) === path.join(directory, 'assets')
        && /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(path.basename(filePath));
      res.setHeader('Cache-Control', fingerprinted
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));

  // A middleware matcher avoids Express 5 wildcard syntax and handles GET/HEAD.
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch (error) {
      error.status = 400;
      return next(error);
    }
    if (pathname === '/assets' || pathname.startsWith('/assets/')
      || pathname.split('/').some((segment) => segment.includes('.'))
      || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indexPath);
  });
}

module.exports = { mountFrontend };
