// src/utils/aiAnalyzer.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../middleware/errorHandler');
const cache = require('./cacheManager');

// Initialize Gemini AI provider
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/**
 * AI-based privacy policy analyzer using Google's Gemini
 */
class AIAnalyzer {
  constructor() {
    // Check if Gemini is configured
    this.hasGemini = !!genAI;
    
    if (!this.hasGemini) {
      logger.error('Gemini API not configured. Set GEMINI_API_KEY in environment variables.');
    } else {
      logger.info('Gemini AI analyzer initialized successfully');
    }
  }
  
  /**
   * Analyze a privacy policy using Gemini
   */
  async analyzePrivacyPolicy(policyData) {
    logger.info(`Starting Gemini analysis for ${policyData.url}`);
    const startTime = Date.now();
    
    try {
      // Verify Gemini is available
      if (!this.hasGemini) {
        throw new Error('Gemini API key not configured');
      }
      
      // Check cache first
      const cacheKey = `policy_analysis_${policyData.url}`;
      const cachedAnalysis = await cache.get(cacheKey);
      
      if (cachedAnalysis) {
        logger.info(`Using cached analysis for ${policyData.url}`);
        return cachedAnalysis;
      }
      
      // Analyze with Gemini
      logger.info(`Analyzing with Gemini`);
      const result = await this.analyzeWithGemini(policyData);
      
      // Cache successful result
      await cache.set(cacheKey, result, 60 * 60 * 24 * 7); // Cache for 7 days
      
      const processingTime = Date.now() - startTime;
      logger.info(`Analysis completed in ${processingTime}ms using Gemini`);
      
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Analysis failed after ${processingTime}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Analyze with Gemini
   */
  async analyzeWithGemini(policyData) {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ]
    });
    
    // Prepare text
    const maxTextLength = 30000;
    const truncatedText = policyData.text.length > maxTextLength 
      ? policyData.text.substring(0, maxTextLength) + "... [text truncated due to length]"
      : policyData.text;
    
    const prompt = this.buildPrompt(policyData, truncatedText);
    
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      return this.parseAIResponse(text);
    } catch (error) {
      logger.error('Gemini API error:', error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
  
  /**
   * Build analysis prompt
   */
  buildPrompt(policyData, text) {
    return `
    You are a privacy policy expert who is analyzing the following privacy policy. Provide a structured response with the following sections:
    
    1. SUMMARY: A concise summary of the privacy policy in 5-7 bullet points.
    2. DATA_COLLECTION: List all types of data collected, categorized by type (personal, device, usage, etc.).
    3. DATA_SHARING: List all third parties data is shared with and why.
    4. RETENTION: How long data is kept.
    5. USER_RIGHTS: What rights users have regarding their data.
    6. SCORE: A privacy-friendliness score from 0-100, with a brief explanation.
    7. RED_FLAGS: Identify concerning practices or red flags, with explanations.
    8. COMPLIANCE: Assess compliance with major regulations (GDPR, CCPA, etc.)
    
    Format your response in JSON without any other text, following this exact structure:
    {
      "summary": ["point 1", "point 2", ...],
      "dataCollection": {"category1": ["item1", "item2"], "category2": [...]},
      "dataSharing": {"recipient1": "purpose1", "recipient2": "purpose2", ...},
      "retention": "description of retention policy",
      "userRights": ["right1", "right2", ...],
      "score": {"value": number, "explanation": "reason for score"},
      "redFlags": ["flag1", "flag2", ...],
      "compliance": {"GDPR": "assessment", "CCPA": "assessment", ...}
    }
    
    Policy URL: ${policyData.url}
    Policy Title: ${policyData.title}
    Company: ${policyData.company || 'Unknown'}
    Last Updated: ${policyData.lastUpdated || 'Unknown'}
    
    Policy Text:
    ${text}
    `;
  }
  
  /**
   * Parse and validate AI response
   */
  parseAIResponse(text) {
    try {
      // Attempt to parse JSON response
      return JSON.parse(text);
    } catch (parseError) {
      logger.error('Error parsing AI response:', parseError);
      
      // Try to extract JSON if it's embedded in text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          logger.error('Error parsing extracted JSON:', secondError);
        }
      }
      
      // Return fallback structure if parsing fails
      return {
        summary: ["This privacy policy could not be automatically analyzed."],
        dataCollection: {"Unknown": ["Data types could not be determined"]},
        dataSharing: {"Unknown": "Sharing practices could not be determined"},
        retention: "Retention policy could not be determined",
        userRights: ["Rights could not be determined"],
        score: {"value": 0, "explanation": "Analysis failed, manual review required"},
        redFlags: ["Analysis could not complete successfully"],
        compliance: {"General": "Assessment failed, manual review required"}
      };
    }
  }
}

// Export singleton instance
module.exports = new AIAnalyzer();