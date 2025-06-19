const { Pool } = require('pg');
require('dotenv').config();

// Handle special characters in the password
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'privacy_reader',
  password: 'Yasindu20$', // Replace with your actual password
  port: 5432,
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
