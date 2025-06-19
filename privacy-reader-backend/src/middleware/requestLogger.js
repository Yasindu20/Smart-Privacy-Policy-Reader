// src/middleware/requestLogger.js
const { createLogger, format, transports } = require('winston');
const path = require('path');

// Configure Winston logger for requests
const requestLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'privacy-reader-api' },
  transports: [
    // Write to request.log
    new transports.File({ 
      filename: path.join(__dirname, '../../logs/request.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Also log to console in development
    ...(process.env.NODE_ENV !== 'production' 
      ? [new transports.Console({ 
          format: format.combine(
            format.colorize(),
            format.simple()
          ),
          level: 'debug'
        })]
      : [])
  ],
});

// Request logger middleware
module.exports = (req, res, next) => {
  // Record start time
  const start = Date.now();
  
  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Skip logging health checks in production to reduce noise
    if (process.env.NODE_ENV === 'production' && req.path === '/health') {
      return;
    }
    
    // Skip logging static assets in production
    if (process.env.NODE_ENV === 'production' && req.path.startsWith('/static/')) {
      return;
    }
    
    // Determine log level based on status code
    let level = 'info';
    if (res.statusCode >= 500) {
      level = 'error';
    } else if (res.statusCode >= 400) {
      level = 'warn';
    }
    
    // Log the request details
    requestLogger.log(level, {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      statusCode: res.statusCode,
      responseTime: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      userId: req.user?.id || 'unauthenticated'
    });
  });
  
  next();
};