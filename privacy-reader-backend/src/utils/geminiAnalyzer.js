const { GoogleGenerativeAI } = require('@google/generative-ai'); 
require('dotenv').config(); 
 
// Initialize the Gemini API 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 
 
/** 
 * Analyzes a privacy policy using Google's Gemini API 
 */ 
const analyzePrivacyPolicy = async (policyData) => { 
  try { 
    const model = genAI.getGenerativeModel({ model: "gemini-pro" }); 
     
    const prompt = ` 
    Analyze this privacy policy and provide a structured response with the 
following sections: 
     
    1. SUMMARY: A concise summary of the privacy policy in 5-7 bullet points. 
    2. DATA_COLLECTION: List all types of data collected, categorized by type 
(personal, device, usage, etc.). 
    3. DATA_SHARING: List all third parties data is shared with and why. 
    4. RETENTION: How long data is kept. 
    5. USER_RIGHTS: What rights users have regarding their data. 
    6. SCORE: A privacy-friendliness score from 0-100, with a brief explanation. 
    7. RED_FLAGS: Identify concerning practices or red flags, with explanations. 
     
    Format your response in JSON without any other text, following this exact 
structure: 
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
    ${policyData.text} 
    `; 
     
    const result = await model.generateContent(prompt); 
    const response = result.response; 
    const text = response.text(); 
     
    try { 
      // Parse the JSON response 
      return JSON.parse(text); 
    } catch (parseError) { 
      console.error('Error parsing Gemini response:', parseError); 
       
      // Attempt to extract JSON from text if it's not pure JSON 
      const jsonMatch = text.match(/\{[\s\S]*\}/); 
      if (jsonMatch) { 
        return JSON.parse(jsonMatch[0]); 
      } 
       
      throw new Error('Invalid response format from Gemini API'); 
    } 
  } catch (error) { 
    console.error('Error analyzing policy with Gemini:', error); 
    throw error; 
  } 
}; 
 
module.exports = { 
  analyzePrivacyPolicy, 
};