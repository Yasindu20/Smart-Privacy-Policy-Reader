const db = require('../config/db');

/**
 * Save a new policy or update an existing one
 */
const savePolicy = async (policyData, analysisResult) => {
  const client = await db.connect(); // Get a client from the pool
  await client.query('BEGIN'); // Start transaction

  try {
    // Check if policy exists
    const existingPolicy = await client.query(
      'SELECT id FROM policies WHERE url = $1',
      [policyData.url]
    );

    let policyId;
    let isNew = false;

    if (existingPolicy.rows.length > 0) {
      // Update existing policy
      policyId = existingPolicy.rows[0].id;

      // Get current policy before updating
      const currentPolicy = await client.query(
        'SELECT raw_text, summary, score FROM policies WHERE id = $1',
        [policyId]
      );

      // Save to history if content changed
      if (currentPolicy.rows[0].raw_text !== policyData.text) {
        await client.query(
          'INSERT INTO policy_history(policy_id, raw_text, summary, score, changes_detected) VALUES($1, $2, $3, $4, $5)',
          [
            policyId,
            currentPolicy.rows[0].raw_text,
            currentPolicy.rows[0].summary,
            currentPolicy.rows[0].score,
            true
          ]
        );
      }

      // Update the policy
      await client.query(
        `UPDATE policies  
        SET raw_text = $1,  
        title = $2, 
        summary = $3,  
        score = $4,  
        data_collected = $5,  
        data_sharing = $6,  
        retention_period = $7,  
        user_rights = $8,  
        red_flags = $9, 
        last_checked = CURRENT_TIMESTAMP 
        WHERE id = $10`,
        [
          policyData.text,
          policyData.title,
          JSON.stringify(analysisResult.summary),
          analysisResult.score.value,
          JSON.stringify(analysisResult.dataCollection),
          JSON.stringify(analysisResult.dataSharing),
          analysisResult.retention,
          JSON.stringify(analysisResult.userRights),
          JSON.stringify(analysisResult.redFlags),
          policyId
        ]
      );
    } else {
      // Insert new policy
      isNew = true;
      const result = await client.query(
        `INSERT INTO policies( 
          url, domain, title, raw_text, summary, score,  
          data_collected, data_sharing, retention_period, user_rights, red_flags 
        )  
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)  
        RETURNING id`,
        [
          policyData.url,
          policyData.domain,
          policyData.title,
          policyData.text,
          JSON.stringify(analysisResult.summary),
          analysisResult.score.value,
          JSON.stringify(analysisResult.dataCollection),
          JSON.stringify(analysisResult.dataSharing),
          analysisResult.retention,
          JSON.stringify(analysisResult.userRights),
          JSON.stringify(analysisResult.redFlags)
        ]
      );

      policyId = result.rows[0].id;
    }

    await client.query('COMMIT'); // Commit the transaction
    return {
      policyId,
      isNew
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback the transaction on error
    console.error('Database error:', error);
    throw error; // Rethrow the error for further handling
  } finally {
    client.release(); // Release the client back to the pool
  }
};

/**
 * Get a policy by URL
 */
const getPolicyByUrl = async (url) => {
  try {
    const result = await db.query(
      'SELECT * FROM policies WHERE url = $1',
      [url]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching policy by URL:', error);
    throw error;
  }
};

/**
 * Get a policy by ID
 */
const getPolicyById = async (id) => {
  try {
    const result = await db.query(
      'SELECT * FROM policies WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching policy by ID:', error);
    throw error;
  }
};

/**
 * Get policy history
 */
const getPolicyHistory = async (policyId) => {
  try {
    const result = await db.query(
      'SELECT * FROM policy_history WHERE policy_id = $1 ORDER BY snapshot_date DESC',
      [policyId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching policy history:', error);
    throw error;
  }
};

module.exports = {
  savePolicy,
  getPolicyByUrl,
  getPolicyById,
  getPolicyHistory
};
