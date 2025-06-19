// src/utils/aiAnalyzer.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const { logger } = require('../middleware/errorHandler');
const cache = require('./cacheManager');

// Initialize AI providers
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * AI-based privacy policy analyzer with multi-provider support
 */
class AIAnalyzer {
  constructor() {
    // Determine which AI providers are available
    this.hasGemini = !!genAI;
    this.hasOpenAI = !!openai;
    
    if (!this.hasGemini && !this.hasOpenAI) {
      logger.error('No AI providers configured. Set GEMINI_API_KEY or OPENAI_API_KEY in environment variables.');
    } else {
      logger.info(`AI analyzer initialized with providers: ${[
        this.hasGemini ? 'Gemini' : null,
        this.hasOpenAI ? 'OpenAI' : null
      ].filter(Boolean).join(', ')}`);
    }
    
    // Default provider preference
    this.preferredProvider = process.env.PREFERRED_AI_PROVIDER || 'gemini';
  }
  
  /**
   * Analyze a privacy policy using available AI providers
   */
  async analyzePrivacyPolicy(policyData) {
    logger.info(`Starting AI analysis for ${policyData.url}`);
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `policy_analysis_${policyData.url}`;
      const cachedAnalysis = await cache.get(cacheKey);
      
      if (cachedAnalysis) {
        logger.info(`Using cached analysis for ${policyData.url}`);
        return cachedAnalysis;
      }
      
      // Determine which provider to use
      let primaryProvider, fallbackProvider;
      
      if (this.preferredProvider === 'openai' && this.hasOpenAI) {
        primaryProvider = 'openai';
        fallbackProvider = this.hasGemini ? 'gemini' : null;
      } else if (this.hasGemini) {
        primaryProvider = 'gemini';
        fallbackProvider = this.hasOpenAI ? 'openai' : null;
      } else if (this.hasOpenAI) {
        primaryProvider = 'openai';
        fallbackProvider = null;
      } else {
        throw new Error('No AI providers available for analysis');
      }
      
      // Try with primary provider
      try {
        logger.info(`Analyzing with ${primaryProvider}`);
        const result = await this.analyzeWithProvider(primaryProvider, policyData);
        
        // Cache successful result
        await cache.set(cacheKey, result, 60 * 60 * 24 * 7); // Cache for 7 days
        
        const processingTime = Date.now() - startTime;
        logger.info(`Analysis completed in ${processingTime}ms using ${primaryProvider}`);
        
        return result;
      } catch (primaryError) {
        logger.error(`Error with ${primaryProvider}:`, primaryError);
        
        // Try fallback if available
        if (fallbackProvider) {
          logger.info(`Falling back to ${fallbackProvider}`);
          const result = await this.analyzeWithProvider(fallbackProvider, policyData);
          
          // Cache successful fallback result
          await cache.set(cacheKey, result, 60 * 60 * 24 * 7);
          
          const processingTime = Date.now() - startTime;
          logger.info(`Analysis completed with fallback in ${processingTime}ms using ${fallbackProvider}`);
          
          return result;
        }
        
        throw primaryError;
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Analysis failed after ${processingTime}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Analyze with a specific provider
   */
  async analyzeWithProvider(provider, policyData) {
    if (provider === 'gemini') {
      return this.analyzeWithGemini(policyData);
    } else if (provider === 'openai') {
      return this.analyzeWithOpenAI(policyData);
    }
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  /**
   * Analyze with Gemini
   */
  async analyzeWithGemini(policyData) {
    if (!this.hasGemini) {
      throw new Error('Gemini API key not configured');
    }
    
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
   * Analyze with OpenAI
   */
  async analyzeWithOpenAI(policyData) {
    if (!this.hasOpenAI) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Prepare text
    const maxTextLength = 30000;
    const truncatedText = policyData.text.length > maxTextLength 
      ? policyData.text.substring(0, maxTextLength) + "... [text truncated due to length]"
      : policyData.text;
    
    const prompt = this.buildPrompt(policyData, truncatedText);
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a privacy policy analyst expert. Analyze the provided privacy policy and return a structured JSON response with key insights." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });
      
      const responseText = completion.choices[0].message.content;
      return this.parseAIResponse(responseText);
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
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