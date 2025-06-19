// src/utils/cacheManager.js
const NodeCache = require('node-cache');
const Redis = require('ioredis');
const { logger } = require('../middleware/errorHandler');

/**
 * Cache manager that abstracts different caching strategies
 * In development: uses in-memory cache
 * In production: uses Redis if configured, otherwise in-memory cache
 */
class CacheManager {
  constructor() {
    // Initialize memory cache
    this.memoryCache = new NodeCache({
      stdTTL: 86400, // Default TTL: 24 hour
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false // For better performance
    });
    
    // Initialize Redis if enabled
    this.redisEnabled = process.env.REDIS_URL && process.env.NODE_ENV === 'production';
    
    if (this.redisEnabled) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3
        });
        
        this.redis.on('error', (err) => {
          logger.error('Redis connection error:', err);
          this.redisEnabled = false;
          logger.warn('Falling back to memory cache due to Redis error');
        });
        
        logger.info('Redis cache initialized');
      } catch (error) {
        logger.error('Failed to initialize Redis:', error);
        this.redisEnabled = false;
        logger.warn('Falling back to memory cache');
      }
    } else {
      logger.info('Using in-memory cache');
    }
  }
  
  /**
   * Get a value from cache
   */
  async get(key) {
    try {
      // Try Redis first if enabled
      if (this.redisEnabled) {
        const value = await this.redis.get(`cache:${key}`);
        if (value) {
          try {
            return JSON.parse(value);
          } catch (e) {
            return value; // Return as-is if not JSON
          }
        }
        return null;
      }
      
      // Fall back to memory cache
      return this.memoryCache.get(key);
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null; // Continue without cache on error
    }
  }
  
  /**
   * Set a value in cache
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      // Set in Redis if enabled
      if (this.redisEnabled) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await this.redis.set(`cache:${key}`, serialized, 'EX', ttlSeconds);
        return true;
      }
      
      // Set in memory cache
      return this.memoryCache.set(key, value, ttlSeconds);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false; // Continue without cache on error
    }
  }
  
  /**
   * Delete a value from cache
   */
  async del(key) {
    try {
      // Delete from Redis if enabled
      if (this.redisEnabled) {
        await this.redis.del(`cache:${key}`);
      }
      
      // Delete from memory cache
      this.memoryCache.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }
  
  /**
   * Clear entire cache (use with caution)
   */
  async clear() {
    try {
      if (this.redisEnabled) {
        // Delete all keys matching our prefix
        const keys = await this.redis.keys('cache:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      
      this.memoryCache.flushAll();
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }
  
  /**
   * Get cache stats
   */
  getStats() {
    if (this.redisEnabled) {
      // Redis stats not easily available
      return { type: 'redis' };
    }
    
    return {
      type: 'memory',
      ...this.memoryCache.getStats()
    };
  }
}

// Export singleton instance
module.exports = new CacheManager();