const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('rate-limiter-flexible');
require('dotenv').config();

const policyRoutes = require('./routes/policyRoutes');
const proxyRoutes = require('./routes/proxyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Relaxing Helmet for specific content security policy
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "*"], // Allow connections to any origin
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
});

app.use(helmetConfig);

// Configure CORS to allow requests from the Chrome extension and frontend
app.use(cors({
  origin: ['http://localhost:4200', 'chrome-extension://*'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '5mb' })); // Increased limit for larger policy texts
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting - more lenient for development
const limiter = rateLimit({
  points: 20, // 20 requests 
  duration: 60, // per minute
});
app.use(limiter);

// Routes
app.use('/api/policies', policyRoutes);
app.use('/api/proxy', proxyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling with more detailed responses
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  
  // Send a more descriptive error response
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' 
      ? `${err.message} - ${err.stack.split('\n')[1]}` 
      : 'Something went wrong',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});