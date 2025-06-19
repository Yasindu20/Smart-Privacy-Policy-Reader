// src/routes/healthRoutes.js
const express = require('express');
const router = express.Router();
const { version } = require('../../package.json');
const { logger } = require('../middleware/errorHandler');
const cache = require('../utils/cacheManager');

/**
 * Basic health check endpoint
 */
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Detailed health check with system info
 */
router.get('/detailed', async (req, res) => {
  try {
    // Collect system information
    const systemInfo = {
      version,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };
    
    // Add cache stats
    systemInfo.cache = cache.getStats();
    
    // Check database connection
    let dbStatus = 'unknown';
    try {
      // Simplified database check
      const { Pool } = require('pg');
      const pool = new Pool();
      const result = await pool.query('SELECT NOW()');
      dbStatus = result.rows.length > 0 ? 'connected' : 'error';
    } catch (dbError) {
      dbStatus = 'error';
      logger.error('Database connection error in health check:', dbError);
    }
    
    // Check AI providers
    const aiProviders = {
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'not configured',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'not configured'
    };
    
    // Compile health report
    const healthReport = {
      status: 'ok',
      system: systemInfo,
      database: { status: dbStatus },
      aiProviders,
      dependencies: {
        puppeteer: 'installed',
        axios: 'installed'
      }
    };
    
    res.status(200).json(healthReport);
  } catch (error) {
    logger.error('Error in detailed health check:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * Database health check
 */
router.get('/database', async (req, res) => {
  try {
    // Check database connection
    const { Pool } = require('pg');
    const pool = new Pool();
    const start = Date.now();
    const result = await pool.query('SELECT NOW()');
    const duration = Date.now() - start;
    
    if (result.rows.length > 0) {
      res.status(200).json({
        status: 'ok',
        response_time: `${duration}ms`,
        timestamp: result.rows[0].now
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Database query returned no results'
      });
    }
  } catch (error) {
    logger.error('Database health check error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;