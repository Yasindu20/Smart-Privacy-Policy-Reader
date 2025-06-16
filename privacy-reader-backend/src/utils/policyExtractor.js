const axios = require('axios'); 
const cheerio = require('cheerio'); 
const url = require('url'); 
 
/** 
 * Extracts domain from URL 
 */ 
const extractDomain = (urlString) => { 
  try { 
    const parsedUrl = new URL(urlString); 
    return parsedUrl.hostname; 
  } catch (error) { 
    console.error('Error parsing URL:', error); 
    return null; 
  } 
}; 
 
/** 
 * Fetches privacy policy content from URL 
 */ 
const fetchPolicyContent = async (policyUrl) => { 
  try { 
    const response = await axios.get(policyUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 
      }, 
    }); 
     
    return response.data; 
  } catch (error) { 
    console.error('Error fetching policy:', error); 
    throw new Error(`Failed to fetch policy from ${policyUrl}`); 
  } 
}; 
 
/** 
* Extracts text content from HTML 
*/ 
const extractTextFromHtml = (html) => { 
const $ = cheerio.load(html); 
// Remove script and style elements 
$('script, style, meta, link, noscript').remove(); 
// Look for common privacy policy containers 
let policyContent = ''; 
const possibleContainers = [ 
'main',  
'article',  
'.privacy-policy',  
'.privacy',  
'#privacy-policy', 
'.container', 
'.content', 
'#content' 
]; 
// Try to find the policy container 
for (const container of possibleContainers) { 
if ($(container).length) { 
policyContent = $(container).text(); 
break; 
} 
} 
// If no container found, get the body text 
if (!policyContent) { 
policyContent = $('body').text(); 
} 
// Clean up the text 
return policyContent 
.replace(/\s+/g, ' ') 
.replace(/\n+/g, '\n') 
.trim(); 
}; 
/** 
* Extracts title of the page 
*/ 
const extractPageTitle = (html) => { 
const $ = cheerio.load(html); 
return $('title').text().trim(); 
}; 
/** 
* Main function to process a privacy policy URL 
*/ 
const processPrivacyPolicy = async (policyUrl) => { 
try { 
const domain = extractDomain(policyUrl); 
const html = await fetchPolicyContent(policyUrl); 
const text = extractTextFromHtml(html); 
const title = extractPageTitle(html); 
// Limit text length for API processing 
const truncatedText = text.slice(0, 100000); 
return { 
url: policyUrl, 
domain, 
title, 
text: truncatedText, 
}; 
} catch (error) { 
console.error('Error processing policy:', error); 
throw error; 
} 
}; 
module.exports = { 
  processPrivacyPolicy, 
  extractDomain, 
};
