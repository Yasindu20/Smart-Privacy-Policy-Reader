// init-db.js
const policyModel = require('./src/models/policyModel');

async function initDatabase() {
  try {
    console.log('Initializing database schema...');
    await policyModel.initSchema();
    console.log('Database schema initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing database schema:', error);
    process.exit(1);
  }
}

initDatabase();