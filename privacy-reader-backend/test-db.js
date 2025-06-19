// test-db.js
const { Pool } = require('pg');

console.log('Testing direct database connection...');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'privacy_reader',
    password: 'yasindu20',
    port: 5432
});

pool.query('SELECT NOW()')
    .then(result => {
        console.log('Connection successful:', result.rows[0]);
        pool.end();
    })
    .catch(err => {
        console.error('Connection failed:', err);
        pool.end();
    });