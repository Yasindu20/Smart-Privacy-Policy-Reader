// src/models/userModel.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { logger } = require('../middleware/errorHandler');

// Create a PostgreSQL connection pool
const pool = new Pool();

/**
 * User model for authentication and user management
 */
const userModel = {
  /**
   * Create a new user
   */
  async createUser(userData) {
    try {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      const query = `
        INSERT INTO users (
          email, password, name, company, api_key, plan, role, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        ) RETURNING id, email, name, company, api_key, plan, role, created_at
      `;
      
      const result = await pool.query(query, [
        userData.email.toLowerCase(),
        hashedPassword,
        userData.name,
        userData.company,
        userData.apiKey,
        userData.plan || 'free',
        userData.role || 'user'
      ]);
      
      // Transform database column names to camelCase
      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        apiKey: user.api_key,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at
      };
    } catch (error) {
      logger.error(`Error creating user ${userData.email}:`, error);
      throw error;
    }
  },
  
  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    try {
      const query = `
        SELECT * FROM users
        WHERE email = $1
      `;
      
      const result = await pool.query(query, [email.toLowerCase()]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Transform database column names to camelCase
      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        password: user.password, // Needed for verification
        name: user.name,
        company: user.company,
        apiKey: user.api_key,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at,
        usage: user.usage_data
      };
    } catch (error) {
      logger.error(`Error getting user by email ${email}:`, error);
      throw error;
    }
  },
  
  /**
   * Get user by ID
   */
  async getUserById(id) {
    try {
      const query = `
        SELECT * FROM users
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Transform database column names to camelCase
      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        password: user.password, // Needed for verification
        name: user.name,
        company: user.company,
        apiKey: user.api_key,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at,
        usage: user.usage_data
      };
    } catch (error) {
      logger.error(`Error getting user by ID ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Get user by API key
   */
  async getUserByApiKey(apiKey) {
    try {
      const query = `
        SELECT * FROM users
        WHERE api_key = $1
      `;
      
      const result = await pool.query(query, [apiKey]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Transform database column names to camelCase
      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        password: user.password,
        name: user.name,
        company: user.company,
        apiKey: user.api_key,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at,
        usage: user.usage_data
      };
    } catch (error) {
      logger.error(`Error getting user by API key:`, error);
      throw error;
    }
  },
  
  /**
   * Update user profile
   */
  async updateUserProfile(userId, profileData) {
    try {
      const query = `
        UPDATE users
        SET name = $1, company = $2
        WHERE id = $3
        RETURNING id, email, name, company, api_key, plan, role, created_at
      `;
      
      const result = await pool.query(query, [
        profileData.name,
        profileData.company,
        userId
      ]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Transform database column names to camelCase
      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        apiKey: user.api_key,
        plan: user.plan,
        role: user.role,
        created_at: user.created_at
      };
    } catch (error) {
      logger.error(`Error updating user profile for ID ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Update user password
   */
  async updateUserPassword(userId, newPassword) {
    try {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      const query = `
        UPDATE users
        SET password = $1
        WHERE id = $2
        RETURNING id
      `;
      
      const result = await pool.query(query, [
        hashedPassword,
        userId
      ]);
      
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error updating password for user ID ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Update user API key
   */
  async updateUserApiKey(userId, apiKey) {
    try {
      const query = `
        UPDATE users
        SET api_key = $1
        WHERE id = $2
        RETURNING id
      `;
      
      const result = await pool.query(query, [
        apiKey,
        userId
      ]);
      
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error updating API key for user ID ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Update user plan
   */
  async updateUserPlan(userId, plan) {
    try {
      const query = `
        UPDATE users
        SET plan = $1
        WHERE id = $2
        RETURNING id, email, plan
      `;
      
      const result = await pool.query(query, [
        plan,
        userId
      ]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating plan for user ID ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Log user activity
   */
  async logActivity(userId, activity, data = {}) {
    try {
      const query = `
        INSERT INTO user_activity (
          user_id, activity, data, created_at
        ) VALUES (
          $1, $2, $3, NOW()
        )
      `;
      
      await pool.query(query, [
        userId,
        activity,
        JSON.stringify(data)
      ]);
      
      return true;
    } catch (error) {
      logger.error(`Error logging activity for user ID ${userId}:`, error);
      // Don't throw - non-critical
      return false;
    }
  },
  
  /**
   * Get user activity
   */
  async getUserActivity(userId, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT id, activity, data, created_at
        FROM user_activity
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await pool.query(query, [
        userId,
        limit,
        offset
      ]);
      
      return result.rows;
    } catch (error) {
      logger.error(`Error getting activity for user ID ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Track API usage
   */
  async trackApiUsage(userId, endpoint, success) {
    try {
      // First, update the usage_data JSON
      const updateQuery = `
        UPDATE users
        SET usage_data = COALESCE(usage_data, '{}'::jsonb) || jsonb_build_object(
          'last_activity', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'api_calls', COALESCE(usage_data->>'api_calls', '0')::int + 1,
          endpoint, COALESCE(usage_data->>$1, '0')::int + 1,
          'successful_calls', COALESCE(usage_data->>'successful_calls', '0')::int + $2::int,
          'failed_calls', COALESCE(usage_data->>'failed_calls', '0')::int + (1 - $2::int)
        )
        WHERE id = $3
      `;
      
      await pool.query(updateQuery, [
        endpoint,
        success ? 1 : 0,
        userId
      ]);
      
      // Then log the activity
      await this.logActivity(userId, 'api_usage', {
        endpoint,
        success
      });
      
      return true;
    } catch (error) {
      logger.error(`Error tracking API usage for user ID ${userId}:`, error);
      // Don't throw - non-critical
      return false;
    }
  },
  
  /**
   * Initialize user database schema
   */
  async initSchema() {
    try {
      logger.info('Initializing user database schema...');
      
      // Create users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT,
          company TEXT,
          api_key TEXT UNIQUE NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free',
          role TEXT NOT NULL DEFAULT 'user',
          usage_data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE
        )
      `);
      
      // Create index on email for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)
      `);
      
      // Create index on API key for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_api_key ON users (api_key)
      `);
      
      // Create user activity table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_activity (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          activity TEXT NOT NULL,
          data JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
      
      // Create index on user ID for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity (user_id)
      `);
      
      // Create index on activity for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_activity_activity ON user_activity (activity)
      `);
      
      logger.info('User database schema initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing user database schema:', error);
      throw error;
    }
  }
};

module.exports = userModel;