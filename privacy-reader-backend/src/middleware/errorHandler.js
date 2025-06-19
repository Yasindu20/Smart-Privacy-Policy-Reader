const { createLogger, format, transports } = require('winston');
const path = require('path');

// Configure Winston logger
const logger = createLogger({
  level: 'error',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'privacy-reader-api' },
  transports: [
    // Write all errors to error.log
    new transports.File({ 
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Also log to console in development
    ...(process.env.NODE_ENV !== 'production' 
      ? [new transports.Console({ 
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        })]
      : [])
  ],
});

// Custom error types
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

// Main error handler middleware
const errorHandler = (err, req, res, next) => {
  // Set default status code if not defined
  const statusCode = err.statusCode || 500;
  
  // Generate a unique error ID for tracing
  const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  
  // Log the error with request details
  logger.error({
    errorId,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id || 'unauthenticated',
    statusCode
  });
  
  // Prepare response based on environment
  const errorResponse = {
    error: {
      message: statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      errorId,
      type: err.name || 'Error',
      ...(process.env.NODE_ENV !== 'production' && {
        stack: err.stack,
        details: err.details
      })
    }
  };
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

module.exports = {
  errorHandler,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  logger
};