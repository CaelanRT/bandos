const { Pool } = require('pg');

const pool = new Pool(require('../config').getConfig().database);

function query(text, params) {
  return pool.query(text, params);
}

function close() {
  return pool.end();
}

module.exports = { pool, query, close };
