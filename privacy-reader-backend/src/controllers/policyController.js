const { processPrivacyPolicy } = require('../utils/policyExtractor'); 
const { analyzePrivacyPolicy } = require('../utils/geminiAnalyzer'); 
const policyModel = require('../models/policyModel'); 
/** 
* Analyze a privacy policy URL 
*/ 
const analyzePolicy = async (req, res) => { 
try { 
    const { url } = req.body; 
     
    if (!url) { 
      return res.status(400).json({ error: 'URL is required' }); 
    } 
     
    // Check if we already have this policy analyzed recently (within last week) 
    const existingPolicy = await policyModel.getPolicyByUrl(url); 
    const oneWeekAgo = new Date(); 
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); 
     
    if (existingPolicy && new Date(existingPolicy.last_checked) > oneWeekAgo) { 
      // Return cached analysis 
      return res.json({ 
        policy: existingPolicy, 
        cached: true 
      }); 
    } 
     
    // Process the policy URL 
    const policyData = await processPrivacyPolicy(url); 
     
    // Analyze with Gemini 
    const analysisResult = await analyzePrivacyPolicy(policyData); 
     
    // Save to database 
    const { policyId, isNew } = await policyModel.savePolicy(policyData, 
analysisResult); 
     
    // Get complete policy data 
    const savedPolicy = await policyModel.getPolicyById(policyId); 
     
    res.json({ 
      policy: savedPolicy, 
      cached: false, 
      isNew 
    }); 
  } catch (error) { 
    console.error('Error in analyzePolicy:', error); 
    res.status(500).json({  
      error: 'Failed to analyze policy', 
      message: error.message  
    }); 
  } 
}; 
 
/** 
 * Get policy history 
 */ 
const getPolicyHistory = async (req, res) => { 
  try { 
    const { id } = req.params; 
     
    if (!id) { 
      return res.status(400).json({ error: 'Policy ID is required' }); 
    } 
     
    const history = await policyModel.getPolicyHistory(id); 
    res.json({ history }); 
  } catch (error) { 
    console.error('Error getting policy history:', error); 
    res.status(500).json({ error: 'Failed to get policy history' }); 
  } 
}; 
 
/** 
 * Get policy by ID 
 */ 
const getPolicyById = async (req, res) => { 
  try { 
    const { id } = req.params; 
     
    if (!id) { 
      return res.status(400).json({ error: 'Policy ID is required' }); 
    } 
     
    const policy = await policyModel.getPolicyById(id); 
     
    if (!policy) { 
      return res.status(404).json({ error: 'Policy not found' }); 
    } 
     
    res.json({ policy }); 
  } catch (error) { 
    console.error('Error getting policy by ID:', error); 
    res.status(500).json({ error: 'Failed to get policy' }); 
  } 
}; 
 
module.exports = { 
  analyzePolicy, 
  getPolicyHistory, 
  getPolicyById 
};
