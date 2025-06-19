// src/config/db.js
const { Pool } = require('pg');
require('dotenv').config();

// Use explicit parameters instead of connection string
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'privacy_reader',
  password: 'yasindu20', // Your new simple password
  port: 5432
});

// Log connection status
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on PostgreSQL client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};