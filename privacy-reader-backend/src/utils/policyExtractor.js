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
 * Fetches privacy policy content from URL with enhanced request options
 */
const fetchPolicyContent = async (policyUrl) => {
  try {
    // Determine if we should use the proxy for this URL
    const domain = extractDomain(policyUrl);
    const useProxy = ['facebook.com', 'instagram.com', 'whatsapp.com', 'twitter.com', 'x.com'].some(
      blockedDomain => domain && domain.includes(blockedDomain)
    );
    
    if (useProxy) {
      console.log(`Using proxy server for blocked domain: ${domain}`);
      
      // Use our proxy endpoint instead of direct fetch
      const proxyUrl = process.env.PROXY_URL || 'http://localhost:3000/api/proxy/fetch';
      const proxyResponse = await axios.post(proxyUrl, { url: policyUrl });
      
      if (proxyResponse.data && proxyResponse.data.content) {
        console.log(`Successfully fetched content via proxy for ${policyUrl}`);
        return proxyResponse.data.content;
      } else {
        throw new Error(`Proxy returned invalid response for ${policyUrl}`);
      }
    }
    
    // Standard direct request for non-blocked domains
    // Use a more browser-like user agent
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    // Set additional headers that browsers typically send
    const response = await axios.get(policyUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.google.com/'
      },
      timeout: 15000, // Increase timeout to 15 seconds
      maxRedirects: 5, // Allow up to 5 redirects
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching policy:', error);
    
    // Provide more detailed error information for debugging
    const errorMessage = error.response 
      ? `Failed to fetch policy from ${policyUrl}: Status ${error.response.status}` 
      : `Failed to fetch policy from ${policyUrl}: ${error.message}`;
    
    throw new Error(errorMessage);
  }
};

/**
 * Extracts text content from HTML with improved selectors
 */
const extractTextFromHtml = (html) => {
  const $ = cheerio.load(html);
  
  // Remove script, style, meta, link, noscript elements
  $('script, style, meta, link, noscript, svg, iframe').remove();
  
  // Look for common privacy policy containers with expanded selectors
  let policyContent = '';
  const possibleContainers = [
    'main',
    'article',
    '.privacy-policy',
    '.privacy',
    '#privacy-policy',
    '#privacy',
    '.container',
    '.content',
    '#content',
    '[data-testid="privacy-policy"]',  // Facebook-specific
    '[role="main"]',                   // Many modern sites use this ARIA role
    '.policy-text',
    '.legal-content',
    '.terms-content'
  ];
  
  // Try to find the policy container
  for (const container of possibleContainers) {
    if ($(container).length) {
      const containerText = $(container).text();
      if (containerText.length > policyContent.length) {
        policyContent = containerText;
      }
    }
  }
  
  // If no container found or content is too short, get the body text
  if (!policyContent || policyContent.length < 1000) {
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
  
  // Try to find a more specific title first
  const policyTitle = $('h1:contains("Privacy")').first().text() || 
                      $('h1:contains("Policy")').first().text() ||
                      $('title').text();
  
  return policyTitle.trim();
};

/**
 * Main function to process a privacy policy URL
 */
const processPrivacyPolicy = async (policyUrl) => {
  try {
    console.log(`Processing policy URL: ${policyUrl}`);
    
    const domain = extractDomain(policyUrl);
    const html = await fetchPolicyContent(policyUrl);
    
    if (!html || html.length < 100) {
      throw new Error(`Retrieved HTML content is too short or empty from ${policyUrl}`);
    }
    
    console.log(`Successfully fetched HTML from ${policyUrl} (length: ${html.length})`);
    
    const text = extractTextFromHtml(html);
    const title = extractPageTitle(html);
    
    if (!text || text.length < 200) {
      throw new Error(`Failed to extract meaningful text content from ${policyUrl}`);
    }
    
    console.log(`Successfully extracted text (length: ${text.length}) and title: "${title}"`);
    
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