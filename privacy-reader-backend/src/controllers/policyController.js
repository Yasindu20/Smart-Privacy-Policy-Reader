// src/controllers/policyController.js
const aiAnalyzer = require('../utils/aiAnalyzer');
const policyExtractor = require('../utils/policyExtractor');
const policyModel = require('../models/policyModel');
const cache = require('../utils/cacheManager');
const { logger, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { isProbablyPrivacyPolicy } = require('../utils/policyExtractor');

/**
 * Analyze a privacy policy URL
 */
const analyzePolicy = async (req, res, next) => {
  const startTime = Date.now();
  const { url } = req.body;
  const options = req.body.options || {};
  
  try {
    if (!url) {
      throw new ValidationError('URL is required');
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      throw new ValidationError(`Invalid URL format: ${url}`);
    }
    
    logger.info(`Received analysis request for URL: ${url}`, {
      userId: req.user?.id || 'anonymous',
      options
    });
    
    // Force fresh analysis if requested
    const forceFresh = options.forceFresh === true;
    
    if (!forceFresh) {
      // Check if we already have this policy analyzed recently (within last week)
      const existingPolicy = await policyModel.getPolicyByUrl(url);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      if (existingPolicy && new Date(existingPolicy.last_checked) > oneWeekAgo) {
        logger.info(`Returning cached analysis for ${url}`);
        
        // Track this request
        await policyModel.trackAnalysisRequest({
          url,
          userId: req.user?.id || null,
          cached: true,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        });
        
        // Return cached analysis
        return res.json({
          policy: existingPolicy,
          cached: true
        });
      }
    }
    
    // Process the policy URL
    logger.info(`Fetching and processing policy from ${url}`);
    
    // Update request status
    res.status(202);
    
    try {
      // Process the policy (fetch and extract text)
      const policyData = await policyExtractor.processPrivacyPolicy(url);
      
      // Validate content extraction
      if (!policyData.text || policyData.text.length < 200) {
        throw new ValidationError(`Insufficient text content extracted from ${url}`);
      }
      
      // Validate policy detection
      if (!isProbablyPrivacyPolicy(url, policyData.text)) {
        logger.warn(`URL ${url} may not be a privacy policy`);
        // We continue but add a warning flag
        policyData.warning = "This URL may not be a privacy policy";
      }
      
      logger.info(`Successfully processed policy. Text length: ${policyData.text.length}`);
      
      // Analyze with AI
      logger.info('Analyzing policy content with AI...');
      const analysisResult = await aiAnalyzer.analyzePrivacyPolicy(policyData);
      
      // Save to database
      logger.info('Saving analysis results to database...');
      const { policyId, isNew } = await policyModel.savePolicy(policyData, analysisResult);
      
      // Get complete policy data
      const savedPolicy = await policyModel.getPolicyById(policyId);
      
      // Track this request
      await policyModel.trackAnalysisRequest({
        url,
        userId: req.user?.id || null,
        policyId,
        cached: false,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      });
      
      const processingTime = Date.now() - startTime;
      logger.info(`Analysis complete for ${url}. Policy ID: ${policyId}. Time: ${processingTime}ms`);
      
      res.status(200).json({
        policy: savedPolicy,
        cached: false,
        isNew,
        processingTime
      });
    } catch (processingError) {
      logger.error(`Error processing policy ${url}:`, processingError);
      next(processingError);
    }
  } catch (error) {
    logger.error(`Error in analyzePolicy for ${url || 'unknown url'}:`, error);
    next(error);
  }
};

/**
 * Get policy history
 */
const getPolicyHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Policy ID is required');
    }
    
    logger.info(`Getting history for policy ID: ${id}`);
    
    const history = await policyModel.getPolicyHistory(id);
    
    if (!history || history.length === 0) {
      throw new NotFoundError(`No history found for policy ID: ${id}`);
    }
    
    res.json({ history });
  } catch (error) {
    logger.error(`Error getting policy history for ID ${req.params.id || 'unknown'}:`, error);
    next(error);
  }
};

/**
 * Get policy by ID
 */
const getPolicyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Policy ID is required');
    }
    
    logger.info(`Getting policy by ID: ${id}`);
    
    const policy = await policyModel.getPolicyById(id);
    
    if (!policy) {
      throw new NotFoundError(`Policy not found for ID: ${id}`);
    }
    
    res.json({ policy });
  } catch (error) {
    logger.error(`Error getting policy by ID ${req.params.id || 'unknown'}:`, error);
    next(error);
  }
};

/**
 * Get policies by domain
 */
const getPoliciesByDomain = async (req, res, next) => {
  try {
    const { domain } = req.params;
    
    if (!domain) {
      throw new ValidationError('Domain is required');
    }
    
    logger.info(`Getting policies for domain: ${domain}`);
    
    const policies = await policyModel.getPoliciesByDomain(domain);
    
    res.json({ policies });
  } catch (error) {
    logger.error(`Error getting policies by domain ${req.params.domain || 'unknown'}:`, error);
    next(error);
  }
};

/**
 * Compare two policies
 */
