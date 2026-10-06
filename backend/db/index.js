const { Pool } = require('pg');

const pool = new Pool(require('../config').getConfig().database);

// pg removes failed idle clients itself; later requests can open fresh connections.
pool.on('error', () => {
  console.error('Database idle connection failed');
});

function query(text, params) {
  return pool.query(text, params);
}

function close() {
  return pool.end();
}

module.exports = { pool, query, close };
