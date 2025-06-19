// src/models/policyModel.js
const { Pool } = require('pg');
const { logger } = require('../middleware/errorHandler');

// Create a PostgreSQL connection pool
const pool = new Pool();

/**
 * Policy database model
 */
const policyModel = {
  /**
   * Get a policy by ID
   */
  async getPolicyById(id) {
    try {
      const query = `
        SELECT * FROM policies
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting policy by ID ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Get a policy by URL
   */
  async getPolicyByUrl(url) {
    try {
      const query = `
        SELECT * FROM policies
        WHERE url = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const result = await pool.query(query, [url]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting policy by URL ${url}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all versions of a policy by ID
   */
  async getPolicyHistory(id) {
    try {
      // First get the URL for this policy
      const policyQuery = `
        SELECT url FROM policies
        WHERE id = $1
      `;
      
      const policyResult = await pool.query(policyQuery, [id]);
      
      if (policyResult.rows.length === 0) {
        return [];
      }
      
      const url = policyResult.rows[0].url;
      
      // Then get all versions for this URL
      const historyQuery = `
        SELECT id, url, title, score, created_at, last_checked,
               summary, data_collection, data_sharing
        FROM policies
        WHERE url = $1
        ORDER BY created_at DESC
      `;
      
      const historyResult = await pool.query(historyQuery, [url]);
      
      return historyResult.rows;
    } catch (error) {
      logger.error(`Error getting policy history for ID ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Get policies by domain
   */
  async getPoliciesByDomain(domain) {
    try {
      // Use LIKE query to find policies from this domain
      const query = `
        SELECT id, url, title, domain, score, created_at, last_checked
        FROM policies
        WHERE domain LIKE $1
        ORDER BY last_checked DESC
      `;
      
      const result = await pool.query(query, [`%${domain}%`]);
      
      return result.rows;
    } catch (error) {
      logger.error(`Error getting policies by domain ${domain}:`, error);
      throw error;
    }
  },
  
  /**
   * Save a policy to the database
   */
  async savePolicy(policyData, analysisResult) {
    try {
      // Check if this policy already exists
      const existingPolicy = await this.getPolicyByUrl(policyData.url);
      
      // Prepare the analysis data
      const summary = analysisResult.summary || [];
      const dataCollection = analysisResult.dataCollection || {};
      const dataSharing = analysisResult.dataSharing || {};
      const retention = analysisResult.retention || '';
      const userRights = analysisResult.userRights || [];
      const score = analysisResult.score?.value || 0;
      const scoreExplanation = analysisResult.score?.explanation || '';
      const redFlags = analysisResult.redFlags || [];
      const compliance = analysisResult.compliance || {};
      
      // Convert objects to JSON strings
      const summaryJson = JSON.stringify(summary);
      const dataCollectionJson = JSON.stringify(dataCollection);
      const dataSharingJson = JSON.stringify(dataSharing);
      const userRightsJson = JSON.stringify(userRights);
      const redFlagsJson = JSON.stringify(redFlags);
      const complianceJson = JSON.stringify(compliance);
      
      let policyId;
      let isNew = false;
      
      if (!existingPolicy) {
        // Insert new policy
        const insertQuery = `
          INSERT INTO policies (
            url, domain, title, text, summary, data_collection, data_sharing,
            retention, user_rights, score, score_explanation, red_flags,
            compliance, created_at, last_checked
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
          ) RETURNING id
        `;
        
        const insertResult = await pool.query(insertQuery, [
          policyData.url,
          policyData.domain,
          policyData.title,
          policyData.text,
          summaryJson,
          dataCollectionJson,
          dataSharingJson,
          retention,
          userRightsJson,
          score,
          scoreExplanation,
          redFlagsJson,
          complianceJson
        ]);
        
        policyId = insertResult.rows[0].id;
        isNew = true;
        
        // Log analytics event for new policy
        await this.logAnalyticsEvent('policy_created', {
          policyId,
          url: policyData.url,
          domain: policyData.domain,
          score
        });
      } else {
        // Check if the content has changed
        const contentChanged = existingPolicy.text !== policyData.text;
        
        if (contentChanged) {
          // Insert a new version if content changed
          const insertVersionQuery = `
            INSERT INTO policies (
              url, domain, title, text, summary, data_collection, data_sharing,
              retention, user_rights, score, score_explanation, red_flags,
              compliance, created_at, last_checked
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
            ) RETURNING id
          `;
          
          const insertResult = await pool.query(insertVersionQuery, [
            policyData.url,
            policyData.domain,
            policyData.title,
            policyData.text,
            summaryJson,
            dataCollectionJson,
            dataSharingJson,
            retention,
            userRightsJson,
            score,
            scoreExplanation,
            redFlagsJson,
            complianceJson
          ]);
          
          policyId = insertResult.rows[0].id;
          isNew = true;
          
          // Log analytics event for updated policy
          await this.logAnalyticsEvent('policy_updated', {
            policyId,
            url: policyData.url,
            domain: policyData.domain,
            score,
            previousScore: existingPolicy.score,
            previousId: existingPolicy.id
          });
        } else {
          // Just update the last_checked timestamp
          const updateQuery = `
            UPDATE policies
            SET last_checked = NOW()
            WHERE id = $1
            RETURNING id
          `;
          
          const updateResult = await pool.query(updateQuery, [existingPolicy.id]);
          
          policyId = updateResult.rows[0].id;
          isNew = false;
        }
      }
      
      return { policyId, isNew };
    } catch (error) {
      logger.error(`Error saving policy for ${policyData.url}:`, error);
      throw error;
    }
  },
  
  /**
   * Track policy analysis request
   */
  async trackAnalysisRequest(data) {
    try {
      const query = `
        INSERT INTO policy_requests (
          url, policy_id, user_id, user_agent, ip_address, cached, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW()
        )
      `;
      
      await pool.query(query, [
        data.url,
        data.policyId || null,
        data.userId || null,
        data.userAgent || null,
        data.ipAddress || null,
        data.cached || false
      ]);
      
      return true;
    } catch (error) {
      logger.error('Error tracking policy request:', error);
      // Don't throw - this is non-critical
      return false;
    }
  },
  
  /**
   * Log analytics event
   */
  async logAnalyticsEvent(event, data) {
    try {
      const query = `
        INSERT INTO analytics_events (
          event_type, data, created_at
        ) VALUES (
          $1, $2, NOW()
        )
      `;
      
      await pool.query(query, [
        event,
        JSON.stringify(data)
      ]);
      
      return true;
    } catch (error) {
      logger.error(`Error logging analytics event ${event}:`, error);
      // Don't throw - this is non-critical
      return false;
    }
  },
  
  /**
   * Initialize database schema
   */
  async initSchema() {
    try {
      logger.info('Initializing database schema...');
      
      // Create policies table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS policies (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          domain TEXT NOT NULL,
          title TEXT,
          text TEXT NOT NULL,
          summary JSONB,
          data_collection JSONB,
          data_sharing JSONB,
          retention TEXT,
          user_rights JSONB,
          score INTEGER,
          score_explanation TEXT,
          red_flags JSONB,
          compliance JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL,
          last_checked TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
      
      // Create index on URL for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_url ON policies (url)
      `);
      
      // Create index on domain for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_domain ON policies (domain)
      `);
      
      // Create policy requests table for analytics
      await pool.query(`
        CREATE TABLE IF NOT EXISTS policy_requests (
          id SERIAL PRIMARY KEY,
          url TEXT NOT NULL,
          policy_id INTEGER,
          user_id INTEGER,
          user_agent TEXT,
          ip_address TEXT,
          cached BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
      
      // Create analytics events table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id SERIAL PRIMARY KEY,
          event_type TEXT NOT NULL,
          data JSONB,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
      
      logger.info('Database schema initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing database schema:', error);
      throw error;
    }
  }
};

module.exports = policyModel;