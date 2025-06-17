const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize the Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyzes a privacy policy using Google's Gemini API
 */
const analyzePrivacyPolicy = async (policyData) => {
  try {
    console.log(`Initializing Gemini analysis for: ${policyData.url}`);
    
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
    
    // Prepare a truncated version of the text if it's too long
    const maxTextLength = 30000; // Gemini has token limits
    const truncatedText = policyData.text.length > maxTextLength 
      ? policyData.text.substring(0, maxTextLength) + "... [text truncated due to length]"
      : policyData.text;
    
    const prompt = `
    You are a privacy policy expert who is analyzing the following privacy policy. Provide a structured response with the following sections:
    
    1. SUMMARY: A concise summary of the privacy policy in 5-7 bullet points.
    2. DATA_COLLECTION: List all types of data collected, categorized by type (personal, device, usage, etc.).
    3. DATA_SHARING: List all third parties data is shared with and why.
    4. RETENTION: How long data is kept.
    5. USER_RIGHTS: What rights users have regarding their data.
    6. SCORE: A privacy-friendliness score from 0-100, with a brief explanation.
    7. RED_FLAGS: Identify concerning practices or red flags, with explanations.
    
    Format your response in JSON without any other text, following this exact structure:
    {
      "summary": ["point 1", "point 2", ...],
      "dataCollection": {"category1": ["item1", "item2"], "category2": [...]},
      "dataSharing": {"recipient1": "purpose1", "recipient2": "purpose2", ...},
      "retention": "description of retention policy",
      "userRights": ["right1", "right2", ...],
      "score": {"value": number, "explanation": "reason for score"},
      "redFlags": ["flag1", "flag2", ...]
    }
    
    Policy URL: ${policyData.url}
    Policy Title: ${policyData.title}
    
    Policy Text:
    ${truncatedText}
    `;
    
    console.log(`Sending request to Gemini API. Text length: ${truncatedText.length}`);
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log(`Received response from Gemini API. Response length: ${text.length}`);
    
    try {
      // Parse the JSON response
      return JSON.parse(text);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.log('Gemini raw response:', text.substring(0, 500) + '...');
      
      // Attempt to extract JSON from text if it's not pure JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          console.error('Error parsing extracted JSON:', secondError);
        }
      }
      
      // If all parsing fails, return a fallback structure
      return {
        summary: ["This privacy policy could not be automatically analyzed."],
        dataCollection: {"Unknown": ["Data types could not be determined"]},
        dataSharing: {"Unknown": "Sharing practices could not be determined"},
        retention: "Retention policy could not be determined",
        userRights: ["Rights could not be determined"],
        score: {"value": 0, "explanation": "Analysis failed, manual review required"},
        redFlags: ["Analysis could not complete successfully"]
      };
    }
  } catch (error) {
    console.error('Error analyzing policy with Gemini:', error);
    throw new Error(`Gemini API error: ${error.message}`);
  }
};

module.exports = {
  analyzePrivacyPolicy,
};