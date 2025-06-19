const jwt = require('jsonwebtoken');
const { AuthenticationError, ForbiddenError } = require('./errorHandler');

/**
 * Middleware to verify JWT token
 */
const verifyToken = (req, res, next) => {
  try {
    // Get token from headers, query, or cookies
    const token = req.headers.authorization?.split(' ')[1] || 
                 req.query.token || 
                 req.cookies?.token;
    
    if (!token) {
      throw new AuthenticationError('Authentication required');
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request
    req.user = decoded;
    
    // Check if token is about to expire (less than 1 hour remaining)
    const expiryTime = decoded.exp * 1000; // Convert to milliseconds
    const oneHour = 60 * 60 * 1000;
    
    if (expiryTime - Date.now() < oneHour) {
      // Set header to indicate token will expire soon
      res.set('X-Token-Expires-Soon', 'true');
    }
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new AuthenticationError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Middleware to check API key
 */
const verifyApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }
    
    // In a real application, you would validate the API key against a database
    // For now, we'll check against an environment variable
    if (apiKey !== process.env.API_KEY) {
      throw new AuthenticationError('Invalid API key');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check user roles
 */
const checkRole = (roles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }
      
      const userRole = req.user.role;
      
      if (!roles.includes(userRole)) {
        throw new ForbiddenError('Insufficient permissions');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to handle multiple authentication methods
 */
const multiAuth = (req, res, next) => {
  // Try JWT first
  if (req.headers.authorization) {
    return verifyToken(req, res, next);
  }
  
  // Then try API key
  if (req.headers['x-api-key']) {
    return verifyApiKey(req, res, next);
  }
  
  // No authentication provided
  next(new AuthenticationError('Authentication required'));
};

module.exports = {
  verifyToken,
  verifyApiKey,
  checkRole,
  multiAuth
};