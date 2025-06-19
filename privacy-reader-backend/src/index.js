const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit'); // Fixed import
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import routes
const policyRoutes = require('./routes/policyRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes'); // For enterprise authentication

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const authMiddleware = require('./middleware/authMiddleware');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Setup logging
// Create a write stream for access logs
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, '../logs/access.log'), 
  { flags: 'a' }
);

// Environment-based logging
if (process.env.NODE_ENV === 'production') {
  // Use combined format for production with log rotation
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // Use dev format for development
  app.use(morgan('dev'));
}

// Security middleware
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

// CORS configuration for enterprise needs
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      // Frontend origins
      process.env.FRONTEND_URL || 'http://localhost:4200',
      // Allow Chrome extension
      /^chrome-extension:\/\//
    ];
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    
    // In production, check against allowed origins
    if (!origin) {
      callback(null, true); // Allow requests with no origin (like mobile apps)
      return;
    }
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // Cache preflight requests for 24 hours
};
app.use(cors(corsOptions));

// Compression for faster response times
app.use(compression());

// Request body parsing
app.use(express.json({ limit: '10mb' })); // Increased for larger policy texts
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom request logging middleware
app.use(requestLogger);

// Rate limiting - configurable based on environment
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 60 : 200, // Different limits for prod/dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Too many requests, please try again later',
    retryAfter: '60 seconds'
  },
  // Skip rate limiting for trusted sources (like internal services)
  skip: (req) => {
    // Example: Skip for requests with valid internal API key
    return req.headers['x-internal-api-key'] === process.env.INTERNAL_API_KEY;
  }
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Public routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
// For enterprise level, we'll use JWT auth for protected endpoints
app.use('/api/policies', process.env.NODE_ENV === 'production' ? authMiddleware.verifyToken : (req, res, next) => next());
app.use('/api/policies', policyRoutes);

// Proxy routes - apply stricter rate limits for proxy service
const proxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 50,
  message: {
    status: 429,
    message: 'Too many proxy requests, please try again later'
  }
});
app.use('/api/proxy', proxyLimiter);
app.use('/api/proxy', proxyRoutes);

// Serve static files (documentation, etc.)
app.use('/docs', express.static(path.join(__dirname, '../docs')));

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server with graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}/docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // Close database connections here if needed
  });
});

module.exports = server; // Export for testing