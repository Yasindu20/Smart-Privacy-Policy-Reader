const express = require('express'); 
const cors = require('cors'); 
const helmet = require('helmet'); 
const { rateLimit } = require('rate-limiter-flexible'); 
require('dotenv').config(); 
 
const policyRoutes = require('./routes/policyRoutes'); 
 
const app = express(); 
const PORT = process.env.PORT || 3000; 
 
// Middleware 
app.use(helmet()); 
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200' 
})); 
app.use(express.json({ limit: '2mb' })); 
app.use(express.urlencoded({ extended: true, limit: '2mb' })); 
 
// Rate limiting 
const limiter = rateLimit({ 
  points: 10, // 10 requests 
  duration: 60, // per minute 
}); 
app.use(limiter); 
 
// Routes 
app.use('/api/policies', policyRoutes); 
 
// Health check 
app.get('/health', (req, res) => { 
  res.status(200).json({ status: 'ok' }); 
}); 
 
// Error handling 
app.use((err, req, res, next) => { 
  console.error(err.stack); 
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong' 
  }); 
}); 
 
// Start server 
app.listen(PORT, () => { 
  console.log(`Server running on port ${PORT}`); 
});
