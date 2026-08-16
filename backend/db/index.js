const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool(env.database);

function query(text, params) {
  return pool.query(text, params);
}

function close() {
  return pool.end();
}

module.exports = { pool, query, close };
