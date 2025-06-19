// src/routes/policyRoutes.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const policyController = require('../controllers/policyController');
const { logger } = require('../middleware/errorHandler');

// Rate limits for specific endpoints
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 10 : 30, // 10 requests per minute in production
  message: {
    status: 429,
    message: 'Too many analysis requests, please try again later'
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  },
  // Skip rate limiting for premium users
  skip: (req) => {
    return req.user?.plan === 'premium' || req.user?.plan === 'enterprise';
  }
});

// Analysis endpoint
router.post('/analyze', analyzeLimiter, policyController.analyzePolicy);

// Get policy by ID
router.get('/:id', policyController.getPolicyById);

// Get policy history
router.get('/:id/history', policyController.getPolicyHistory);

// Get policies by domain
router.get('/domain/:domain', policyController.getPoliciesByDomain);

// Compare two policies
router.get('/compare/:policyId1/:policyId2', policyController.comparePolicies);

// Bulk analysis endpoint with higher rate limits for premium/enterprise users
router.post('/bulk-analyze', (req, res, next) => {
  // Only premium and enterprise users can use bulk analysis
  if (req.user?.plan !== 'premium' && req.user?.plan !== 'enterprise') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Bulk analysis is only available for premium and enterprise users'
    });
  }
  
  next();
}, async (req, res, next) => {
  try {
    const { urls } = req.body;
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'URLs array is required'
      });
    }
    
    // Limit the number of URLs that can be processed at once
    const maxUrls = req.user?.plan === 'enterprise' ? 50 : 10;
    
    if (urls.length > maxUrls) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Maximum of ${maxUrls} URLs allowed per request for your plan`
      });
    }
    
    logger.info(`Bulk analysis request received for ${urls.length} URLs`);
    
    // Process each URL and collect results
    const results = [];
    const errors = [];
    
    for (const url of urls) {
      try {
        // Use the same logic as in the controller
        req.body = { url };
        
        // Mock response object to capture the result
        const mockRes = {
          status: (code) => {
            mockRes.statusCode = code;
            return mockRes;
          },
          json: (data) => {
            results.push({
              url,
              ...data,
              status: mockRes.statusCode || 200
            });
          }
        };
        
        // Process the URL
        await policyController.analyzePolicy(
          { ...req, body: { url } },
          mockRes,
          (err) => {
            if (err) {
              errors.push({
                url,
                error: err.message,
                status: err.statusCode || 500
              });
            }
          }
        );
      } catch (error) {
        errors.push({
          url,
          error: error.message,
          status: 500
        });
      }
    }
    
    // Return the combined results
    res.json({
      success: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;