const comparePolicies = async (req, res, next) => {
  try {
    const { policyId1, policyId2 } = req.params;
    
    if (!policyId1 || !policyId2) {
      throw new ValidationError('Two policy IDs are required');
    }
    
    logger.info(`Comparing policies: ${policyId1} and ${policyId2}`);
    
    // Get both policies
    const [policy1, policy2] = await Promise.all([
      policyModel.getPolicyById(policyId1),
      policyModel.getPolicyById(policyId2)
    ]);
    
    if (!policy1) {
      throw new NotFoundError(`Policy not found for ID: ${policyId1}`);
    }
    
    if (!policy2) {
      throw new NotFoundError(`Policy not found for ID: ${policyId2}`);
    }
    
    // Generate comparison
    const comparison = {
      policies: [
        { id: policy1.id, url: policy1.url, title: policy1.title },
        { id: policy2.id, url: policy2.url, title: policy2.title }
      ],
      scoreDifference: policy1.score - policy2.score,
      dataCollectionDifferences: compareDataCollection(policy1, policy2),
      dataSharingDifferences: compareDataSharing(policy1, policy2),
      retentionComparison: policy1.retention !== policy2.retention,
      userRightsDifferences: compareArrays(policy1.user_rights, policy2.user_rights),
      redFlagsDifferences: compareArrays(policy1.red_flags, policy2.red_flags)
    };
    
    res.json({ comparison });
  } catch (error) {
    logger.error(`Error comparing policies ${req.params.policyId1 || 'unknown'} and ${req.params.policyId2 || 'unknown'}:`, error);
    next(error);
  }
};

/**
 * Helper to compare data collection objects
 */
const compareDataCollection = (policy1, policy2) => {
  try {
    const collection1 = typeof policy1.data_collection === 'string' 
      ? JSON.parse(policy1.data_collection) 
      : policy1.data_collection;
      
    const collection2 = typeof policy2.data_collection === 'string' 
      ? JSON.parse(policy2.data_collection) 
      : policy2.data_collection;
    
    const differences = {};
    
    // Find categories in policy1 but not in policy2
    Object.keys(collection1).forEach(category => {
      if (!collection2[category]) {
        differences[`${category} (only in first policy)`] = collection1[category];
      } else {
        // Find items in this category that differ
        const uniqueItems = collection1[category].filter(item => !collection2[category].includes(item));
        if (uniqueItems.length > 0) {
          differences[`${category} (additional in first policy)`] = uniqueItems;
        }
      }
    });
    
    // Find categories in policy2 but not in policy1
    Object.keys(collection2).forEach(category => {
      if (!collection1[category]) {
        differences[`${category} (only in second policy)`] = collection2[category];
      } else {
        // Find items in this category that differ
        const uniqueItems = collection2[category].filter(item => !collection1[category].includes(item));
        if (uniqueItems.length > 0) {
          differences[`${category} (additional in second policy)`] = uniqueItems;
        }
      }
    });
    
    return differences;
  } catch (error) {
    logger.error('Error comparing data collection:', error);
    return { error: 'Could not compare data collection' };
  }
};

/**
 * Helper to compare data sharing objects
 */
const compareDataSharing = (policy1, policy2) => {
  try {
    const sharing1 = typeof policy1.data_sharing === 'string' 
      ? JSON.parse(policy1.data_sharing) 
      : policy1.data_sharing;
      
    const sharing2 = typeof policy2.data_sharing === 'string' 
      ? JSON.parse(policy2.data_sharing) 
      : policy2.data_sharing;
    
    const differences = {};
    
    // Find recipients in policy1 but not in policy2
    Object.keys(sharing1).forEach(recipient => {
      if (!sharing2[recipient]) {
        differences[`${recipient} (only in first policy)`] = sharing1[recipient];
      } else if (sharing1[recipient] !== sharing2[recipient]) {
        differences[`${recipient} (different purposes)`] = {
          policy1: sharing1[recipient],
          policy2: sharing2[recipient]
        };
      }
    });
    
    // Find recipients in policy2 but not in policy1
    Object.keys(sharing2).forEach(recipient => {
      if (!sharing1[recipient]) {
        differences[`${recipient} (only in second policy)`] = sharing2[recipient];
      }
    });
    
    return differences;
  } catch (error) {
    logger.error('Error comparing data sharing:', error);
    return { error: 'Could not compare data sharing' };
  }
};

/**
 * Helper to compare arrays
 */
const compareArrays = (array1, array2) => {
  try {
    const arr1 = typeof array1 === 'string' ? JSON.parse(array1) : array1;
    const arr2 = typeof array2 === 'string' ? JSON.parse(array2) : array2;
    
    return {
      onlyInFirst: arr1.filter(item => !arr2.includes(item)),
      onlyInSecond: arr2.filter(item => !arr1.includes(item)),
      inBoth: arr1.filter(item => arr2.includes(item))
    };
  } catch (error) {
    logger.error('Error comparing arrays:', error);
    return { error: 'Could not compare arrays' };
  }
};

module.exports = {
  analyzePolicy,
  getPolicyHistory,
  getPolicyById,
  getPoliciesByDomain,
  comparePolicies
};